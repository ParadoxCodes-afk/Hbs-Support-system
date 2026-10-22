// Copyright (c) 2026, HBS and contributors
// For license information, please see license.txt

frappe.listview_settings['support_ticket_ledger'] = {
    hide_name_column: false,

    onload: function(listview) {
        listview.page.add_inner_button(__('📊 HBS AMC Report'), function() {
            frappe.set_route('query-report', 'HBS AMC Report');
        });

        frappe.call({
            method: 'hbs_ticket_system.hbs_support_system.doctype.support_ticket.support_ticket.get_support_user_settings',
            callback: function(r) {
                const settings = r.message || {};
                if (settings.can_import_excel || settings.is_owner || settings.is_admin) {
                    listview.page.add_button(__('Import Excel'), function() {
                        show_ledger_excel_import_dialog(listview);
                    }, {
                        btn_class: 'btn-primary'
                    });
                }
            }
        });
    }
};

function show_ledger_excel_import_dialog(listview) {
    let dialog = new frappe.ui.Dialog({
        title: __('📥 Import Support Ticket Ledger (Excel)'),
        size: 'large',
        fields: [
            {
                fieldname: 'info_html',
                fieldtype: 'HTML',
                options: `
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; margin-bottom: 15px; font-size: 13px; color: #334155;">
                        <div style="font-weight: 600; color: #0f172a; margin-bottom: 4px;">
                            📋 Supported Format (.xlsx / .xls)
                        </div>
                        <div>
                            Matches standard contract reports containing:
                            <code style="background: #e2e8f0; padding: 2px 5px; border-radius: 4px;">Serial No</code>,
                            <code style="background: #e2e8f0; padding: 2px 5px; border-radius: 4px;">Party Name</code>,
                            <code style="background: #e2e8f0; padding: 2px 5px; border-radius: 4px;">Company Name</code>,
                            <code style="background: #e2e8f0; padding: 2px 5px; border-radius: 4px;">Contact Person</code>,
                            <code style="background: #e2e8f0; padding: 2px 5px; border-radius: 4px;">Mobile / Phone</code>,
                            <code style="background: #e2e8f0; padding: 2px 5px; border-radius: 4px;">Starts From</code>,
                            <code style="background: #e2e8f0; padding: 2px 5px; border-radius: 4px;">Expiry Date</code>,
                            <code style="background: #e2e8f0; padding: 2px 5px; border-radius: 4px;">Total Amount</code>,
                            <code style="background: #e2e8f0; padding: 2px 5px; border-radius: 4px;">Sold By</code>,
                            <code style="background: #e2e8f0; padding: 2px 5px; border-radius: 4px;">Installed By</code>.
                        </div>
                    </div>
                `
            },
            {
                fieldname: 'excel_file',
                fieldtype: 'Attach',
                label: __('Select Excel File (.xlsx / .xls)'),
                reqd: 1
            },
            {
                fieldname: 'progress_section',
                fieldtype: 'HTML',
                options: `
                    <div id="import-progress-container" style="display: none; margin-top: 15px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <span id="import-status-text" style="font-weight: 600; font-size: 13px; color: #1e293b;">
                                Reading Excel file...
                            </span>
                            <span id="import-progress-percentage" style="font-weight: 700; font-size: 13px; color: #2563eb;">
                                0%
                            </span>
                        </div>
                        <div class="progress" style="height: 12px; background: #e2e8f0; border-radius: 6px; overflow: hidden; margin-bottom: 12px;">
                            <div id="import-progress-bar" class="progress-bar progress-bar-striped progress-bar-animated"
                                 role="progressbar" style="width: 0%; background-color: #2563eb; transition: width 0.3s ease;">
                            </div>
                        </div>
                        <div id="import-counter-text" style="font-size: 12px; color: #64748b; text-align: center;">
                            Processed 0 of 0 rows
                        </div>
                    </div>

                    <div id="import-result-container" style="display: none; margin-top: 15px;">
                        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 15px;">
                            <div style="background: #f1f5f9; border-radius: 6px; padding: 10px; text-align: center;">
                                <div style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600;">Total</div>
                                <div id="res-total" style="font-size: 18px; font-weight: 700; color: #0f172a;">0</div>
                            </div>
                            <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; padding: 10px; text-align: center;">
                                <div style="font-size: 11px; color: #065f46; text-transform: uppercase; font-weight: 600;">✅ Inserted</div>
                                <div id="res-inserted" style="font-size: 18px; font-weight: 700; color: #059669;">0</div>
                            </div>
                            <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 10px; text-align: center;">
                                <div style="font-size: 11px; color: #1e40af; text-transform: uppercase; font-weight: 600;">🔄 Updated</div>
                                <div id="res-updated" style="font-size: 18px; font-weight: 700; color: #2563eb;">0</div>
                            </div>
                            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 10px; text-align: center;">
                                <div style="font-size: 11px; color: #991b1b; text-transform: uppercase; font-weight: 600;">❌ Errors</div>
                                <div id="res-errors" style="font-size: 18px; font-weight: 700; color: #dc2626;">0</div>
                            </div>
                        </div>

                        <div id="import-error-table-container" style="display: none; max-height: 250px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 12px;">
                            <table class="table table-bordered table-sm table-hover" style="font-size: 12px; margin: 0;">
                                <thead style="background: #fef2f2; position: sticky; top: 0;">
                                    <tr>
                                        <th style="width: 50px;">Row</th>
                                        <th style="width: 110px;">Serial No</th>
                                        <th style="width: 160px;">Party Name</th>
                                        <th>Reason</th>
                                    </tr>
                                </thead>
                                <tbody id="import-error-table-body"></tbody>
                            </table>
                        </div>

                        <div style="display: flex; justify-content: flex-end; gap: 8px;">
                            <button id="btn-download-error-csv" class="btn btn-default btn-sm" style="display: none;">
                                <i class="fa fa-download"></i> ${__('Download Error Log')}
                            </button>
                        </div>
                    </div>
                `
            }
        ],
        primary_action_label: __('Start Import'),
        primary_action: function(values) {
            let file_url = values.excel_file;
            if (!file_url) {
                frappe.msgprint(__('Please select an Excel file.'));
                return;
            }

            dialog.get_primary_btn().prop('disabled', true).text(__('Importing...'));
            dialog.$wrapper.find('#import-progress-container').show();
            dialog.$wrapper.find('#import-result-container').hide();
            dialog.$wrapper.find('#import-status-text').text(__('Uploading and analyzing Excel file...'));

            frappe.call({
                method: 'hbs_ticket_system.hbs_support_system.doctype.support_ticket_ledger.ledger_importer.prepare_import',
                args: { file_url: file_url },
                callback: function(r) {
                    if (r.exc || !r.message) {
                        dialog.get_primary_btn().prop('disabled', false).text(__('Start Import'));
                        frappe.msgprint(__('Failed to parse Excel file.'));
                        return;
                    }
                    let res = r.message;
                    let batch_token = res.batch_token;
                    let total_rows = res.total_rows;

                    dialog.$wrapper.find('#import-counter-text').text(`Processed 0 of ${total_rows} rows`);
                    run_batch_import(dialog, listview, batch_token, 0, total_rows, 50, 0, 0, []);
                },
                error: function() {
                    dialog.get_primary_btn().prop('disabled', false).text(__('Start Import'));
                }
            });
        }
    });

    dialog.show();
}

