
frappe.ui.form.on('support_ticket', {

    // REFRESH
    refresh(frm) {
        frm.page.clear_indicator();
        frm.clear_custom_buttons();
        frm.timeline.wrapper.hide();
        frm.page.wrapper.find('.comment-box').hide();

        if (frm.is_new() && !frm.doc.executive) {
            frm.set_value('executive', frappe.session.user);
        }

        load_call_history(frm);

        if (!frm.is_new()) {
            frm.set_df_property('remarks', 'hidden', 1);
            frm.set_df_property('remarks', 'read_only', 1);
            frm.set_df_property('remarks', 'reqd', 0);
            frm.set_df_property('call_source', 'read_only', 1);
            frm.set_df_property('call_type', 'read_only', 1);
        } else if (frm.fields_dict.remarks && frm.fields_dict.remarks.$wrapper) {
            frm.fields_dict.remarks.$wrapper.find('textarea').css({
                'height': '40px',
                'min-height': '40px'
            });
        }

        ['call_source', 'call_type', 'executive', 'executive2']
            .forEach(field => frm.set_df_property(field, 'only_select', 1));

        // EXECUTIVE & CONTACT FIELDS EDITABLE SO COLLEAGUES CAN TAKE OVER / UPDATE CALLS
        frm.set_df_property('executive', 'read_only', 0);
        frm.set_df_property('executive2', 'read_only', 0);
        frm.set_df_property('contact_name', 'read_only', 0);
        frm.set_df_property('contact_phone', 'read_only', 0);


        // AMC HIGHLIGHT & EXPIRY VISIBILITY
        highlight_amc_fields(frm);

        set_party_details_state(frm);

        // Auto-fetch renewal details if missing on refresh without popup
        if (frm.doc.serial_no && !frm.doc.renewal_party_name && !frm.doc.renewal_license_type) {
            fetch_tally_renewal_details(frm, false);
        }

        render_followup_timeline(frm);

        setup_live_ticket_timer(frm);

        // DISABLE OPEN LINK OPTION
        setTimeout(() => {
            [
                'call_source', 'executive', 'executive2',
                'call_type', 'serial_no', 'status'
            ].forEach(fieldname => {
                if (frm.fields_dict[fieldname]) {
                    frm.fields_dict[fieldname].$wrapper
                        .find('.btn-open').remove();
                }
            });
        }, 100);

        // AUTO SCROLL TO FOCUSED FIELD
        setTimeout(() => {
            frm.$wrapper
                .find('input, textarea, select')
                .off('focus.ticketScroll')
                .on('focus.ticketScroll', function () {
                    setTimeout(() => {
                        this.scrollIntoView({
                            behavior: 'smooth',
                            block: 'center'
                        });
                    }, 100);
                });
        }, 500);

        // Click on Serial No input opens autofill dialog (just like in HBS CRM Lead)
        if (frm.fields_dict.serial_no) {
            frm.fields_dict.serial_no.df.options = null;
            if (frm.fields_dict.serial_no.awesomplete) {
                try {
                    frm.fields_dict.serial_no.awesomplete.destroy();
                } catch (e) {}
                frm.fields_dict.serial_no.awesomplete = null;
            }
            if (frm.fields_dict.serial_no.$input) {
                frm.fields_dict.serial_no.$input
                    .attr('autocomplete', 'off')
                    .attr('data-lpignore', 'true')
                    .attr('placeholder', __('Click to Autofill from Ledger...'))
                    .off('focus.autocomplete input.autocomplete keydown.autocomplete')
                    .off('click.open_autofill')
                    .on('click.open_autofill', function () {
                        if (frm.is_new()) {
                            open_autofill_dialog(frm);
                        }
                    });
            }
        }

        // Click on Executive2 field opens workload-based selection dialog directly (disabling Awesomplete dropdown)
        if (frm.fields_dict.executive2) {
            if (frm.is_new()) {
                if (frm.fields_dict.executive2.awesomplete) {
                    try {
                        frm.fields_dict.executive2.awesomplete.destroy();
                    } catch (e) {}
                    frm.fields_dict.executive2.awesomplete = null;
                }
                if (frm.fields_dict.executive2.$input) {
                    frm.fields_dict.executive2.$input
                        .attr('autocomplete', 'off')
                        .attr('data-lpignore', 'true')
                        .attr('placeholder', __('Click to select executive by workload...'))
                        .off('focus.autocomplete input.autocomplete keydown.autocomplete focus.awesomplete')
                        .off('mousedown.open_exec_dlg click.open_exec_dlg focus.open_exec_dlg')
                        .on('mousedown.open_exec_dlg click.open_exec_dlg', function (e) {
                            e.preventDefault();
                            e.stopPropagation();
                            this.blur();
                            open_executive_selection_dialog(frm);
                        });
                }
            }
        }

        // AUTOFILL BUTTON - CREATE MODE ONLY
        if (frm.is_new()) {
            let autofill_btn = frm.add_custom_button('Autofill Details', function () {
                open_autofill_dialog(frm);
            });
            autofill_btn.addClass('btn-primary');
        }

        // CUSTOM BUTTONS ONLY FOR EXISTING TICKETS
        if (!frm.is_new()) {
            // TRANSFER CALL
            frm.add_custom_button('Transfer Call', function () {
                let dialog = new frappe.ui.Dialog({
                    title: 'Transfer Call',
                    fields: [
                        {
                            label: 'Executive2',
                            fieldname: 'executive2',
                            fieldtype: 'Link',
                            options: 'User',
                            reqd: 1,
                            only_select: 1,
                            default: frappe.session.user
                        },
                        {
                            label: 'Call Type',
                            fieldname: 'call_type',
                            fieldtype: 'Link',
                            options: 'support_ticket_call_type_master',
                            reqd: 1,
                            only_select: 1,
                            default: frm.doc.call_type || ''
                        },
                        {
                            label: 'Remarks',
                            fieldname: 'remarks',
                            fieldtype: 'Small Text',
                            reqd: 1
                        }
                    ],

                    primary_action_label: 'Transfer Call',

                    primary_action: async function (values) {
                        if (!values.executive2 || !values.call_type || !values.remarks) {
                            frappe.msgprint('Please complete all required fields.');
                            return;
                        }

                        let user = await frappe.db.get_value(
                            'User', values.executive2, 'name'
                        );

                        if (!user?.message?.name) {
                            frappe.msgprint({
                                title: 'Invalid User',
                                message: 'Please select a valid User from the list.',
                                indicator: 'red'
                            });
                            return;
                        }

                        let callType = await frappe.db.get_value(
                            'support_ticket_call_type_master',
                            values.call_type,
                            'name'
                        );

                        if (!callType?.message?.name) {
                            frappe.msgprint({
                                title: 'Invalid Call Type',
                                message: 'Please select a valid Call Type from the list.',
                                indicator: 'red'
                            });
                            return;
                        }

                        await frm.set_value('status', 'NEW');
                        await frm.set_value('call_type', values.call_type);
                        await frm.set_value('executive2', values.executive2);

                        let row = frm.add_child('followup_history');
                        row.followup_date = '';
                        row.followup_time = '';
                        row.call_type = values.call_type;
                        row.remarks = values.remarks;
                        row.updated_by = frappe.session.user;
                        row.updated_on = frappe.datetime.now_datetime();
                        row.status = 'NEW';
                        row.sub_status = '';
                        row.sub_sub_status = '';

                        frm.refresh_field('followup_history');
                        dialog.hide();

                        frm.save().then(() => {
                            frappe.show_alert({
                                message: 'Call transferred successfully.',
                                indicator: 'green'
                            });
                        });
                    }
                });

                dialog.fields_dict.executive2.get_query = function () {
                    return {
                        query: 'hbs_ticket_system.hbs_support_system.doctype.support_ticket.support_ticket.get_active_users'
                    };
                };

                dialog.show();

                setTimeout(() => {
                    dialog.fields_dict.call_type.$wrapper.find('.btn-open').remove();
                    dialog.fields_dict.executive2.$wrapper.find('.btn-open').remove();
                }, 100);
            });

            // ADD FOLLOWUP REMARKS
            frm.add_custom_button('Add Followup Remarks', function () {
                let dialog = new frappe.ui.Dialog({
                    title: 'Add Followup Remarks',
                    fields: [
                        {
                            label: 'Call Type',
                            fieldname: 'call_type',
                            fieldtype: 'Link',
                            options: 'support_ticket_call_type_master',
                            reqd: 1,
                            only_select: 1,
                            default: frm.doc.call_type || ''
                        },
                        {
                            label: 'Status',
                            fieldname: 'status',
                            fieldtype: 'Link',
                            options: 'support_ticket_call_status_master',
                            reqd: 1,
                            only_select: 1,
                            description: 'Last Status: ' + (frm.doc.status || ''),
                            get_query: function () {
                                return {
                                    filters: { name: ['!=', 'NEW'] }
                                };
                            }
                        },
                        {
                            label: 'Pending Status',
                            fieldname: 'pending_status',
                            fieldtype: 'Select',
                            options: '',
                            hidden: 1
                        },
                        {
                            label: 'Pending Sub Status',
                            fieldname: 'pending_sub_status',
                            fieldtype: 'Select',
                            options: '',
                            hidden: 1
                        },
                        {
                            label: 'Root Cause Status',
                            fieldname: 'root_cause_status',
                            fieldtype: 'Select',
                            options: '',
                            hidden: 1
                        },
                        {
                            label: 'Followup Date',
                            fieldname: 'followup_date',
                            fieldtype: 'Date',
                            hidden: 1,
                            default: frappe.datetime.get_today()
                        },
                        {
                            label: 'Followup Time',
                            fieldname: 'followup_time',
                            fieldtype: 'Time',
                            hidden: 1,
                            default: '10:00:00'
                        },
                        {
                            label: 'Remarks',
                            fieldname: 'remarks',
                            fieldtype: 'Small Text',
                            hidden: 1
                        }
                    ],

                    primary_action_label: 'Submit',

                    primary_action: async function (values) {
                        if (!values.call_type || !values.status) {
                            frappe.msgprint('Please select Call Type and Status.');
                            return;
                        }

                        let statusCheck = await frappe.db.get_value(
                            'support_ticket_call_status_master',
                            values.status,
                            'name'
                        );

                        if (!statusCheck?.message?.name) {
                            frappe.msgprint({
                                title: 'Invalid Status',
                                message: 'Please select a valid Status from the list.',
                                indicator: 'red'
                            });
                            return;
                        }

                        let callTypeCheck = await frappe.db.get_value(
                            'support_ticket_call_type_master',
                            values.call_type,
                            'name'
                        );

                        if (!callTypeCheck?.message?.name) {
                            frappe.msgprint({
                                title: 'Invalid Call Type',
                                message: 'Please select a valid Call Type from the list.',
                                indicator: 'red'
                            });
                            return;
                        }

                        if (values.status === 'PENDING') {
                            if (!values.pending_status) {
                                frappe.msgprint('Please select Pending Status.');
                                return;
                            }

                            if (
                                values.pending_status !== 'From TSPL' &&
                                !values.pending_sub_status
                            ) {
                                frappe.msgprint('Please select Pending Sub Status.');
                                return;
                            }

                            if (
                                !values.remarks ||
                                !values.followup_date ||
                                !values.followup_time
                            ) {
                                frappe.msgprint(
                                    'Please enter Remarks, Followup Date and Followup Time.'
                                );
                                return;
                            }
                        }

                        if (values.status === 'COMPLETED') {
                            if (!values.root_cause_status || !values.remarks) {
                                frappe.msgprint(
                                    'Please select Root Cause Status and enter Remarks.'
                                );
                                return;
                            }
                        }

                        await frm.set_value('status', values.status);
                        await frm.set_value('call_type', values.call_type);

                        if (values.status === 'PENDING') {
                            await frm.set_value('sub_status', values.pending_status);
                            await frm.set_value(
                                'sub_sub_status',
                                values.pending_status === 'From TSPL'
                                    ? ''
                                    : values.pending_sub_status
                            );
                        } else if (values.status === 'COMPLETED') {
                            await frm.set_value('sub_status', values.root_cause_status);
                            await frm.set_value('sub_sub_status', '');
                        } else {
                            await frm.set_value('sub_status', '');
                            await frm.set_value('sub_sub_status', '');
                        }

                        let row = frm.add_child('followup_history');
                        row.followup_date = values.followup_date || '';
                        row.followup_time = values.followup_time || '';
                        row.call_type = values.call_type;
                        row.remarks = values.remarks || '';
                        row.updated_by = frappe.session.user;
                        row.updated_on = frappe.datetime.now_datetime();
                        row.status = values.status;

                        if (values.status === 'PENDING') {
                            row.sub_status = values.pending_status;
                            row.sub_sub_status =
                                values.pending_status === 'From TSPL'
                                    ? ''
                                    : values.pending_sub_status;
                        } else if (values.status === 'COMPLETED') {
                            row.sub_status = values.root_cause_status;
                            row.sub_sub_status = '';
                        } else {
                            row.sub_status = '';
                            row.sub_sub_status = '';
                        }

                        frm.refresh_field('followup_history');
                        dialog.hide();

                        frm.save().then(() => {
                            frappe.show_alert({
                                message: 'Status updated successfully.',
                                indicator: 'green'
                            });
                        });
                    }
                });

                // STATUS CHANGE
                dialog.fields_dict.status.df.onchange = function () {
                    let status = dialog.get_value('status');

                    dialog.set_value('pending_status', '');
                    dialog.set_value('pending_sub_status', '');
                    dialog.set_value('root_cause_status', '');

                    if (status === 'PENDING') {
                        dialog.set_df_property('pending_status', 'hidden', 0);
                        dialog.set_df_property('pending_sub_status', 'hidden', 1);
                        dialog.set_df_property('remarks', 'hidden', 0);
                        dialog.set_df_property('followup_date', 'hidden', 0);
                        dialog.set_df_property('followup_time', 'hidden', 0);
                        dialog.set_df_property('root_cause_status', 'hidden', 1);

                        dialog.set_df_property('remarks', 'reqd', 1);
                        dialog.set_df_property('followup_date', 'reqd', 1);
                        dialog.set_df_property('followup_time', 'reqd', 1);

                        frappe.db.get_list('support_ticket_sub_status_master', {
                            filters: { code: 'PENDING' },
                            fields: ['description'],
                            order_by: 'description asc'
                        }).then(data => {
                            dialog.set_df_property(
                                'pending_status',
                                'options',
                                data.map(row => row.description).join('\n')
                            );
                        });

                    } else if (status === 'COMPLETED') {
                        dialog.set_df_property('pending_status', 'hidden', 1);
                        dialog.set_df_property('pending_sub_status', 'hidden', 1);
                        dialog.set_df_property('remarks', 'hidden', 0);
                        dialog.set_df_property('followup_date', 'hidden', 1);
                        dialog.set_df_property('followup_time', 'hidden', 1);
                        dialog.set_df_property('root_cause_status', 'hidden', 0);

                        dialog.set_df_property('remarks', 'reqd', 1);
                        dialog.set_df_property('followup_date', 'reqd', 0);
                        dialog.set_df_property('followup_time', 'reqd', 0);

                        load_root_causes(dialog);

                    } else {
                        dialog.set_df_property('pending_status', 'hidden', 1);
                        dialog.set_df_property('pending_sub_status', 'hidden', 1);
                        dialog.set_df_property('remarks', 'hidden', 1);
                        dialog.set_df_property('followup_date', 'hidden', 1);
                        dialog.set_df_property('followup_time', 'hidden', 1);
                        dialog.set_df_property('root_cause_status', 'hidden', 1);

                        dialog.set_df_property('remarks', 'reqd', 0);
                        dialog.set_df_property('followup_date', 'reqd', 0);
                        dialog.set_df_property('followup_time', 'reqd', 0);
                    }
                };

                    // CALL TYPE CHANGE
                dialog.fields_dict.call_type.df.onchange = function () {
                    if (dialog.get_value('status') === 'COMPLETED') {
                        load_root_causes(dialog);
                    }
                };

                // PENDING STATUS CHANGE
                dialog.fields_dict.pending_status.df.onchange = function () {
                    let pendingStatus = dialog.get_value('pending_status');

                    dialog.set_value('pending_sub_status', '');

                    if (!pendingStatus || pendingStatus === 'From TSPL') {
                        dialog.set_df_property('pending_sub_status', 'options', '');
                        dialog.set_df_property('pending_sub_status', 'hidden', 1);
                        return;
                    }

                    frappe.db.get_list('support_ticket_sub_sub_status_master', {
                        filters: { code: pendingStatus },
                        fields: ['description'],
                        order_by: 'description asc'
                    }).then(data => {
                        dialog.set_df_property(
                            'pending_sub_status',
                            'options',
                            data.map(row => row.description).join('\n')
                        );
                        dialog.set_df_property('pending_sub_status', 'hidden', 0);
                    });
                };

                dialog.show();

                setTimeout(() => {
                    dialog.fields_dict.call_type.$wrapper.find('.btn-open').remove();
                    dialog.fields_dict.status.$wrapper.find('.btn-open').remove();
                    if (dialog.fields_dict.remarks && dialog.fields_dict.remarks.$wrapper) {
                        dialog.fields_dict.remarks.$wrapper.find('textarea').css({
                            'height': '44px',
                            'min-height': '44px'
                        });
                    }
                }, 100);

                dialog.set_df_property('pending_status', 'hidden', 1);
                dialog.set_df_property('pending_sub_status', 'hidden', 1);
                dialog.set_df_property('root_cause_status', 'hidden', 1);
            });
            
        }
    },

    // AFTER SAVE
    after_save(frm) {
        frappe.set_route('List', 'support_ticket');
    },

    // SETUP
    setup(frm) {
        const allUserQuery =
            'hbs_ticket_system.hbs_support_system.doctype.support_ticket.support_ticket.get_all_users';
        const supportUserQuery =
            'hbs_ticket_system.hbs_support_system.doctype.support_ticket.support_ticket.get_active_users';

        frm.set_query('executive', () => ({ query: allUserQuery }));
        frm.set_query('executive2', () => ({ query: supportUserQuery }));
    },

    // AMC STATUS
    amc_status(frm) {
        highlight_amc_fields(frm);
    },

    // AMC EXPIRY DATE
    amc_expiry_date(frm) {
        highlight_amc_fields(frm);
    },

    // SERIAL NO CHANGED
    serial_no(frm) {
        load_call_history(frm);

        if (!frm.doc.serial_no) {
            frm.set_value('unique_id', '');
            frm.set_value('party_name', '');
            frm.set_value('email', '');
            frm.set_value('amc_status', '');
            frm.set_value('amc_expiry_date', '');
            frm.set_value('cloud_status', '');
            frm.set_value('cloud_expiry_date', '');
            frm.set_value('modules_status', '');
            frm.set_value('modules_expiry_date', '');
            frm.set_value('amc_executive', '');
            frm.set_value('amc_executive2', '');
            frm.set_value('priority', '');
            frm.set_value('contact_name', '');
            frm.set_value('contact_phone', '');
            highlight_amc_fields(frm);
            clear_renewal_fields(frm);
            load_call_history(frm);
        } else {
            const serial = String(frm.doc.serial_no).trim();
            if (serial.length === 9) {
                frappe.call({
                    method: 'hbs_ticket_system.hbs_support_system.doctype.support_ticket.support_ticket.get_ledger_for_serial',
                    args: { serial_no: serial },
                    callback: function(r) {
                        const res = r.message;
                        if (res && (res.party_name || res.unique_id)) {
                            frm.set_value('unique_id', res.unique_id || '');
                            frm.set_value('party_name', res.party_name || '');
                            frm.set_value('email', res.email || '');
                            frm.set_value('amc_status', res.amc_status || 'NO');
                            frm.set_value('amc_expiry_date', res.amc_expiry_date || '');
                            frm.set_value('cloud_status', res.cloud_status || 'NO');
                            frm.set_value('cloud_expiry_date', res.cloud_expiry_date || '');
                            frm.set_value('modules_status', res.modules_status || 'NO');
                            frm.set_value('modules_expiry_date', res.modules_expiry_date || '');
                            frm.set_value('priority', res.amc_status === 'YES' ? 'P1' : 'P2');
                            if (res.amc_status === 'YES') {
                                frm.set_value('amc_executive', res.amc_executive || '');
                                frm.set_value('amc_executive2', res.amc_executive2 || '');
                            } else {
                                frm.set_value('amc_executive', '');
                                frm.set_value('amc_executive2', '');
                            }
                            highlight_amc_fields(frm);
                            load_call_history(frm);
                        }
                    }
                });
            }
            fetch_tally_renewal_details(frm, true);
        }
    },

    // VALIDATION
    async validate(frm) {
        if (!frm.doc.serial_no) {
            frappe.msgprint('Please select Serial No.');
            frappe.validated = false;
            return;
        }

        const serial = String(frm.doc.serial_no).trim();
        if (!is_genuine_tally_serial(serial)) {
            frappe.msgprint({
                title: __('Invalid Serial Number'),
                indicator: 'red',
                message: __('Invalid Serial Number')
            });
            frappe.validated = false;
            return;
        }

        if (frm.doc.contact_name && !frm.doc.contact_phone) {
            frappe.msgprint('Please enter Contact Phone.');
            frappe.validated = false;
            return;
        }

        // DUPLICATE OPEN TICKET CHECK
        if (frm.is_new()) {

            const serial_no = (frm.doc.serial_no || '').trim(); 
            const call_source = (frm.doc.call_source || '').trim(); 
            const call_type = (frm.doc.call_type || '').trim(); 
            // Check duplicates only when all fields are filled 
            if (serial_no && call_source && call_type) {
                let tickets = await frappe.db.get_list('support_ticket', {
                    filters: {
                        serial_no: frm.doc.serial_no,
                        call_source: frm.doc.call_source,
                        call_type: frm.doc.call_type,
                        status: ['!=', 'COMPLETED']
                    },
                    fields: [
                        'name', 'serial_no', 'call_source', 'call_type', 'status'
                    ],
                    order_by: 'creation desc',
                    limit: 1
                });

                if (tickets && tickets.length) {
                    const ticket = tickets[0];

                    frappe.validated = false;

                    frappe.msgprint({
                        title: 'Ticket Already Exists',
                        message:
                            'An open ticket already exists with the same ' +
                            'Serial No, Call Source and Call Type.' +
                            '<br><br><b>Ticket:</b> ' + ticket.name +
                            '<br><b>Status:</b> ' + (ticket.status || ''),
                        indicator: 'red',
                        primary_action: {
                            label: 'Open Ticket',
                            action: function () {
                                frappe.hide_msgprint();
                                frappe.set_route('Form', 'support_ticket', ticket.name);
                            }
                        }
                    });

                    return;
                }
            }
        }    
    }
});


