// Copyright (c) 2026, HBS and contributors
// For license information, please see license.txt

frappe.listview_settings['support_ticket_ledger'] = {
    hide_name_column: false,

    button: {
        show: function(doc) {
            return true;
        },
        get_label: function() {
            return __('Contracts');
        },
        get_description: function(doc) {
            return __('Manage Contracts & Renewals');
        },
        action: function(doc) {
            show_manage_contracts_dialog(doc.name);
        }
    },

    onload: function(listview) {
        listview.page.add_inner_button(__('📋 Contract Details Report'), function() {
            frappe.set_route('query-report', 'HBS Contract Details Report');
        });

        frappe.call({
            method: 'hbs_ticket_system.hbs_support_system.doctype.support_ticket.support_ticket.get_support_user_settings',
            callback: function(r) {
                const settings = r.message || {};
                if (settings.can_import_excel || settings.is_owner || settings.is_admin) {
                    listview.page.add_inner_button(__('Import Master'), function() {
                        show_ledger_excel_import_dialog(listview, 'import');
                    }, __('Import'));

                    listview.page.add_inner_button(__('Update Master'), function() {
                        show_ledger_excel_import_dialog(listview, 'update');
                    }, __('Import'));
                }
            }
        });
    }
};

function show_manage_contracts_dialog(ledger_name) {
    frappe.call({
        method: 'hbs_ticket_system.hbs_support_system.doctype.support_ticket_ledger.support_ticket_ledger.get_customer_contracts',
        args: { ledger_name: ledger_name },
        callback: function(r) {
            let contracts = r.message || [];
            frappe.call({
                method: 'frappe.client.get_list',
                args: { doctype: 'support_contract_product', fields: ['name', 'category', 'default_period', 'standard_rate'], limit: 100 },
                callback: function(res) {
                    let products = res.message || [];
                    render_contracts_dialog(ledger_name, contracts, products);
                }
            });
        }
    });
}

