frappe.ui.form.on('support_ticket_ledger', {

    refresh(frm) {
        enable_amc_fields(frm);
        frm.timeline.wrapper.hide();
        frm.page.wrapper.find('.comment-box').hide();

    },

    amc_start_date(frm) {
        calculate_amc_expiry(frm);
    },

    amc_period(frm) {
        calculate_amc_expiry(frm);
    },

    amc_status(frm) {
        enable_amc_fields(frm);
    }

    
});

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

    if (!frm.doc.amc_start_date || !frm.doc.amc_period) {
        return;
    }

    let expiry_date = frappe.datetime.str_to_obj(frm.doc.amc_start_date);

    if (frm.doc.amc_period === "YEARLY") {
        expiry_date.setFullYear(expiry_date.getFullYear() + 1);

    } else if (frm.doc.amc_period === "HALFYEARLY") {
        expiry_date.setMonth(expiry_date.getMonth() + 6);

    } else if (frm.doc.amc_period === "QUARTERLY") {
        expiry_date.setMonth(expiry_date.getMonth() + 3);

    } else if (frm.doc.amc_period === "MONTHLY") {
        expiry_date.setMonth(expiry_date.getMonth() + 1);
    }

    expiry_date.setDate(expiry_date.getDate() - 1);

    frm.set_value(
        "amc_expiry_date",
        frappe.datetime.obj_to_str(expiry_date-1)
    );
}