// ==========================================================
// EXECUTIVE SELECTION DIALOG (BY WORKLOAD SORTING)
// ==========================================================
function open_executive_selection_dialog(frm) {
    let executives_list = [];

    let d = new frappe.ui.Dialog({
        title: __('Select Executive (Today\'s Workload)'),
        size: 'large',
        fields: [
            {
                fieldname: 'search_query',
                label: __('Search Executive'),
                fieldtype: 'Data',
                placeholder: __('Search executive by name or email...'),
                description: __('Shows tickets created today. Executives with the fewest tickets appear on top.')
            },
            {
                fieldname: 'executives_area',
                fieldtype: 'HTML'
            }
        ],
        primary_action_label: __('Close'),
        primary_action: function () {
            d.hide();
        }
    });

    function render_table(list) {
        const $area = d.fields_dict.executives_area.$wrapper;
        if (!list || !list.length) {
            $area.html('<div class="text-muted text-center" style="padding: 24px;">No active executives found.</div>');
            return;
        }

        const esc = v => frappe.utils.escape_html(String(v || ''));

        let html = `
            <div style="max-height: 420px; overflow-y: auto; margin-top: 10px; border: 1px solid var(--border-color, #e2e8f0); border-radius: 6px;">
                <table class="table table-bordered table-hover" style="font-size: 13px; margin-bottom: 0;">
                    <thead style="position: sticky; top: 0; background: var(--bg-light-gray, #f8f9fa); z-index: 1;">
                        <tr>
                            <th style="width: 44%;">Executive</th>
                            <th style="width: 20%; text-align: center;">NEW</th>
                            <th style="width: 20%; text-align: center;">FOLLOWUP</th>
                            <th style="width: 16%; text-align: center;">Action</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        list.forEach((exec, idx) => {
            const isAssigned = (frm.doc.executive2 === exec.name);
            const rowBg = isAssigned ? 'background: #eff6ff;' : '';

            html += `
                <tr style="cursor: pointer; ${rowBg}" class="executive-row" data-name="${esc(exec.name)}" data-full-name="${esc(exec.full_name)}">
                    <td>
                        <b style="color: #1e293b;">${esc(exec.full_name)}</b>
                        <div style="font-size: 11.5px; color: #64748b;">${esc(exec.name)}</div>
                    </td>
                    <td style="text-align: center; vertical-align: middle;">
                        <span style="display: inline-block; min-width: 28px; padding: 2px 8px; border-radius: 12px; font-weight: 600; font-size: 12px; background: #e0e7ff; color: #3730a3; border: 1px solid #c7d2fe;">
                            ${exec.new_count}
                        </span>
                    </td>
                    <td style="text-align: center; vertical-align: middle;">
                        <span style="display: inline-block; min-width: 28px; padding: 2px 8px; border-radius: 12px; font-weight: 600; font-size: 12px; background: #fef3c7; color: #92400e; border: 1px solid #fde68a;">
                            ${exec.followup_count}
                        </span>
                    </td>
                    <td style="text-align: center; vertical-align: middle;">
                        <button type="button" class="btn btn-xs ${isAssigned ? 'btn-success' : 'btn-primary'} btn-select-exec" data-name="${esc(exec.name)}" data-full-name="${esc(exec.full_name)}">
                            ${isAssigned ? '✓ Selected' : 'Select'}
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

        $area.html(html);

        async function pick_executive(user_id, full_name) {
            await frm.set_value('executive2', user_id);
            d.hide();
            frappe.show_alert({
                message: __('Assigned Executive 2: {0}', [full_name || user_id]),
                indicator: 'green'
            });
        }

        $area.find('.btn-select-exec').on('click', function (e) {
            e.stopPropagation();
            const u = $(this).data('name');
            const fn = $(this).data('full-name');
            pick_executive(u, fn);
        });

        $area.find('.executive-row').on('click', function () {
            const u = $(this).data('name');
            const fn = $(this).data('full-name');
            pick_executive(u, fn);
        });
    }

    d.fields_dict.executives_area.$wrapper.html(
        '<div class="text-muted text-center" style="padding: 24px;">Loading executive workloads...</div>'
    );
    d.show();

    frappe.call({
        method: 'hbs_ticket_system.hbs_support_system.doctype.support_ticket.support_ticket.get_executive_workload',
        callback: function (r) {
            executives_list = r.message || [];
            render_table(executives_list);

            d.fields_dict.search_query.$input.off('input.filter_exec').on('input.filter_exec', function () {
                const q = $(this).val().toLowerCase().trim();
                if (!q) {
                    render_table(executives_list);
                    return;
                }
                const filtered = executives_list.filter(e =>
                    (e.full_name || '').toLowerCase().includes(q) ||
                    (e.name || '').toLowerCase().includes(q)
                );
                render_table(filtered);
            });
        }
    });
}


