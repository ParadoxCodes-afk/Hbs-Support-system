frappe.ui.form.on('support_ticket_ledger', {

    refresh(frm) {
        enable_amc_fields(frm);
        check_ledger_alter_permissions(frm);
        check_amc_expiry_warning(frm);
        frm.timeline.wrapper.hide();
        frm.page.wrapper.find('.comment-box').hide();
    },

    amc_start_date(frm) {
        calculate_amc_expiry(frm);
    },

    amc_period(frm) {
        calculate_amc_expiry(frm);
    },

    amc_expiry_date(frm) {
        check_amc_expiry_warning(frm);
    },

    amc_status(frm) {
        enable_amc_fields(frm);
        if (frm.doc.amc_status === 'YES' && frm.doc.amc_period) {
            calculate_amc_expiry(frm);
        }
        check_amc_expiry_warning(frm);
    }

});

function check_amc_expiry_warning(frm) {
    const $wrapper = frm.fields_dict.amc_status && frm.fields_dict.amc_status.$wrapper;
    if (!$wrapper) return;

    $wrapper.parent().find('.amc-expiry-alert-box').remove();

    if (frm.doc.amc_status !== 'YES' || !frm.doc.amc_expiry_date) {
        return;
    }

    const today = frappe.datetime.nowdate();
    const diff = frappe.datetime.get_diff(frm.doc.amc_expiry_date, today);

    let alertHtml = '';
    if (diff < 0) {
        const daysAgo = Math.abs(diff);
        alertHtml = `
            <div class="amc-expiry-alert-box alert alert-danger" style="margin-bottom: 15px; padding: 10px 14px; background-color: #fee2e2; border: 1.5px solid #ef4444; border-radius: 6px; color: #991b1b; font-size: 13px;">
                <strong>❌ AMC Expired!</strong> The AMC contract expired on <strong>${frappe.datetime.str_to_user(frm.doc.amc_expiry_date)}</strong> (${daysAgo} day${daysAgo > 1 ? 's' : ''} ago). Renewal is pending.
            </div>
        `;
    } else if (diff <= 15) {
        alertHtml = `
            <div class="amc-expiry-alert-box alert alert-warning" style="margin-bottom: 15px; padding: 10px 14px; background-color: #fef3c7; border: 1.5px solid #f59e0b; border-radius: 6px; color: #92400e; font-size: 13px;">
                <strong>⚠️ AMC Expiring Soon!</strong> This AMC contract will expire in <strong>${diff} day${diff === 1 ? '' : 's'}</strong> on <strong>${frappe.datetime.str_to_user(frm.doc.amc_expiry_date)}</strong>. Please initiate renewal discussions.
            </div>
        `;
    }

    if (alertHtml) {
        $wrapper.before(alertHtml);
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
            const can_alter_amc = Boolean(settings.can_alter_amc || settings.is_owner || settings.is_admin);

            if (!can_alter_amc) {
                // Lock AMC Information tab for non-supervisors
                const amc_fields = ['amc_status', 'amc_period', 'amc_start_date', 'amc_expiry_date', 'amount'];
                amc_fields.forEach(f => {
                    frm.set_df_property(f, 'read_only', 1);
                });

                const sup_label = settings.amc_supervisor_name ? ` (${settings.amc_supervisor_name})` : '';
                frm.dashboard.clear_headline();
                frm.dashboard.set_headline(
                    __(`<span style="color: #1e40af; font-weight: 500;"><i class="fa fa-lock"></i> AMC Contract terms are read-only. Only authorized supervisor${sup_label} or system owners can alter AMC details.</span>`),
                    'blue'
                );
            }
        }
    });
}

function enable_amc_fields(frm) {

    const show_fields = [
        'amc_period',
        'amc_start_date',
        'amc_expiry_date',
        'amount'
    ];

    const show = frm.doc.amc_status === 'YES';

    show_fields.forEach(field => {
        frm.toggle_display(field, show);
    });
}

function calculate_amc_expiry(frm) {
    const raw_period = (frm.doc.amc_period || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (!raw_period) {
        return;
    }

    if (!frm.doc.amc_start_date) {
        frm.set_value('amc_start_date', frappe.datetime.get_today());
    }

    const start_date = frm.doc.amc_start_date;
    if (!start_date) {
        return;
    }

    let months = 0;
    if (raw_period.includes('YEAR') && !raw_period.includes('HALF')) {
        months = 12;
    } else if (raw_period.includes('HALF')) {
        months = 6;
    } else if (raw_period.includes('QUART')) {
        months = 3;
    } else if (raw_period.includes('MONTH')) {
        months = 1;
    }

    if (!months) {
        return;
    }

    if (window.moment) {
        const expiry = moment(start_date).add(months, 'months').subtract(1, 'days').format('YYYY-MM-DD');
        frm.set_value('amc_expiry_date', expiry);
    } else {
        let d = frappe.datetime.str_to_obj(start_date);
        d.setMonth(d.getMonth() + months);
        d.setDate(d.getDate() - 1);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        frm.set_value('amc_expiry_date', `${yyyy}-${mm}-${dd}`);
    }
}