function render_contracts_dialog(ledger_name, contracts, products) {
    let product_options = products.map(p => `<option value="${p.name}" data-category="${p.category || 'Other'}" data-period="${p.default_period || 'YEARLY'}" data-rate="${p.standard_rate || 0}">${p.name} (${p.category || 'Other'})</option>`).join('');

    let rows_html = '';
    contracts.forEach((c, idx) => {
        let p_opts = products.map(p => `<option value="${p.name}" data-category="${p.category || 'Other'}" data-period="${p.default_period || 'YEARLY'}" data-rate="${p.standard_rate || 0}" ${p.name === c.product ? 'selected' : ''}>${p.name} (${p.category || 'Other'})</option>`).join('');
        if (!products.some(p => p.name === c.product) && c.product) {
            p_opts = `<option value="${c.product}" selected>${c.product}</option>` + p_opts;
        }

        let is_active = (c.expiry_date && c.expiry_date >= frappe.datetime.nowdate());
        let status_badge = is_active 
            ? `<span class="badge badge-success" style="background:#dcfce7; color:#15803d; padding:3px 8px; border-radius:4px; font-size:11px;">Active</span>`
            : `<span class="badge badge-danger" style="background:#fee2e2; color:#b91c1c; padding:3px 8px; border-radius:4px; font-size:11px;">Expired</span>`;

        rows_html += `
            <tr class="contract-row" data-idx="${idx}" style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 8px 6px;">
                    <select class="form-control input-xs c-product" style="font-size: 12px; height: 28px; width: 140px;">
                        ${p_opts}
                    </select>
                </td>
                <td style="padding: 8px 6px;">
                    <span class="c-category-badge" style="font-size: 11px; font-weight: 600; color: #475569;">${c.category || 'Other'}</span>
                    <input type="hidden" class="c-category" value="${c.category || 'Other'}">
                </td>
                <td style="padding: 8px 6px;">
                    <select class="form-control input-xs c-period" style="font-size: 12px; height: 28px; width: 100px;">
                        <option value="YEARLY" ${c.period === 'YEARLY' ? 'selected' : ''}>Yearly</option>
                        <option value="HALFYEARLY" ${c.period === 'HALFYEARLY' ? 'selected' : ''}>Half Yearly</option>
                        <option value="QUARTERLY" ${c.period === 'QUARTERLY' ? 'selected' : ''}>Quarterly</option>
                        <option value="MONTHLY" ${c.period === 'MONTHLY' ? 'selected' : ''}>Monthly</option>
                    </select>
                </td>
                <td style="padding: 8px 6px;">
                    <input type="date" class="form-control input-xs c-start-date" value="${c.start_date || ''}" style="font-size: 11px; height: 28px; width: 120px;">
                </td>
                <td style="padding: 8px 6px;">
                    <input type="date" class="form-control input-xs c-expiry-date" value="${c.expiry_date || ''}" style="font-size: 11px; height: 28px; width: 120px;">
                </td>
                <td style="padding: 8px 6px; text-align: center;">
                    ${status_badge}
                </td>
                <td style="padding: 8px 6px;">
                    <input type="text" class="form-control input-xs c-visits" value="${frappe.utils.escape_html(c.visits || '')}" placeholder="Visits" style="font-size: 11px; height: 28px; width: 70px;">
                </td>
                <td style="padding: 8px 6px;">
                    <input type="number" class="form-control input-xs c-amount" value="${c.amount || 0}" style="font-size: 12px; height: 28px; width: 90px;">
                </td>
                <td style="padding: 8px 6px;">
                    <input type="text" class="form-control input-xs c-remarks" value="${frappe.utils.escape_html(c.remarks || '')}" placeholder="Invoice / Notes" style="font-size: 11px; height: 28px; width: 120px;">
                </td>
                <td style="padding: 8px 6px; text-align: center;">
                    <button class="btn btn-xs btn-default text-danger btn-remove-contract" style="padding: 2px 6px;">
                        <i class="fa fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    });

    let dialog = new frappe.ui.Dialog({
        title: __('📋 Manage Contracts & Renewals — ') + ledger_name,
        size: 'extra-large',
        fields: [
            {
                fieldname: 'contracts_table_html',
                fieldtype: 'HTML',
                options: `
                    <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
                        <div style="font-size: 12px; color: #64748b;">
                            Update start and expiry dates for customer subscriptions or add new renewal items.
                        </div>
                        <button class="btn btn-xs btn-primary" id="btn-add-contract-row" style="font-size: 12px; font-weight: 500;">
                            <i class="fa fa-plus"></i> ${__('Add Contract')}
                        </button>
                    </div>
                    <div style="max-height: 400px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 6px;">
                        <table class="table table-bordered table-hover" style="margin-bottom: 0; font-size: 12px;">
                            <thead style="background: #f8fafc; font-weight: 600; color: #334155;">
                                <tr>
                                    <th>Product</th>
                                    <th>Category</th>
                                    <th>Period</th>
                                    <th>Start Date</th>
                                    <th>Expiry Date</th>
                                    <th>Status</th>
                                    <th>Visits</th>
                                    <th>Amount</th>
                                    <th>Remarks</th>
                                    <th style="width: 40px;"></th>
                                </tr>
                            </thead>
                            <tbody id="contracts-table-body">
                                ${rows_html || '<tr><td colspan="9" class="text-center text-muted" style="padding: 20px;">No contracts found. Click "Add Contract" to create one.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                `
            }
        ],
        primary_action_label: __('💾 Save & Renew'),
        primary_action: function() {
            let rows = [];
            dialog.$wrapper.find('.contract-row').each(function() {
                let $r = $(this);
                let prod = $r.find('.c-product').val();
                if (!prod) return;
                rows.push({
                    product: prod,
                    category: $r.find('.c-category').val() || 'Other',
                    period: $r.find('.c-period').val() || 'YEARLY',
                    start_date: $r.find('.c-start-date').val() || null,
                    expiry_date: $r.find('.c-expiry-date').val() || null,
                    visits: $r.find('.c-visits').val() || null,
                    amount: parseFloat($r.find('.c-amount').val()) || 0,
                    remarks: $r.find('.c-remarks').val() || ''
                });
            });

            frappe.call({
                method: 'hbs_ticket_system.hbs_support_system.doctype.support_ticket_ledger.support_ticket_ledger.update_customer_contracts',
                args: {
                    ledger_name: ledger_name,
                    contracts_json: JSON.stringify(rows)
                },
                freeze: true,
                freeze_message: __('Saving contracts...'),
                callback: function(r) {
                    if (r.message && r.message.success) {
                        frappe.show_alert({ message: __('Contracts updated successfully'), indicator: 'green' });
                        dialog.hide();
                        let lv = frappe.views.listview_instances['support_ticket_ledger'];
                        if (lv) lv.refresh();
                    }
                }
            });
        }
    });

    dialog.show();

    function bind_row_events($row) {
        $row.find('.c-product').on('change', function() {
            let selected_opt = $(this).find('option:selected');
            let cat = selected_opt.data('category') || 'Other';
            let period = selected_opt.data('period') || 'YEARLY';
            let rate = selected_opt.data('rate') || 0;

            $row.find('.c-category-badge').text(cat);
            $row.find('.c-category').val(cat);
            if (!$row.find('.c-period').val()) $row.find('.c-period').val(period);
            if (!$row.find('.c-amount').val() || $row.find('.c-amount').val() == 0) $row.find('.c-amount').val(rate);
            trigger_date_calc($row);
        });

        $row.find('.c-period, .c-start-date').on('change', function() {
            trigger_date_calc($row);
        });

        $row.find('.btn-remove-contract').on('click', function() {
            $row.remove();
        });
    }

    function trigger_date_calc($row) {
        let s_date = $row.find('.c-start-date').val();
        let period = ($row.find('.c-period').val() || '').toUpperCase();
        if (!s_date || !period) return;

        let months = 0;
        if (period.includes('YEAR') && !period.includes('HALF')) months = 12;
        else if (period.includes('HALF')) months = 6;
        else if (period.includes('QUART')) months = 3;
        else if (period.includes('MONTH')) months = 1;

        if (months && window.moment) {
            let exp = moment(s_date).add(months, 'months').subtract(1, 'days').format('YYYY-MM-DD');
            $row.find('.c-expiry-date').val(exp);
        }
    }

    dialog.$wrapper.find('.contract-row').each(function() {
        bind_row_events($(this));
    });

    dialog.$wrapper.find('#btn-add-contract-row').on('click', function(e) {
        e.preventDefault();
        let default_start = frappe.datetime.nowdate();
        let default_exp = moment(default_start).add(1, 'year').subtract(1, 'days').format('YYYY-MM-DD');

        let new_row_html = `
            <tr class="contract-row" style="border-bottom: 1px solid #e2e8f0; background: #f0fdf4;">
                <td style="padding: 8px 6px;">
                    <select class="form-control input-xs c-product" style="font-size: 12px; height: 28px; width: 140px;">
                        <option value="">${__('-- Select Product --')}</option>
                        ${product_options}
                    </select>
                </td>
                <td style="padding: 8px 6px;">
                    <span class="c-category-badge" style="font-size: 11px; font-weight: 600; color: #475569;">-</span>
                    <input type="hidden" class="c-category" value="Other">
                </td>
                <td style="padding: 8px 6px;">
                    <select class="form-control input-xs c-period" style="font-size: 12px; height: 28px; width: 100px;">
                        <option value="YEARLY" selected>Yearly</option>
                        <option value="HALFYEARLY">Half Yearly</option>
                        <option value="QUARTERLY">Quarterly</option>
                        <option value="MONTHLY">Monthly</option>
                    </select>
                </td>
                <td style="padding: 8px 6px;">
                    <input type="date" class="form-control input-xs c-start-date" value="${default_start}" style="font-size: 11px; height: 28px; width: 120px;">
                </td>
                <td style="padding: 8px 6px;">
                    <input type="date" class="form-control input-xs c-expiry-date" value="${default_exp}" style="font-size: 11px; height: 28px; width: 120px;">
                </td>
                <td style="padding: 8px 6px; text-align: center;">
                    <span class="badge badge-success" style="background:#dcfce7; color:#15803d; padding:3px 8px; border-radius:4px; font-size:11px;">Active</span>
                </td>
                <td style="padding: 8px 6px;">
                    <input type="text" class="form-control input-xs c-visits" value="" placeholder="Visits" style="font-size: 11px; height: 28px; width: 70px;">
                </td>
                <td style="padding: 8px 6px;">
                    <input type="number" class="form-control input-xs c-amount" value="0" style="font-size: 12px; height: 28px; width: 90px;">
                </td>
                <td style="padding: 8px 6px;">
                    <input type="text" class="form-control input-xs c-remarks" value="" placeholder="Invoice / Notes" style="font-size: 11px; height: 28px; width: 120px;">
                </td>
                <td style="padding: 8px 6px; text-align: center;">
                    <button class="btn btn-xs btn-default text-danger btn-remove-contract" style="padding: 2px 6px;">
                        <i class="fa fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;

        let $tbody = dialog.$wrapper.find('#contracts-table-body');
        $tbody.find('td[colspan]').parent().remove();
        let $new_row = $(new_row_html);
        $tbody.append($new_row);
        bind_row_events($new_row);
    });
}

function show_ledger_excel_import_dialog(listview, mode) {
    mode = mode || 'import';
    const is_update_mode = (mode === 'update');
    const dialog_title = is_update_mode
        ? __('🔄 Update Master Details (Excel)')
        : __('📥 Import Master (Excel)');

    const info_description = is_update_mode
        ? `
            <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 12px 16px; margin-bottom: 15px; font-size: 13px; color: #1e3a8a;">
                <div style="font-weight: 700; color: #1e40af; margin-bottom: 4px;">
                    🔄 Update Master Details Mode
                </div>
                <div>
                    Matches existing customer records strictly by <b>Serial No</b> and updates the <b>Details tab</b>:
                    <code style="background: #dbeafe; padding: 2px 5px; border-radius: 4px;">Party / Company Name</code>,
                    <code style="background: #dbeafe; padding: 2px 5px; border-radius: 4px;">Email</code>,
                    <code style="background: #dbeafe; padding: 2px 5px; border-radius: 4px;">Contact Person</code>,
                    <code style="background: #dbeafe; padding: 2px 5px; border-radius: 4px;">Phone Number</code>.
                </div>
                <div style="margin-top: 6px; font-weight: 600; color: #b45309;">
                    ⚠️ Note: Non-existent serial numbers will NOT create new records and will be skipped.
                </div>
            </div>
        `
        : `
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
                    <code style="background: #e2e8f0; padding: 2px 5px; border-radius: 4px;">Type (AMC / Cloud / Module)</code>,
                    <code style="background: #e2e8f0; padding: 2px 5px; border-radius: 4px;">IP Address</code>,
                    <code style="background: #e2e8f0; padding: 2px 5px; border-radius: 4px;">Starts From</code>,
                    <code style="background: #e2e8f0; padding: 2px 5px; border-radius: 4px;">Expiry Date</code>,
                    <code style="background: #e2e8f0; padding: 2px 5px; border-radius: 4px;">Total Amount</code>,
                    <code style="background: #e2e8f0; padding: 2px 5px; border-radius: 4px;">Sold By</code>,
                    <code style="background: #e2e8f0; padding: 2px 5px; border-radius: 4px;">Installed By</code>.
                </div>
            </div>
        `;

    let dialog = new frappe.ui.Dialog({
        title: dialog_title,
        size: 'large',
        fields: [
            {
                fieldname: 'info_html',
                fieldtype: 'HTML',
                options: info_description
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
                                <div style="font-size: 11px; color: #991b1b; text-transform: uppercase; font-weight: 600;">⚠️ Errors</div>
                                <div id="res-errors" style="font-size: 18px; font-weight: 700; color: #dc2626;">0</div>
                            </div>
                        </div>

                        <div id="import-error-table-container" style="display: none;">
                            <div style="font-weight: 600; font-size: 13px; color: #991b1b; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
                                <span>Failed Rows</span>
                                <button class="btn btn-xs btn-default" id="btn-download-error-csv" style="display: none;">
                                    📥 Download Errors CSV
                                </button>
                            </div>
                            <div style="max-height: 200px; overflow-y: auto; border: 1px solid #fecaca; border-radius: 6px;">
                                <table class="table table-bordered table-striped" style="margin-bottom: 0; font-size: 11px;">
                                    <thead style="background: #fee2e2;">
                                        <tr>
                                            <th>Row</th>
                                            <th>Serial No</th>
                                            <th>Party Name</th>
                                            <th>Reason</th>
                                        </tr>
                                    </thead>
                                    <tbody id="import-error-table-body"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                `
            }
        ],
        primary_action_label: is_update_mode ? __('Start Update') : __('Start Import'),
        primary_action: function() {
            let file_url = dialog.get_value('excel_file');
            if (!file_url) {
                frappe.msgprint(__('Please select an Excel file first.'));
                return;
            }

            dialog.get_primary_btn().prop('disabled', true);
            dialog.$wrapper.find('#import-progress-container').show();
            dialog.$wrapper.find('#import-status-text').text(__('Uploading and analyzing file...'));

            frappe.call({
                method: 'hbs_ticket_system.hbs_support_system.doctype.support_ticket_ledger.ledger_importer.start_ledger_import',
                args: { file_url: file_url },
                callback: function(r) {
                    if (r.exc) {
                        dialog.get_primary_btn().prop('disabled', false);
                        return;
                    }
                    let res = r.message || {};
                    let batch_token = res.batch_token;
                    let total_rows = res.total_rows || 0;

                    if (!total_rows) {
                        dialog.get_primary_btn().prop('disabled', false);
                        frappe.msgprint(__('No valid rows found in file.'));
                        return;
                    }

                    run_import_batches(dialog, batch_token, 0, total_rows, 50, {
                        inserted: 0,
                        updated: 0,
                        skipped: 0,
                        skipped_list: [],
                        errors: []
                    }, listview, mode);
                }
            });
        }
    });

    dialog.show();
}