// ==========================================================
// AMC HIGHLIGHT CONTROL
// ==========================================================
function highlight_amc_fields(frm) {
    const is_amc = frm.doc && frm.doc.amc_status === 'YES';
    const has_expiry = Boolean(frm.doc && frm.doc.amc_expiry_date);
    const is_expired = has_expiry && frappe.datetime.get_diff(frm.doc.amc_expiry_date, frappe.datetime.nowdate()) < 0;
    const fields = ['amc_status', 'amc_expiry_date', 'amc_executive', 'amc_executive2'];
    const expiry_field = frm.get_field('amc_expiry_date');

    if ((is_amc || is_expired) && frm.doc.amc_expiry_date) {
        const diff = frappe.datetime.get_diff(frm.doc.amc_expiry_date, frappe.datetime.nowdate());
        let bg = '#dcfce7';
        let border = '1.5px solid #16a34a';
        let text_color = '#15803d';
        let desc = '';

        if (diff < 0) {
            // Expired
            bg = '#fee2e2';
            border = '1.5px solid #dc2626';
            text_color = '#dc2626';
            desc = `<span style="color: #dc2626; font-weight: 600;">❌ AMC Expired on ${frappe.datetime.str_to_user(frm.doc.amc_expiry_date)} (${Math.abs(diff)} days ago). Renewal pending!</span>`;
        } else if (diff <= 15) {
            // Expiring soon (<= 15 days)
            bg = '#fef3c7';
            border = '1.5px solid #d97706';
            text_color = '#b45309';
            desc = `<span style="color: #b45309; font-weight: 600;">⚠️ AMC is expiring in ${diff} day${diff === 1 ? '' : 's'} on ${frappe.datetime.str_to_user(frm.doc.amc_expiry_date)}.</span>`;
        }

        fields.forEach(f => {
            const field = frm.get_field(f);
            if (field && field.$wrapper) {
                const $control = field.$wrapper.find('.form-control, .control-value, input, select');
                const $label = field.$wrapper.find('.control-label');
                field.$wrapper.addClass('amc-highlight');
                $control.css({
                    'background-color': bg,
                    'border': border,
                    'color': text_color,
                    'font-weight': '600'
                });
                $label.css({
                    'color': text_color,
                    'font-weight': '600'
                });
            }
        });

        if (expiry_field) {
            expiry_field.set_description(desc);
        }
    } else if (is_amc) {
        // AMC is YES but no expiry date set yet
        fields.forEach(f => {
            const field = frm.get_field(f);
            if (field && field.$wrapper) {
                const $control = field.$wrapper.find('.form-control, .control-value, input, select');
                const $label = field.$wrapper.find('.control-label');
                field.$wrapper.addClass('amc-highlight');
                $control.css({
                    'background-color': '#dcfce7',
                    'border': '1.5px solid #16a34a',
                    'color': '#15803d',
                    'font-weight': '600'
                });
                $label.css({
                    'color': '#15803d',
                    'font-weight': '600'
                });
            }
        });
        if (expiry_field) {
            expiry_field.set_description('');
        }
    } else {
        fields.forEach(f => {
            const field = frm.get_field(f);
            if (field && field.$wrapper) {
                const $control = field.$wrapper.find('.form-control, .control-value, input, select');
                const $label = field.$wrapper.find('.control-label');
                field.$wrapper.removeClass('amc-highlight');
                $control.css({
                    'background-color': '',
                    'border': '',
                    'color': '',
                    'font-weight': ''
                });
                $label.css({
                    'color': '',
                    'font-weight': ''
                });
            }
        });
        if (expiry_field) {
            expiry_field.set_description('');
        }
    }

    frm.toggle_display('amc_expiry_date', Boolean(is_amc || is_expired || (frm.doc && frm.doc.amc_status && frm.doc.amc_status !== 'NO')));
    frm.toggle_display('amc_executive', Boolean(is_amc));
    frm.toggle_display('amc_executive2', Boolean(is_amc));
}


