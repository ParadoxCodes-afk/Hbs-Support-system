frappe.ui.form.on('support_ticket_ledger', {

    refresh(frm) {
        check_ledger_alter_permissions(frm);
        load_ledger_call_history(frm);
        frm.timeline.wrapper.hide();
        frm.page.wrapper.find('.comment-box').hide();
    }

});

frappe.ui.form.on('support_ticket_ledger_serials', {
    serial_no(frm, cdt, cdn) {
        sync_primary_serial(frm);
    },
    serial_numbers_remove(frm) {
        sync_primary_serial(frm);
    },
    serial_numbers_add(frm) {
        sync_primary_serial(frm);
    }
});

function sync_primary_serial(frm) {
    const rows = frm.doc.serial_numbers || [];
    for (let r of rows) {
        if (r.serial_no && String(r.serial_no).trim()) {
            frm.set_value('serial_no', String(r.serial_no).trim());
            return;
        }
    }
    frm.set_value('serial_no', '');
}

frappe.ui.form.on('support_ticket_ledger_contracts', {
    contracts_add(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (!row.company_name) {
            frappe.model.set_value(cdt, cdn, 'company_name', frm.doc.our_company_name || 'HBS Solutions Pvt Ltd');
        }
    },

    product(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (row.product) {
            frappe.db.get_value('support_contract_product', row.product, ['category', 'default_period', 'standard_rate'])
                .then(r => {
                    let d = r.message || {};
                    frappe.model.set_value(cdt, cdn, 'category', d.category || 'Other');
                    if (d.default_period && !row.period) {
                        frappe.model.set_value(cdt, cdn, 'period', d.default_period);
                    }
                    if ((d.category || '').toUpperCase().includes('AMC')) {
                        frappe.model.set_value(cdt, cdn, 'qty', null);
                        frappe.model.set_value(cdt, cdn, 'rate', null);
                    } else if (d.standard_rate !== undefined && (!row.rate || row.rate == 0)) {
                        frappe.model.set_value(cdt, cdn, 'rate', d.standard_rate);
                    }
                });
        }
    },

    period(frm, cdt, cdn) {
        calc_row_expiry(frm, cdt, cdn);
    },

    start_date(frm, cdt, cdn) {
        calc_row_expiry(frm, cdt, cdn);
    },

    qty(frm, cdt, cdn) {
        calc_row_amount(frm, cdt, cdn);
    },

    rate(frm, cdt, cdn) {
        calc_row_amount(frm, cdt, cdn);
    }
});

function calc_row_amount(frm, cdt, cdn) {
    let row = locals[cdt][cdn];
    let qty = parseFloat(row.qty);
    let rate = parseFloat(row.rate);
    if (!isNaN(qty) && !isNaN(rate) && qty > 0 && rate > 0) {
        frappe.model.set_value(cdt, cdn, 'amount', Math.round(qty * rate * 100) / 100);
    }
}

function calc_row_expiry(frm, cdt, cdn) {
    let row = locals[cdt][cdn];
    if (!row.start_date || !row.period) return;

    let period = (row.period || '').toUpperCase().replace(/[^A-Z]/g, '');
    let months = 0;
    if (period.includes('YEAR') && !period.includes('HALF')) months = 12;
    else if (period.includes('HALF')) months = 6;
    else if (period.includes('QUART')) months = 3;
    else if (period.includes('MONTH')) months = 1;

    if (!months) return;

    if (window.moment) {
        let exp = moment(row.start_date).add(months, 'months').subtract(1, 'days').format('YYYY-MM-DD');
        frappe.model.set_value(cdt, cdn, 'expiry_date', exp);
    } else {
        let d = frappe.datetime.str_to_obj(row.start_date);
        d.setMonth(d.getMonth() + months);
        d.setDate(d.getDate() - 1);
        let yyyy = d.getFullYear();
        let mm = String(d.getMonth() + 1).padStart(2, '0');
        let dd = String(d.getDate()).padStart(2, '0');
        frappe.model.set_value(cdt, cdn, 'expiry_date', `${yyyy}-${mm}-${dd}`);
    }
}