function run_import_batches(dialog, batch_token, start_idx, total_rows, batch_size, accum, listview, mode) {
    mode = mode || 'import';
    let progress_pct = Math.round((start_idx / total_rows) * 100);
    dialog.$wrapper.find('#import-progress-bar').css('width', `${progress_pct}%`);
    dialog.$wrapper.find('#import-progress-percentage').text(`${progress_pct}%`);
    dialog.$wrapper.find('#import-status-text').text(__('Importing rows {0} to {1} of {2}...', [start_idx + 1, Math.min(start_idx + batch_size, total_rows), total_rows]));
    dialog.$wrapper.find('#import-counter-text').text(__('Processed {0} of {1} rows', [start_idx, total_rows]));

    const batch_method = (mode === 'update')
        ? 'hbs_ticket_system.hbs_support_system.doctype.support_ticket_ledger.ledger_importer.process_update_master_batch'
        : 'hbs_ticket_system.hbs_support_system.doctype.support_ticket_ledger.ledger_importer.process_import_batch';

    frappe.call({
        method: batch_method,
        args: {
            batch_token: batch_token,
            start_idx: start_idx,
            batch_size: batch_size
        },
        callback: function(r) {
            if (r.exc) {
                dialog.get_primary_btn().prop('disabled', false);
                return;
            }

            let res = r.message || {};
            accum.inserted += (res.inserted || 0);
            accum.updated += (res.updated || 0);
            accum.skipped = (accum.skipped || 0) + (res.skipped || 0);
            if (res.skipped_list && res.skipped_list.length) {
                accum.skipped_list = (accum.skipped_list || []).concat(res.skipped_list);
            }
            if (res.errors && res.errors.length) {
                accum.errors = accum.errors.concat(res.errors);
            }

            if (!res.is_complete && start_idx + batch_size < total_rows) {
                run_import_batches(dialog, batch_token, start_idx + batch_size, total_rows, batch_size, accum, listview, mode);
            } else {
                finish_import_ui(dialog, total_rows, accum, listview, mode);
            }
        }
    });
}