// ==========================================================
// PARTY DETAILS READ-ONLY / EDITABLE CONTROL
// ==========================================================
function set_party_details_state(frm) {
    if (!frm.is_new()) {
        // For existing tickets, serial_no is always locked.
        frm.set_df_property('serial_no', 'read_only', 1);

        // Check user permission to alter ledger/party info
        if (frappe.session.user === 'Administrator') {
            frm.set_df_property('party_name', 'read_only', 0);
            frm.set_df_property('email', 'read_only', 0);
            frm.set_df_property('contact_name', 'read_only', 0);
            frm.set_df_property('contact_phone', 'read_only', 0);
            return;
        }

        frappe.call({
            method: 'hbs_ticket_system.hbs_support_system.doctype.support_ticket.support_ticket.get_support_user_settings',
            callback: function(r) {
                const settings = r.message || {};
                const can_edit = Boolean(settings.can_alter_ledger || settings.is_admin || settings.is_owner);
                frm.set_df_property('party_name', 'read_only', can_edit ? 0 : 1);
                frm.set_df_property('email', 'read_only', can_edit ? 0 : 1);
                frm.set_df_property('contact_name', 'read_only', can_edit ? 0 : 1);
                frm.set_df_property('contact_phone', 'read_only', can_edit ? 0 : 1);
            }
        });
        return;
    }

    // Creating new ticket
    const has_autofilled = Boolean(frm.doc.serial_no && frm.doc.party_name);

    if (!has_autofilled) {
        // Initial state before autofill: party fields are read-only
        frm.set_df_property('serial_no', 'read_only', 0);
        frm.set_df_property('party_name', 'read_only', 1);
        frm.set_df_property('email', 'read_only', 1);
        frm.set_df_property('contact_name', 'read_only', 1);
        frm.set_df_property('contact_phone', 'read_only', 1);

        ['party_name', 'email', 'contact_name', 'contact_phone'].forEach(f => {
            let field = frm.get_field(f);
            if (field && field.$wrapper) {
                field.$wrapper.find('input').css({
                    'background-color': 'var(--control-bg-read-only, #f8fafc)',
                    'cursor': 'not-allowed'
                });
            }
        });
    } else {
        // After autofill: serial_no is locked, party details editable
        frm.set_df_property('serial_no', 'read_only', 1);
        frm.set_df_property('party_name', 'read_only', 0);
        frm.set_df_property('email', 'read_only', 0);
        frm.set_df_property('contact_name', 'read_only', 0);
        frm.set_df_property('contact_phone', 'read_only', 0);

        ['party_name', 'email', 'contact_name', 'contact_phone'].forEach(f => {
            let field = frm.get_field(f);
            if (field && field.$wrapper) {
                field.$wrapper.find('input').css({
                    'background-color': '',
                    'cursor': ''
                });
            }
        });
    }
}