function check_ledger_alter_permissions(frm) {
    if (frappe.session.user === 'Administrator') {
        return;
    }

    frappe.call({
        method: 'hbs_ticket_system.hbs_support_system.doctype.support_ticket.support_ticket.get_support_user_settings',
        callback: function (r) {
            const settings = r.message || {};
            const is_owner_or_admin = Boolean(settings.is_owner || settings.is_admin || frappe.session.user === 'Administrator');
            const can_alter = Boolean(settings.can_alter_amc || is_owner_or_admin);

            // Follow-up remarks are locked for everyone except Admin and Owners
            if (!is_owner_or_admin) {
                frm.set_df_property('contract_followups', 'read_only', 1);
                if (frm.fields_dict.contract_followups && frm.fields_dict.contract_followups.grid) {
                    frm.fields_dict.contract_followups.grid.cannot_add_rows = true;
                    frm.fields_dict.contract_followups.grid.cannot_delete_rows = true;
                    frm.fields_dict.contract_followups.grid.refresh();
                }
            }

            if (!can_alter) {
                // Lock Contracts tab for non-supervisors
                frm.set_df_property('contracts', 'read_only', 1);

                const sup_label = settings.amc_supervisor_name ? ` (${settings.amc_supervisor_name})` : '';
                frm.dashboard.clear_headline();
                frm.dashboard.set_headline(
                    __(`<span style="color: #1e40af; font-weight: 500;"><i class="fa fa-lock"></i> Customer contracts are read-only. Only authorized supervisor${sup_label} or system owners can alter contract details.</span>`),
                    'blue'
                );
            }
        }
    });
}