function run_batch_import(dialog, listview, batch_token, start_idx, total_rows, batch_size, total_inserted, total_updated, all_errors) {
    frappe.call({
        method: 'hbs_ticket_system.hbs_support_system.doctype.support_ticket_ledger.ledger_importer.process_import_batch',
        args: {
            batch_token: batch_token,
            start_idx: start_idx,
            batch_size: batch_size
        },
        callback: function(r) {
            if (r.exc || !r.message) {
                frappe.msgprint(__('Batch import failed at row {0}', [start_idx + 1]));
                finish_import_display(dialog, listview, total_rows, total_inserted, total_updated, all_errors);
                return;
            }

            let msg = r.message;
            total_inserted += msg.inserted || 0;
            total_updated += msg.updated || 0;
            if (msg.errors && msg.errors.length) {
                all_errors = all_errors.concat(msg.errors);
            }

            let end_idx = msg.end_idx;
            let progress_pct = msg.progress_pct;

            dialog.$wrapper.find('#import-progress-bar').css('width', progress_pct + '%');
            dialog.$wrapper.find('#import-progress-percentage').text(progress_pct + '%');
            dialog.$wrapper.find('#import-status-text').text(__('Processing records... ({0} inserted, {1} updated)', [total_inserted, total_updated]));
            dialog.$wrapper.find('#import-counter-text').text(`Processed ${end_idx} of ${total_rows} rows`);

            if (msg.is_complete || end_idx >= total_rows) {
                finish_import_display(dialog, listview, total_rows, total_inserted, total_updated, all_errors);
            } else {
                run_batch_import(dialog, listview, batch_token, end_idx, total_rows, batch_size, total_inserted, total_updated, all_errors);
            }
        },
        error: function() {
            finish_import_display(dialog, listview, total_rows, total_inserted, total_updated, all_errors);
        }
    });
}

function finish_import_display(dialog, listview, total_rows, inserted, updated, errors) {
    dialog.$wrapper.find('#import-progress-bar').removeClass('progress-bar-animated').addClass('bg-success');
    dialog.$wrapper.find('#import-status-text').text(__('✅ Import Completed'));
    dialog.$wrapper.find('#import-progress-percentage').text('100%');

    dialog.$wrapper.find('#import-result-container').slideDown();
    dialog.$wrapper.find('#res-total').text(total_rows);
    dialog.$wrapper.find('#res-inserted').text(inserted);
    dialog.$wrapper.find('#res-updated').text(updated);
    dialog.$wrapper.find('#res-errors').text(errors.length);

    if (errors && errors.length > 0) {
        let rows_html = errors.map(err => `
            <tr>
                <td style="font-weight: 600; text-align: center;">${err.row}</td>
                <td><span style="font-family: monospace; font-weight: 600;">${frappe.utils.escape_html(err.serial_no)}</span></td>
                <td>${frappe.utils.escape_html(err.party_name)}</td>
                <td style="color: #dc2626;">${frappe.utils.escape_html(err.reason)}</td>
            </tr>
        `).join('');

        dialog.$wrapper.find('#import-error-table-body').html(rows_html);
        dialog.$wrapper.find('#import-error-table-container').show();

        dialog.$wrapper.find('#btn-download-error-csv').show().off('click').on('click', function() {
            download_error_csv(errors);
        });
    }

    dialog.get_primary_btn().prop('disabled', false).text(__('Close & Refresh List')).off('click').on('click', function() {
        dialog.hide();
        listview.refresh();
    });
}

function download_error_csv(errors) {
    let csv = ['Row,Serial No,Party Name,Reason'];
    errors.forEach(e => {
        let row = [
            e.row,
            `"${(e.serial_no || '').replace(/"/g, '""')}"`,
            `"${(e.party_name || '').replace(/"/g, '""')}"`,
            `"${(e.reason || '').replace(/"/g, '""')}"`
        ];
        csv.push(row.join(','));
    });

    let blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
    let link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `ledger_import_errors_${frappe.datetime.now_datetime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