// ==========================================================
// AUTOFILL DETAILS FROM LEDGER (MULTI-CONTACT)
// ==========================================================
function open_autofill_dialog(frm) {
    let search_timer = null;
    let current_results = [];

    let d = new frappe.ui.Dialog({
        title: __('Autofill Details from Ledger'),
        size: 'large',
        fields: [
            {
                fieldname: 'search_query',
                label: __('Search Ledger'),
                fieldtype: 'Data',
                placeholder: __('Search by Serial No, Company Name, Contact Name, or Phone...'),
                description: __('Type to search. If a ledger has multiple contacts, each contact is displayed on a separate row.')
            },
            {
                fieldname: 'results_area',
                fieldtype: 'HTML'
            }
        ],
        secondary_action_label: __('➕ Add Customer / Ledger'),
        secondary_action: function () {
            const current_q = d.get_value('search_query') || '';
            open_quick_add_ledger_dialog(frm, d, current_q);
        }
    });

    function render_results(results) {
        current_results = results || [];
        const $area = d.fields_dict.results_area.$wrapper;

        if (!current_results.length) {
            $area.html(`
                <div class="text-muted text-center" style="padding: 24px;">
                    <p style="font-size: 14px; margin-bottom: 12px;">No matching ledger records found.</p>
                    <button type="button" class="btn btn-sm btn-primary btn-quick-add-from-empty" style="display: none;">
                        ➕ Add New Customer / Ledger
                    </button>
                </div>
            `);

            // Only show Add New Customer if user has permission
            frappe.call({
                method: 'hbs_ticket_system.hbs_support_system.doctype.support_ticket.support_ticket.get_support_user_settings',
                callback: function(r) {
                    const settings = r.message || {};
                    if (settings.can_alter_ledger || settings.is_admin || settings.is_owner) {
                        $area.find('.btn-quick-add-from-empty').show();
                    }
                }
            });

            $area.find('.btn-quick-add-from-empty').on('click', function () {
                const current_q = d.get_value('search_query') || '';
                open_quick_add_ledger_dialog(frm, d, current_q);
            });
            return;
        }

        const esc = v => frappe.utils.escape_html(String(v || ''));

        let html = `
            <div style="max-height: 400px; overflow-y: auto; margin-top: 10px; border: 1px solid var(--border-color); border-radius: 4px;">
                <table class="table table-bordered table-hover" style="font-size: 13px; margin-bottom: 0;">
                    <thead style="position: sticky; top: 0; background: var(--bg-light-gray, #f8f9fa); z-index: 1;">
                        <tr>
                            <th style="width: 14%;">Serial No</th>
                            <th style="width: 14%;">Customer ID</th>
                            <th style="width: 24%;">Company Name</th>
                            <th style="width: 18%;">Contact Person</th>
                            <th style="width: 14%;">Phone</th>
                            <th style="width: 8%;">AMC</th>
                            <th style="width: 8%; text-align: center;">Action</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        current_results.forEach((row, idx) => {
            const is_expired_amc = row.amc_expiry_date && frappe.datetime.get_diff(row.amc_expiry_date, frappe.datetime.nowdate()) < 0;
            const amcBadge = row.amc_status === 'YES' && !is_expired_amc
                ? `<span class="indicator-pill green" style="font-size: 11px;">YES</span>`
                : (is_expired_amc
                    ? `<span class="indicator-pill red" style="font-size: 11px; background: #fee2e2; color: #dc2626; font-weight: 600;">EXPIRED</span>`
                    : `<span class="indicator-pill gray" style="font-size: 11px;">NO</span>`);

            const contactDisplay = row.contact_name
                ? `<b>${esc(row.contact_name)}</b>`
                : `<span class="text-muted" style="font-style: italic;">No Contact</span>`;

            let phoneText = (row.contact_phone && row.phone_number)
                ? `${row.contact_phone} / ${row.phone_number}`
                : (row.contact_phone || row.phone_number || '');
            const phoneDisplay = phoneText
                ? esc(phoneText)
                : `<span class="text-muted">-</span>`;

            html += `
                <tr>
                    <td><b>${esc(row.serial_no)}</b></td>
                    <td><span style="font-family: monospace; font-size: 11.5px; color: #475569;">${esc(row.unique_id || '-')}</span></td>
                    <td>${esc(row.party_name)}</td>
                    <td>${contactDisplay}</td>
                    <td>${phoneDisplay}</td>
                    <td>${amcBadge}</td>
                    <td style="text-align: center;">
                        <button type="button" class="btn btn-xs btn-primary btn-select-ledger" data-idx="${idx}">
                            Select
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

        $area.html(html);

        $area.find('.btn-select-ledger').on('click', async function () {
            const idx = $(this).data('idx');
            const row = current_results[idx];
            if (!row) return;

            await frm.set_value('serial_no', row.serial_no);
            await frm.set_value('unique_id', row.unique_id || '');
            await frm.set_value('party_name', row.party_name || '');
            await frm.set_value('email', row.email || '');
            await frm.set_value('amc_status', row.amc_status || 'NO');
            await frm.set_value('amc_expiry_date', row.amc_expiry_date || '');
            await frm.set_value('priority', row.amc_status === 'YES' ? 'P1' : 'P2');
            await frm.set_value('contact_name', row.contact_name || '');
            await frm.set_value('contact_phone', row.contact_phone || row.phone_number || '');

            if (row.amc_status === 'YES') {
                await frm.set_value('amc_executive', row.amc_executive || '');
                await frm.set_value('amc_executive2', row.amc_executive2 || '');
            } else {
                await frm.set_value('amc_executive', '');
                await frm.set_value('amc_executive2', '');
            }

            highlight_amc_fields(frm);
            set_party_details_state(frm);
            load_call_history(frm);

            frappe.call({
                method: 'hbs_ticket_system.hbs_support_system.doctype.support_ticket.support_ticket.get_ledger_for_serial',
                args: { serial_no: row.serial_no },
                callback: async function(r) {
                    let res = r.message;
                    if (res) {
                        await frm.set_value('amc_status', res.amc_status || 'NO');
                        await frm.set_value('amc_expiry_date', res.amc_expiry_date || '');
                        await frm.set_value('cloud_status', res.cloud_status || 'NO');
                        await frm.set_value('cloud_expiry_date', res.cloud_expiry_date || '');
                        await frm.set_value('modules_status', res.modules_status || 'NO');
                        await frm.set_value('modules_expiry_date', res.modules_expiry_date || '');
                        await frm.set_value('priority', res.amc_status === 'YES' ? 'P1' : 'P2');
                        if (res.amc_status === 'YES') {
                            await frm.set_value('amc_executive', res.amc_executive || '');
                            await frm.set_value('amc_executive2', res.amc_executive2 || '');
                        } else {
                            await frm.set_value('amc_executive', '');
                            await frm.set_value('amc_executive2', '');
                        }
                        highlight_amc_fields(frm);
                    }
                }
            });

            d.hide();

            frappe.show_alert({
                message: __('Autofilled details for {0} ({1})', [row.serial_no, row.party_name || '']),
                indicator: 'green'
            });
        });
    }

    function do_search(query) {
        d.fields_dict.results_area.$wrapper.html(
            '<div class="text-muted text-center" style="padding: 18px;">Searching ledger...</div>'
        );

        frappe.call({
            method: 'hbs_ticket_system.hbs_support_system.doctype.support_ticket.support_ticket.search_ledger_contacts',
            args: { query: query || '' },
            callback: function (r) {
                render_results(r.message || []);
            }
        });
    }

    d.show();

    // Initial search: load entries
    do_search('');

    // Debounced search on input
    const $input = d.fields_dict.search_query.$input;
    $input.focus();
    $input.on('input', function () {
        clearTimeout(search_timer);
        const q = $(this).val();
        search_timer = setTimeout(() => do_search(q), 300);
    });
}