function finish_import_ui(dialog, total_rows, accum, listview, mode) {
    mode = mode || 'import';
    dialog.$wrapper.find('#import-progress-bar').css('width', '100%');
    dialog.$wrapper.find('#import-progress-percentage').text('100%');
    dialog.$wrapper.find('#import-status-text').text(__('Import complete!'));
    dialog.$wrapper.find('#import-counter-text').text(__('Processed {0} of {0} rows', [total_rows]));

    dialog.$wrapper.find('#res-total').text(total_rows);
    dialog.$wrapper.find('#res-inserted').text(accum.inserted);
    dialog.$wrapper.find('#res-updated').text(accum.updated);
    dialog.$wrapper.find('#res-errors').text(accum.errors.length);

    if (mode === 'update') {
        dialog.$wrapper.find('#res-inserted').parent().find('div:first').text('✅ Updated');
        dialog.$wrapper.find('#res-inserted').text(accum.updated);
        dialog.$wrapper.find('#res-updated').parent().find('div:first').text('⏭️ Skipped (Not Found)');
        dialog.$wrapper.find('#res-updated').text(accum.skipped || 0);
    }

    dialog.$wrapper.find('#import-result-container').show();

    let errors = accum.errors || [];
    if (errors.length) {
        let rows_html = errors.map(e => `
            <tr>
                <td style="font-weight: 600;">${e.row}</td>
                <td>${frappe.utils.escape_html(e.serial_no || '-')}</td>
                <td>${frappe.utils.escape_html(e.party_name || '-')}</td>
                <td style="color: #b91c1c;">${frappe.utils.escape_html(e.reason || '')}</td>
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