function load_ledger_call_history(frm) {
    const field = frm.fields_dict.call_history_html;
    if (!field) return;

    if (frm.is_new()) {
        field.$wrapper.html(
            '<div class="text-muted" style="padding: 15px;">Call history will be available after saving the customer record.</div>'
        );
        return;
    }

    const customerId = frm.doc.unique_id || frm.doc.name;
    if (!customerId) {
        field.$wrapper.html(
            '<div class="text-muted" style="padding: 15px;">Customer ID is missing.</div>'
        );
        return;
    }

    field.$wrapper.html(
        '<div class="text-muted" style="padding: 15px;"><i class="fa fa-spinner fa-spin"></i> Loading call history...</div>'
    );

    frappe.call({
        method: 'hbs_ticket_system.hbs_support_system.doctype.support_ticket.support_ticket.get_call_history',
        args: {
            unique_id: customerId
        },
        callback: function (r) {
            if (!r.message || !r.message.length) {
                field.$wrapper.html(
                    `<div style="padding: 20px; text-align: center; background: var(--bg-light-gray, #f8f9fa); border-radius: 6px;">
                        <span class="text-muted">No call history found for this customer.</span>
                        <button type="button" class="btn btn-xs btn-default btn-refresh-ledger-history" style="margin-left: 10px;">
                            <i class="fa fa-refresh"></i> Refresh
                        </button>
                    </div>`
                );
                field.$wrapper.find('.btn-refresh-ledger-history').on('click', function(e) {
                    e.preventDefault();
                    load_ledger_call_history(frm);
                });
                return;
            }

            const rows = r.message;
            const esc = v => frappe.utils.escape_html(String(v || ''));

            function get_status_badge(status) {
                const s = String(status || '').toUpperCase();
                let color = 'gray';
                if (s === 'COMPLETED') color = 'green';
                else if (s === 'FOLLOWUP') color = 'orange';
                else if (s === 'NEW') color = 'blue';
                else if (s === 'PENDING') color = 'red';
                return `<span class="indicator-pill ${color}" style="font-size: 11px;">${esc(status)}</span>`;
            }

            function format_datetime(dt) {
                if (!dt) return '-';
                try {
                    const d = frappe.datetime.str_to_user(dt);
                    const timePart = dt.indexOf(' ') > -1 ? dt.split(' ')[1].substring(0, 5) : '';
                    return timePart ? `${d} ${timePart}` : d;
                } catch (e) {
                    return dt;
                }
            }

            let html = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <div style="font-weight: 500; color: var(--text-muted, #6c757d); font-size: 12.5px;">
                        Total Calls / Tickets: <span style="font-weight: 700; color: var(--text-color, #1f2937);">${rows.length}</span>
                    </div>
                    <button type="button" class="btn btn-xs btn-default btn-refresh-ledger-history">
                        <i class="fa fa-refresh"></i> Refresh
                    </button>
                </div>
                <div style="overflow-x: auto; border: 1px solid var(--border-color, #d1d5db); border-radius: 6px;">
                    <table class="table table-bordered table-hover" style="margin-bottom: 0; font-size: 13px;">
                        <thead>
                            <tr style="background: var(--bg-light-gray, #f8f9fa);">
                                <th style="width: 40px; text-align: center;">#</th>
                                <th>Ticket No</th>
                                <th>Date</th>
                                <th>Serial No</th>
                                <th>Call Source</th>
                                <th>Call Type</th>
                                <th>Executive</th>
                                <th>Status</th>
                                <th style="text-align: center; width: 110px;">View Details</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            rows.forEach((row, idx) => {
                const ticketName = esc(row.name);
                const ticketUrl = `/app/support_ticket/${encodeURIComponent(row.name)}`;
                const execs = [esc(row.executive), esc(row.executive2)].filter(Boolean).join(' / ') || '-';

                html += `
                    <tr>
                        <td style="text-align: center; color: var(--text-muted);">${idx + 1}</td>
                        <td>
                            <a href="${ticketUrl}" target="_blank" style="font-weight: 600; text-decoration: underline; color: var(--primary);">
                                ${ticketName}
                            </a>
                        </td>
                        <td>${esc(format_datetime(row.creation))}</td>
                        <td><b>${esc(row.serial_no || '-')}</b></td>
                        <td>${esc(row.call_source || '-')}</td>
                        <td>${esc(row.call_type || '-')}</td>
                        <td>${execs}</td>
                        <td>${get_status_badge(row.status)}</td>
                        <td style="text-align: center; vertical-align: middle;">
                            <button
                                type="button"
                                class="btn btn-xs btn-default view-ticket-details"
                                data-ticket="${ticketName}">
                                View Details
                            </button>
                        </td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            `;

            field.$wrapper.html(html);
            field.$wrapper.find('.btn-refresh-ledger-history').on('click', function(e) {
                e.preventDefault();
                load_ledger_call_history(frm);
            });
            field.$wrapper.find('.view-ticket-details').on('click', function(e) {
                e.preventDefault();
                const ticket = $(this).attr('data-ticket');
                if (ticket) {
                    show_ledger_ticket_followup_history(ticket);
                }
            });
        }
    });
}

function show_ledger_ticket_followup_history(ticketName) {
    frappe.call({
        method: 'hbs_ticket_system.hbs_support_system.doctype.support_ticket.support_ticket.get_ticket_followup_history',
        args: { ticket_name: ticketName },
        callback: function (r) {
            const ticket = r.message;
            if (!ticket) {
                frappe.msgprint(__('No follow-up history returned for {0}', [ticketName]));
                return;
            }

            const esc = v => frappe.utils.escape_html(String(v || ''));
            const history = ticket.followup_history || [];

            function format_dt(dt) {
                if (!dt) return '';
                try {
                    const d = frappe.datetime.str_to_user(dt);
                    const timePart = dt.indexOf(' ') > -1 ? dt.split(' ')[1].substring(0, 5) : '';
                    return timePart ? `${d} ${timePart}` : d;
                } catch (e) {
                    return dt;
                }
            }

            function get_badge(status) {
                if (!status) return '';
                const s = String(status).toUpperCase().trim();
                let bg = '#f1f5f9', color = '#475569', border = '#cbd5e1';
                if (s.includes('COMPLETED') || s.includes('RESOLVED') || s.includes('CLOSED')) {
                    bg = '#def7ec'; color = '#03543f'; border = '#bcf0da';
                } else if (s.includes('FOLLOWUP') || s.includes('FOLLOW UP') || s.includes('SCHEDULED')) {
                    bg = '#fef3c7'; color = '#92400e'; border = '#fde68a';
                } else if (s.includes('PENDING') || s.includes('HOLD') || s.includes('CANCEL')) {
                    bg = '#fee2e2'; color = '#991b1b'; border = '#fecaca';
                } else if (s.includes('NEW') || s.includes('OPEN')) {
                    bg = '#e0e7ff'; color = '#3730a3'; border = '#c7d2fe';
                } else if (s.includes('IN PROGRESS') || s.includes('WIP')) {
                    bg = '#e0f2fe'; color = '#075985'; border = '#bae6fd';
                }
                return `<span style="background:${bg}; color:${color}; border:1px solid ${border}; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600; text-transform:uppercase;">${esc(s)}</span>`;
            }

            let timeline_html = '';
            if (!history.length) {
                timeline_html = '<div style="color: #94a3b8; font-style: italic; padding: 14px 16px; background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1;">No follow-up history recorded yet.</div>';
            } else {
                const list = history.slice().sort((a, b) => {
                    const dtA = a.updated_on || a.creation || '';
                    const dtB = b.updated_on || b.creation || '';
                    return dtB.localeCompare(dtA);
                });

                timeline_html = '<div class="activity-timeline" style="margin-top: 15px; margin-left: 12px; margin-bottom: 20px; border-left: 2px solid #e2e8f0; padding-left: 24px; position: relative;">';
                list.forEach(row => {
                    const user = esc(row.updated_by || 'System');
                    const dtStr = row.updated_on ? esc(format_dt(row.updated_on)) : '';
                    const statusBadge = get_badge(row.status);
                    const callTypeBadge = row.call_type
                        ? `<span style="background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500;">🏷️ ${esc(row.call_type)}</span>`
                        : '';
                    const subStatusBadge = (row.sub_status || row.sub_sub_status)
                        ? `<span style="background: #f8fafc; color: #475569; border: 1px solid #e2e8f0; padding: 2px 8px; border-radius: 4px; font-size: 11px;">📂 ${esc(row.sub_status || '')}${row.sub_sub_status ? ' › ' + esc(row.sub_sub_status) : ''}</span>`
                        : '';
                    const nextFollowupBadge = row.followup_date
                        ? `<span style="background: #fffbeb; color: #92400e; border: 1px solid #fef3c7; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">📅 Next Followup: ${esc(frappe.datetime.str_to_user(row.followup_date))}${row.followup_time ? ' at ' + esc(row.followup_time.substring(0, 5)) : ''}</span>`
                        : '';

                    timeline_html += `
                        <div class="timeline-item" style="margin-bottom: 16px; position: relative;">
                            <div style="position: absolute; left: -35px; top: 2px; background: #ffffff; padding: 2px;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6c757d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                </svg>
                            </div>
                            <div style="font-size: 12.5px; color: #505a62; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
                                <div>
                                    <b style="color: #1c2126; font-weight: 600;">${user}</b>
                                    ${dtStr ? `<span style="color: #8d99a6; margin-left: 6px;">updated • ${dtStr}</span>` : ''}
                                </div>
                                <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                                    ${statusBadge}
                                    ${callTypeBadge}
                                    ${subStatusBadge}
                                    ${nextFollowupBadge}
                                </div>
                            </div>
                            <div style="background: #fcfcfc; border: 1px solid #d1d8dd; border-radius: 5px; padding: 8px 12px; font-size: 12px; color: #1c2126; white-space: pre-wrap; line-height: 1.4; box-shadow: 0 1px 2px rgba(0,0,0,0.02); width: 100%; box-sizing: border-box;">
                                ${esc(row.remarks || '-')}
                            </div>
                        </div>
                    `;
                });
                timeline_html += '</div>';
            }

            let modal_html = `
                <div style="background: var(--bg-light-gray, #f8f9fa); padding: 12px 16px; border-radius: 6px; margin-bottom: 14px; font-size: 13px; border: 1px solid var(--border-color, #e2e8f0);">
                    <div class="row">
                        <div class="col-sm-4"><b>Ticket No:</b> <a href="/app/support_ticket/${encodeURIComponent(ticket.name)}" target="_blank" style="font-weight: 600; text-decoration: underline;">${esc(ticket.name)}</a></div>
                        <div class="col-sm-4"><b>Company:</b> ${esc(ticket.party_name || '-')}</div>
                        <div class="col-sm-4"><b>Status:</b> ${get_badge(ticket.status)}</div>
                    </div>
                    <div class="row" style="margin-top: 8px;">
                        <div class="col-sm-4"><b>Contact:</b> ${esc(ticket.contact_name || '-')} ${ticket.contact_phone ? '(' + esc(ticket.contact_phone) + ')' : ''}</div>
                        <div class="col-sm-4"><b>Executive:</b> ${esc(ticket.executive || '-')}</div>
                        <div class="col-sm-4"><b>Created:</b> ${esc(format_dt(ticket.creation))}</div>
                    </div>
                    ${ticket.remarks ? `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border-color, #cbd5e1);"><b>Initial Remarks:</b> ${esc(ticket.remarks)}</div>` : ''}
                </div>
                ${timeline_html}
            `;

            const dialog = new frappe.ui.Dialog({
                title: __('Follow-up History - {0}', [ticket.name]),
                size: 'extra-large',
                fields: [
                    {
                        fieldtype: 'HTML',
                        fieldname: 'history_html'
                    }
                ],
                primary_action_label: __('Close'),
                primary_action() {
                    dialog.hide();
                }
            });

            dialog.fields_dict.history_html.$wrapper.html(modal_html);
            dialog.show();
        }
    });
}