// ==========================================================
// QUICK ADD CUSTOMER / LEDGER MODAL DIALOG
// ==========================================================
function open_quick_add_ledger_dialog(frm, parent_dialog, prefill_query) {
    let prefill_serial = '';
    let prefill_name = '';

    if (prefill_query) {
        const trimmed = String(prefill_query).trim();
        if (/^\d{1,9}$/.test(trimmed)) {
            prefill_serial = trimmed;
        } else {
            prefill_name = trimmed;
        }
    }

    let add_d = new frappe.ui.Dialog({
        title: __('➕ Add New Customer / Ledger'),
        size: 'small',
        fields: [
            {
                fieldname: 'serial_no',
                label: __('Serial No'),
                fieldtype: 'Data',
                reqd: 1,
                length: 9,
                default: prefill_serial,
                description: __('Exactly 9 digits required')
            },
            {
                fieldname: 'party_name',
                label: __('Company / Customer Name'),
                fieldtype: 'Data',
                reqd: 1,
                default: prefill_name
            },
            {
                fieldname: 'contact_name',
                label: __('Contact Person Name'),
                fieldtype: 'Data',
                reqd: 1
            },
            {
                fieldname: 'contact_phone',
                label: __('Contact Phone'),
                fieldtype: 'Data',
                reqd: 1
            },
            {
                fieldname: 'email',
                label: __('Email'),
                fieldtype: 'Data'
            },
            {
                fieldname: 'amc_status',
                label: __('AMC Status'),
                fieldtype: 'Select',
                options: ['NO', 'YES'],
                default: 'NO',
                reqd: 1,
                onchange: function () {
                    const isYes = add_d.get_value('amc_status') === 'YES';
                    add_d.set_df_property('amc_expiry_date', 'hidden', !isYes);
                    add_d.set_df_property('amc_expiry_date', 'reqd', isYes ? 1 : 0);
                }
            },
            {
                fieldname: 'amc_expiry_date',
                label: __('AMC Expiry Date'),
                fieldtype: 'Date',
                hidden: 1
            }
        ],
        primary_action_label: __('Save & Autofill Ticket'),
        primary_action: function (values) {
            const serial_no = (values.serial_no || '').trim();
            const party_name = (values.party_name || '').trim();
            const contact_name = (values.contact_name || '').trim();
            const contact_phone = (values.contact_phone || '').trim();
            const email = (values.email || '').trim();
            const amc_status = values.amc_status || 'NO';
            const amc_expiry_date = values.amc_expiry_date || null;

            if (!is_genuine_tally_serial(serial_no)) {
                frappe.msgprint({
                    title: __('Invalid Serial Number'),
                    indicator: 'red',
                    message: __('Invalid Serial Number')
                });
                return;
            }
            if (!party_name) {
                frappe.msgprint(__('Company / Customer Name is required.'));
                return;
            }
            if (!contact_name || !contact_phone) {
                frappe.msgprint(__('Contact Name and Contact Phone are required.'));
                return;
            }
            if (amc_status === 'YES' && !amc_expiry_date) {
                frappe.msgprint(__('AMC Expiry Date is required when AMC Status is YES.'));
                return;
            }

            frappe.call({
                method: 'hbs_ticket_system.hbs_support_system.doctype.support_ticket.support_ticket.create_ledger_entry',
                args: {
                    serial_no: serial_no,
                    party_name: party_name,
                    contact_name: contact_name,
                    contact_phone: contact_phone,
                    email: email,
                    amc_status: amc_status,
                    amc_expiry_date: amc_expiry_date
                },
                freeze: true,
                freeze_message: __('Creating Ledger entry...'),
                callback: async function (r) {
                    if (r.exc || !r.message) return;

                    const res = r.message;
                    await frm.set_value('serial_no', res.serial_no);
                    await frm.set_value('party_name', res.party_name || '');
                    await frm.set_value('email', res.email || '');
                    await frm.set_value('amc_status', res.amc_status || 'NO');
                    await frm.set_value('amc_expiry_date', res.amc_expiry_date || '');
                    await frm.set_value('priority', res.amc_status === 'YES' ? 'P1' : 'P2');
                    await frm.set_value('contact_name', res.contact_name || '');
                    await frm.set_value('contact_phone', res.contact_phone || '');

                    highlight_amc_fields(frm);
                    set_party_details_state(frm);

                    load_call_history(frm);

                    add_d.hide();
                    if (parent_dialog) {
                        parent_dialog.hide();
                    }

                    frappe.show_alert({
                        message: __('Customer / Ledger created and ticket autofilled for {0}', [res.serial_no]),
                        indicator: 'green'
                    });
                }
            });
        }
    });

    add_d.show();

    function lookup_and_fill_tally_renewal(sn) {
        if (!sn || sn.length !== 9) return;
        frappe.call({
            method: 'hbs_ticket_system.hbs_support_system.doctype.support_ticket.support_ticket.get_tally_renewal_details',
            args: { serial_no: sn },
            callback: function(r) {
                const data = r.message;
                if (data) {
                    if (data.party_name && !add_d.get_value('party_name')) {
                        add_d.set_value('party_name', data.party_name);
                    }
                    if (data.contact_name && !add_d.get_value('contact_name')) {
                        add_d.set_value('contact_name', data.contact_name);
                    }
                    if (data.mobile && !add_d.get_value('contact_phone')) {
                        add_d.set_value('contact_phone', data.mobile);
                    }
                    if (data.email && !add_d.get_value('email')) {
                        add_d.set_value('email', data.email);
                    }
                    frappe.show_alert({
                        message: __('Auto-filled from HBS Tally Renewal ({0})', [data.party_name || sn]),
                        indicator: 'green'
                    }, 4);
                }
            }
        });
    }

    if (add_d.fields_dict.serial_no && add_d.fields_dict.serial_no.$input) {
        add_d.fields_dict.serial_no.$input.on('change input', function() {
            const sn = ($(this).val() || '').trim();
            if (sn.length === 9) {
                lookup_and_fill_tally_renewal(sn);
            }
        });
    }

    if (prefill_serial && prefill_serial.length === 9) {
        lookup_and_fill_tally_renewal(prefill_serial);
    }

    // Lock AMC fields in quick add for non-supervisors
    frappe.call({
        method: 'hbs_ticket_system.hbs_support_system.doctype.support_ticket.support_ticket.get_support_user_settings',
        callback: function(r) {
            const settings = r.message || {};
            const can_alter_amc = Boolean(settings.can_alter_amc || settings.is_owner || settings.is_admin);
            if (!can_alter_amc) {
                add_d.set_value('amc_status', 'NO');
                add_d.set_df_property('amc_status', 'read_only', 1);
                add_d.set_df_property('amc_expiry_date', 'hidden', 1);
            }
        }
    });
}


