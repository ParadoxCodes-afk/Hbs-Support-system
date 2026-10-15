
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
            frm.set_df_property('executive', 'read_only', 1);
            frm.set_df_property('executive2', 'read_only', 1);

        }

        ['call_source', 'call_type', 'executive', 'executive2']
            .forEach(field => frm.set_df_property(field, 'only_select', 1));


        // AMC EXPIRY DATE
        frm.toggle_display(
            'amc_expiry_date',
            frm.doc.amc_status !== 'NO'
        );

        setTimeout(() => show_followup_remarks(frm), 500);

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

    // ADD CONTACTS BUTTON - CREATE MODE ONLY

        if (frm.is_new()) {
            frm.add_custom_button('Add Contacts', async function () {
            if (!frm.doc.serial_no) {
                frappe.msgprint('Please select Serial No first.');
                return;
            }

            // Open dialog immediately
            let contacts = [];

            let d = new frappe.ui.Dialog({
                title: 'Select or Add Contact',
                fields: [
                    {
                        fieldname: 'contact_mode',
                        label: 'Contact',
                        fieldtype: 'Select',
                        options: [
                            'Select Existing Contact',
                            'Add New Contact'
                        ],
                        default: 'Add New Contact',
                        reqd: 1,
                        onchange: function () {
                            const existing =
                                d.get_value('contact_mode') === 'Select Existing Contact';

                            d.set_df_property('existing_contact', 'hidden', !existing);
                            d.set_df_property('new_contact_name', 'hidden', existing);
                            d.set_df_property('new_contact_phone', 'hidden', existing);
                        }
                    },
                    {
                        fieldname: 'existing_contact',
                        label: 'Existing Contact',
                        fieldtype: 'Autocomplete',
                        options: '',
                        hidden: true
                    },
                    {
                        fieldname: 'new_contact_name',
                        label: 'Contact Name',
                        fieldtype: 'Data'
                    },
                    {
                        fieldname: 'new_contact_phone',
                        label: 'Contact Phone',
                        fieldtype: 'Data'
                    }
                ],
                primary_action_label: 'Submit',
                primary_action: async function (values) {
                    let name = '';
                    let phone = '';

                    if (values.contact_mode === 'Select Existing Contact') {
                        const selected = contacts.find(c =>
                            `${c.contact_name || ''} - ${c.contact_phone || ''}` ===
                            values.existing_contact
                        );

                        if (!selected) {
                            frappe.msgprint('Please select an existing contact.');
                            return;
                        }

                        name = selected.contact_name || '';
                        phone = selected.contact_phone || '';
                    } else {
                        name = (values.new_contact_name || '').trim();
                        phone = (values.new_contact_phone || '').trim();

                        if (!name || !phone) {
                            frappe.msgprint('Please enter both contact name and phone.');
                            return;
                        }
                    }

                    await frm.set_value('contact_name', name);
                    await frm.set_value('contact_phone', phone);

                    d.hide();
                }
            });

            d.show();

            // Load contacts after opening the dialog
            try {
                const r = await frappe.call({
                    method: 'hbs_ticket_system.hbs_support_system.doctype.support_ticket.support_ticket.get_ticket_contacts',
                    args: {
                        serial_no: frm.doc.serial_no
                    }
                });

                contacts = r.message || [];

                if (contacts.length) {
                    const options = contacts.map(c =>
                        `${c.contact_name || ''} - ${c.contact_phone || ''}`
                    ).join('\n');

                    d.set_df_property('existing_contact', 'options', options);
                    d.set_df_property('contact_mode', 'options', [
                        'Select Existing Contact',
                        'Add New Contact'
                    ]);

                    d.set_value('contact_mode', 'Select Existing Contact');
                } else {
                    d.set_value('contact_mode', 'Add New Contact');
                }

                d.fields_dict.contact_mode.df.onchange();
            } catch (e) {
                console.error(e);
                frappe.msgprint('Unable to load contacts.');
            }
        });

        }


        /////End contact button new

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
        const userQuery =
            'hbs_ticket_system.hbs_support_system.doctype.support_ticket.support_ticket.get_active_users';

        frm.set_query('executive', () => ({ query: userQuery }));
        frm.set_query('executive2', () => ({ query: userQuery }));
    },

    // AMC STATUS
    amc_status(frm) {
        frm.toggle_display('amc_expiry_date', frm.doc.amc_status !== 'NO');
    },

    // SERIAL NO SELECTED
    
    async serial_no(frm) {
        const serialNo = frm.doc.serial_no;
        // Prevent an older request from overwriting newer details
        const requestId = (frm._contactLoadRequestId || 0) + 1;
        frm._contactLoadRequestId = requestId;


        // Refresh history for the newly selected serial
        load_call_history(frm);

        if (!serialNo) {
            await frm.set_value('party_name', '');
            await frm.set_value('email', '');
            await frm.set_value('amc_status', '');
            await frm.set_value('amc_expiry_date', '');
            await frm.set_value('priority', '');
            await frm.set_value('contact_name', '');
            await frm.set_value('contact_phone', '');
            return;
        }

        try {
            const ledger = await frappe.db.get_doc(
                'support_ticket_ledger',
                serialNo
            );

            // Ignore response if Serial No has changed
            if (
                frm._contactLoadRequestId !== requestId ||
                frm.doc.serial_no !== serialNo
            ) {
                return;
            }

            await frm.set_value('party_name', ledger.party_name || '');
            await frm.set_value('email', ledger.email || '');
            await frm.set_value('amc_status', ledger.amc_status || '');
            await frm.set_value('amc_expiry_date',ledger.amc_expiry_date || '');
            await frm.set_value('priority',ledger.amc_status === 'YES' ? 'P1' : 'P2');

            const contacts = ledger.contact_details || [];

            // Auto-fill the last available contact
            const lastContact = contacts.length
                ? contacts[contacts.length - 1]
                : {};
            
            await frm.set_value('contact_name',lastContact.contact_name || '');
            await frm.set_value('contact_phone',lastContact.contact_phone || '');
        } catch (error) {
            if (frm._contactLoadRequestId !== requestId || frm.doc.serial_no !== serialNo) return;

            console.error(error);
            frappe.msgprint('Unable to load the selected Serial No details.');
        }
    },

    // VALIDATION
    async validate(frm) {
        if (!frm.doc.serial_no) {
            frappe.msgprint('Please select Serial No.');
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


// ==========================================================
// SHOW FOLLOWUP REMARKS IN HISTORY GRID
// ==========================================================
function show_followup_remarks(frm) {
    const field = frm.fields_dict.followup_history;

    if (!field || !field.grid) return;

    const grid = field.grid;

    grid.wrapper.find('.grid-row').each(function () {
        const gridRow = $(this);

        gridRow.children('.remarks-display').remove();

        const rowName = gridRow.attr('data-name');
        if (!rowName) return;

        const doc = (frm.doc.followup_history || []).find(
            row => row.name === rowName
        );

        if (!doc || !doc.remarks) return;

        $('<div class="remarks-display"></div>')
            .text('Remarks: ' + doc.remarks)
            .insertAfter(gridRow.children('.data-row'));
    });
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
            serial_no: frm.doc.serial_no,
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

            let html = `
                <div style="overflow-x:auto">
                    <table class="table table-bordered table-hover">
                        <thead>
                            <tr>
                                <th>Ticket No</th>
                                <th>Call Source</th>
                                <th>Call Type</th>
                                <th>Status</th>
                                <th>Creation Date</th>
                                <th>View Details</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            rows.forEach(row => {
                const ticketName = esc(row.name);

                html += `
                    <tr>
                        <td>${ticketName}</td>
                        <td>${esc(row.call_source)}</td>
                        <td>${esc(row.call_type)}</td>
                        <td>${esc(row.status)}</td>
                        <td>${esc(
                            row.creation
                                ? frappe.datetime.str_to_user(row.creation)
                                : ''
                        )}</td>
                        <td>
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

            let html = `
                <p>
                    <b>Ticket No:</b> ${esc(ticket.name)}
                    &nbsp;&nbsp;
                    <b>Create Date Time:</b> ${esc(frappe.datetime.str_to_user(ticket.creation))}
                    &nbsp;&nbsp;
                    <b>Current Status:</b> ${esc(ticket.status)}
                </p>
                <div style="overflow-x:auto">
                    <table class="table table-bordered table-hover">
                        <thead>
                            <tr>
                                <th>Call Type</th>
                                <th>Status</th>
                                <th>Sub Status</th>
                                <th>Sub Sub Status</th>
                                <th>Updated By</th>
                                <th>Updated On</th>
                                <th>Followup Date</th>
                                <th>Followup Time</th>

                            </tr>
                        </thead>
                        <tbody>
            `;

            if (!history.length) {
                html += `
                    <tr>
                        <td colspan="8" class="text-muted">
                            No follow-up history found.
                        </td>
                    </tr>
                `;
            }

            history.forEach(row => {
                html += `
                    <tr>
                        <td>${esc(row.call_type)}</td>
                        <td>${esc(row.status)}</td>
                        <td>${esc(row.sub_status)}</td>
                        <td>${esc(row.sub_sub_status)}</td>
                        <td>${esc(row.updated_by)}</td>
                        <td>${row.updated_on ? esc(frappe.datetime.str_to_user(row.updated_on)) : ''}</td>
                        <td>${esc(row.followup_date)}</td>
                        <td>${esc(row.followup_time)}</td>
                    </tr>

                    <tr class="remarks-row">
                        <td colspan="8" style="text-align:left !important; padding:2px 8px !important;">
                            <div style="text-align:left !important; float:none !important;">
                                <b>Remarks:</b> ${esc(row.remarks)}
                            </div>
                        </td>
                    </tr>
               
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
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