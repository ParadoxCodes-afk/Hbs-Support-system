frappe.ui.form.on('support_ticket_ledger', {

    refresh(frm) {
        check_ledger_alter_permissions(frm);
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
                    if (d.standard_rate !== undefined && (!row.rate || row.rate == 0)) {
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
    let qty = parseFloat(row.qty) || 1;
    let rate = parseFloat(row.rate) || 0;
    frappe.model.set_value(cdt, cdn, 'amount', Math.round(qty * rate * 100) / 100);
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
            const can_alter = Boolean(settings.can_alter_amc || settings.is_owner || settings.is_admin);

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