// ==========================================================
// LOAD ROOT CAUSE OPTIONS
// ==========================================================
function load_root_causes(dialog) {
    const callType = dialog.get_value('call_type');

    if (!callType) {
        dialog.set_df_property('root_cause_status', 'options', '');
        dialog.set_value('root_cause_status', '');
        return;
    }

    frappe.db.get_list('support_ticket_root_cause_master', {
        filters: { code: callType },
        fields: ['description'],
        order_by: 'description asc'
    }).then(data => {
        dialog.set_df_property(
            'root_cause_status',
            'options',
            data.map(row => row.description).join('\n')
        );
        dialog.set_value('root_cause_status', '');
    });
}


function is_genuine_tally_serial(serial) {
    if (!serial) return true;
    let s = String(serial).trim();
    if (s.length !== 9 || !/^\d+$/.test(s)) return false;
    if (!s.startsWith('7')) return false;
    let sum = s.split('').reduce((acc, d) => acc + parseInt(d, 10), 0);
    while (sum >= 10) {
        sum = String(sum).split('').reduce((acc, d) => acc + parseInt(d, 10), 0);
    }
    return sum === 9;
}


// ==========================================================
// RENDER FOLLOWUP TIMELINE (HBS CRM LEAD FORMAT)
// ==========================================================
function get_status_badge(status) {
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
    return `<span style="background:${bg}; color:${color}; border:1px solid ${border}; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.3px;">${frappe.utils.escape_html(s)}</span>`;
}

function format_followup_dt(dt) {
    if (!dt) return '';
    try {
        return frappe.datetime.str_to_user(dt);
    } catch (e) {
        return dt;
    }
}

function build_followup_timeline_html(historyList) {
    const esc = value => frappe.utils.escape_html(String(value || ''));
    const list = (historyList || []).slice();

    if (!list.length) {
        return '<div style="color: #94a3b8; font-style: italic; padding: 14px 16px; background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1;">No follow-up history recorded yet.</div>';
    }

    // Sort newest first to easily view recent activities
    list.sort((a, b) => {
        const dtA = a.updated_on || a.creation || '';
        const dtB = b.updated_on || b.creation || '';
        if (dtA && dtB) {
            return dtB.localeCompare(dtA);
        }
        return 0;
    });

    let html = ['<div class="activity-timeline" style="margin-top: 15px; margin-left: 12px; margin-bottom: 20px; border-left: 2px solid #e2e8f0; padding-left: 24px; position: relative;">'];

    list.forEach(row => {
        const user = esc(row.updated_by || 'System');
        const dtStr = row.updated_on ? esc(format_followup_dt(row.updated_on)) : '';
        const statusBadge = get_status_badge(row.status);
        const callTypeBadge = row.call_type
            ? `<span style="background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500;">🏷️ ${esc(row.call_type)}</span>`
            : '';
        const subStatusBadge = (row.sub_status || row.sub_sub_status)
            ? `<span style="background: #f8fafc; color: #475569; border: 1px solid #e2e8f0; padding: 2px 8px; border-radius: 4px; font-size: 11px;">📂 ${esc(row.sub_status || '')}${row.sub_sub_status ? ' › ' + esc(row.sub_sub_status) : ''}</span>`
            : '';
        const nextFollowupBadge = row.followup_date
            ? `<span style="background: #fffbeb; color: #92400e; border: 1px solid #fef3c7; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">📅 Next Followup: ${esc(frappe.datetime.str_to_user(row.followup_date))}${row.followup_time ? ' at ' + esc(row.followup_time.substring(0, 5)) : ''}</span>`
            : '';

        let actionBadge = '';
        if (row.remarks && row.remarks.includes('Call transferred')) {
            actionBadge = `<span style="background: #fdf2f8; color: #9d174d; border: 1px solid #fbcfe8; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">🔄 TRANSFERRED</span>`;
        } else if (row.remarks && row.remarks.includes('Call taken over')) {
            actionBadge = `<span style="background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">👤 TAKEN OVER</span>`;
        }

        html.push(`
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
                        ${actionBadge}
                        ${callTypeBadge}
                        ${subStatusBadge}
                        ${nextFollowupBadge}
                    </div>
                </div>
                <div style="background: #fcfcfc; border: 1px solid #d1d8dd; border-radius: 5px; padding: 3px 8px; font-size: 12px; color: #1c2126; white-space: pre-wrap; line-height: 1.25; box-shadow: 0 1px 2px rgba(0,0,0,0.02); width: 100%; box-sizing: border-box;">
                    ${esc(row.remarks || '-')}
                </div>
            </div>
        `);
    });

    html.push('</div>');
    return html.join('');
}

function render_followup_timeline(frm) {
    if (!frm.fields_dict.followup_history_html) return;
    if (frm.is_new() && (!frm.doc.followup_history || !frm.doc.followup_history.length)) {
        frm.fields_dict.followup_history_html.$wrapper.html(
            '<div style="color: #94a3b8; font-style: italic; padding: 12px 14px; background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1;">Follow-up timeline will be recorded once the ticket is saved.</div>'
        );
        return;
    }
    const html = build_followup_timeline_html(frm.doc.followup_history || []);
    frm.fields_dict.followup_history_html.$wrapper.html(html);
}


// LOAD CALL HISTORY
function load_call_history(frm) {
    const requestId = (frm._historyLoadRequestId || 0) + 1;
    frm._historyLoadRequestId = requestId;
    const serialNo = frm.doc.serial_no;
    const field = frm.fields_dict.call_history;

    if (!field) return;

    if (!serialNo ) {
        field.$wrapper.html(
            '<p class="text-muted">Select a Serial No to view call history.</p>'
        );
        return;
    }

    field.$wrapper.html(
        '<p class="text-muted">Loading call history...</p>'
    );

    frappe.call({
        method: 'hbs_ticket_system.hbs_support_system.doctype.support_ticket.support_ticket.get_call_history',
        args: {
            serial_no: frm.doc.serial_no || '',
            unique_id: frm.doc.unique_id || '',
            current_ticket: frm.doc.name || ''
        },
        callback: function (r) {
            if (
                frm._historyLoadRequestId !== requestId ||
                frm.doc.serial_no !== serialNo
            ) {
                return;
            }

            if (!r.message) return;

            const rows = r.message;

            if (!rows.length) {
                field.$wrapper.html(
                    '<p class="text-muted">No call history found.</p>'
                );
                return;
            }

            const esc = value =>
                frappe.utils.escape_html(String(value || ''));

            function get_status_pill(status) {
                const s = String(status || '').toUpperCase();
                let color = 'gray';
                if (s === 'COMPLETED') color = 'green';
                else if (s === 'FOLLOWUP') color = 'orange';
                else if (s === 'NEW') color = 'blue';
                else if (s === 'PENDING') color = 'red';
                return `<span class="indicator-pill ${color}" style="font-size: 11px;">${esc(status)}</span>`;
            }

            function format_datetime_str(dt) {
                if (!dt) return '';
                try {
                    const d = frappe.datetime.str_to_user(dt);
                    const timePart = dt.indexOf(' ') > -1 ? dt.split(' ')[1].substring(0, 5) : '';
                    return timePart ? `${d} ${timePart}` : d;
                } catch (e) {
                    return dt;
                }
            }

            let html = `
                <div style="overflow-x:auto">
                    <table class="table table-bordered table-hover" style="font-size: 13px;">
                        <thead>
                            <tr style="background: var(--bg-light-gray, #f8f9fa);">
                                <th>Ticket No</th>
                                <th>Serial No</th>
                                <th>Call Source</th>
                                <th>Call Type</th>
                                <th>Executive</th>
                                <th>Status</th>
                                <th>Creation Date</th>
                                <th style="text-align: center;">View Details</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            rows.forEach(row => {
                const ticketName = esc(row.name);
                const ticketUrl = `/app/support_ticket/${encodeURIComponent(row.name)}`;

                html += `
                    <tr>
                        <td>
                            <a href="${ticketUrl}" target="_blank" style="font-weight: 600; text-decoration: underline;">
                                ${ticketName}
                            </a>
                        </td>
                        <td><b>${esc(row.serial_no || '-')}</b></td>
                        <td>${esc(row.call_source || '-')}</td>
                        <td>${esc(row.call_type || '-')}</td>
                        <td>${esc(row.executive || '-')}</td>
                        <td>${get_status_pill(row.status)}</td>
                        <td>${esc(format_datetime_str(row.creation))}</td>
                        <td style="text-align: center;">
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

            field.$wrapper
                .off('click.viewdetails', '.view-ticket-details')
                .on('click.viewdetails', '.view-ticket-details', function () {
                    const ticket = $(this).attr('data-ticket');

                    if (!ticket) {
                        frappe.msgprint('Ticket number is missing.');
                        return;
                    }

                   show_ticket_followup_history(ticket);
                });

        }
    });
}


// SHOW TICKET FOLLOWUP HISTORY IN DIALOG


function show_ticket_followup_history(ticketName) {
    frappe.call({
        method: 'hbs_ticket_system.hbs_support_system.doctype.support_ticket.support_ticket.get_ticket_followup_history',
        args: {
            ticket_name: ticketName
        },
        callback: function (r) {
            const ticket = r.message;

            if (!ticket) {
                frappe.msgprint('No follow-up history returned for ' + ticketName);
                return;
            }

            const esc = value =>
                frappe.utils.escape_html(String(value || ''));

            const history = ticket.followup_history || [];

            function format_datetime_str(dt) {
                if (!dt) return '';
                try {
                    const d = frappe.datetime.str_to_user(dt);
                    const timePart = dt.indexOf(' ') > -1 ? dt.split(' ')[1].substring(0, 5) : '';
                    return timePart ? `${d} ${timePart}` : d;
                } catch (e) {
                    return dt;
                }
            }

            let html = `
                <div style="background: var(--bg-light-gray, #f8f9fa); padding: 10px 14px; border-radius: 6px; margin-bottom: 14px; font-size: 13px; border: 1px solid var(--border-color, #e2e8f0);">
                    <div class="row">
                        <div class="col-sm-4"><b>Ticket No:</b> ${esc(ticket.name)}</div>
                        <div class="col-sm-4"><b>Company:</b> ${esc(ticket.party_name || '-')}</div>
                        <div class="col-sm-4"><b>Status:</b> ${esc(ticket.status || '-')}</div>
                    </div>
                    <div class="row" style="margin-top: 6px;">
                        <div class="col-sm-4"><b>Contact:</b> ${esc(ticket.contact_name || '-')} (${esc(ticket.contact_phone || '-')})</div>
                        <div class="col-sm-4"><b>Executive:</b> ${esc(ticket.executive || '-')}</div>
                        <div class="col-sm-4"><b>Created:</b> ${esc(format_datetime_str(ticket.creation))}</div>
                    </div>
                    ${ticket.remarks ? `<div style="margin-top: 8px; padding-top: 6px; border-top: 1px dashed var(--border-color, #cbd5e1);"><b>Initial Remarks:</b> ${esc(ticket.remarks)}</div>` : ''}
                </div>
                ${build_followup_timeline_html(history)}
            `;

            const dialog = new frappe.ui.Dialog({
                title: 'Follow-up History - ' + ticket.name,
                size: 'extra-large',
                fields: [
                    {
                        fieldtype: 'HTML',
                        fieldname: 'history_html'
                    }
                ],
                primary_action_label: 'Close',
                primary_action() {
                    dialog.hide();
                }
            });

            dialog.fields_dict.history_html.$wrapper.html(html);
            dialog.show();
        },
        error: function (r) {
            console.error('Follow-up history request failed:', r);
            frappe.msgprint(
                'Failed to load follow-up history. Check the browser console for the error.'
            );
        }
    });
}

// ==========================================================
// LIVE TICKET TIMER (FROM STATUS NEW TO COMPLETED)
// ==========================================================
function setup_live_ticket_timer(frm) {
    if (window.support_ticket_form_timer) {
        clearInterval(window.support_ticket_form_timer);
        window.support_ticket_form_timer = null;
    }

    // Do NOT run timer for new unsaved tickets - timer starts only after ticket is created/saved
    if (frm.is_new() || !frm.doc.creation) {
        if (frm.fields_dict.pending_time && frm.fields_dict.pending_time.$wrapper) {
            frm.fields_dict.pending_time.$wrapper.find('input').val('');
        }
        return;
    }

    if (frm.doc.status === 'COMPLETED') {
        const completedText = frm.doc.total_time_taken || frm.doc.pending_time || 'Completed';
        frm.page.set_indicator(__('Completed ({0})', [completedText]), 'green');
        if (frm.fields_dict.pending_time && frm.fields_dict.pending_time.$wrapper) {
            frm.fields_dict.pending_time.$wrapper.find('input').val(completedText);
        }
        return;
    }

    const createdTime = new Date(frm.doc.creation).getTime();

    function tick() {
        if (!frm.doc || frm.doc.status === 'COMPLETED') {
            if (window.support_ticket_form_timer) {
                clearInterval(window.support_ticket_form_timer);
                window.support_ticket_form_timer = null;
            }
            return;
        }

        const elapsedSec = Math.max(0, Math.floor((Date.now() - createdTime) / 1000));
        const days = Math.floor(elapsedSec / 86400);
        const hours = Math.floor((elapsedSec % 86400) / 3600);
        const mins = Math.floor((elapsedSec % 3600) / 60);
        const secs = elapsedSec % 60;

        let displayParts = [];
        if (days) displayParts.push(`${days}d`);
        if (hours || days) displayParts.push(`${hours}h`);
        displayParts.push(`${mins}m`);
        displayParts.push(`${secs}s`);
        const timerStr = displayParts.join(' ');

        // Update form indicator badge
        const indicatorColor = (elapsedSec > 7200) ? 'red' : ((elapsedSec > 3600) ? 'orange' : 'blue');
        frm.page.set_indicator(__('Pending: {0}', [timerStr]), indicatorColor);

        // Update pending_time field input without marking form dirty
        if (frm.fields_dict.pending_time && frm.fields_dict.pending_time.$wrapper) {
            frm.fields_dict.pending_time.$wrapper.find('input').val(timerStr);
        }
    }

    tick();
    window.support_ticket_form_timer = setInterval(tick, 1000);
}


// ============================================================
// HBS TALLY RENEWAL AUTOFILL & NOTIFICATION
// ============================================================
function fetch_tally_renewal_details(frm, show_alert_if_not_found) {
    const serial = (frm.doc.serial_no || '').trim();
    if (!serial) {
        clear_renewal_fields(frm);
        return;
    }

    frappe.call({
        method: 'hbs_ticket_system.hbs_support_system.doctype.support_ticket.support_ticket.get_tally_renewal_details',
        args: { serial_no: serial },
        callback: (r) => {
            const data = r.message;
            if (data) {
                frm.set_value('renewal_party_name', data.party_name || '');
                frm.set_value('renewal_license_type', data.license_type || '');
                frm.set_value('renewal_tally_version', data.tally_version || '');
                frm.set_value('renewal_tss_expiry_date', data.tss_expiry_date || '');
                frm.set_value('renewal_partner_name', data.partner_name || '');
                frm.set_value('renewal_tss_status', data.tss_status || '');
                frm.set_value('renewal_mobile', data.mobile || '');
                frm.set_value('renewal_email', data.email || '');
            } else {
                clear_renewal_fields(frm);
                if (show_alert_if_not_found) {
                    frappe.msgprint({
                        title: __('Renewal Notice'),
                        indicator: 'orange',
                        message: __('This party is not in our database.')
                    });
                }
            }
        }
    });
}

function clear_renewal_fields(frm) {
    frm.set_value('renewal_party_name', '');
    frm.set_value('renewal_license_type', '');
    frm.set_value('renewal_tally_version', '');
    frm.set_value('renewal_tss_expiry_date', '');
    frm.set_value('renewal_partner_name', '');
    frm.set_value('renewal_tss_status', '');
    frm.set_value('renewal_mobile', '');
    frm.set_value('renewal_email', '');
}
