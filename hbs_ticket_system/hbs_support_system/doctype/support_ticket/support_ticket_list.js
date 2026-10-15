frappe.listview_settings['support_ticket'] = {

    
    add_fields: [
        'amc_status',
        'list_sort_order',
        'creation',
        'pending_time_start'
    ],

    formatters: {
        pending_time(value, df, doc) {
            if (!doc.creation) return '';

            const created = frappe.datetime.str_to_obj(doc.creation);
            const minutes = Math.max(
                0,
                Math.floor((Date.now() - created.getTime()) / 60000)
            );

            const days = Math.floor(minutes / 1440);
            const hours = Math.floor((minutes % 1440) / 60);
            const mins = minutes % 60;

            if (days) return `${days} days ${hours} hr`;
            if (hours) return `${hours} hr ${mins} min`;
            return `${mins} min`;
        }
    },
    
    order_by: 'list_sort_order asc, creation desc',

    // ==========================================
    // APPLY NORMAL FILTERS
    // ==========================================

    //NEW Default

    
    apply_default_filters(listview) {
        listview.filter_area.clear();

        if (this.new_tickets_only) {
            // Show all NEW tickets, regardless of executive2
            listview.filter_area.add([
                ['support_ticket', 'status', '=', 'NEW']
            ]);
        } else {
            // Existing behavior for unchecked users
            listview.filter_area.add([
                ['support_ticket', 'status', '!=', 'COMPLETED']
            ]);

            if (frappe.session.user !== 'Administrator') {
                listview.filter_area.add([
                    ['support_ticket', 'executive2', '=', frappe.session.user]
                ]);
            }
        }
    },
    
    //End New Default


    set_active_button(listview, button_name) {

        this.active_button = button_name;

        listview.page.inner_toolbar.find('.btn').css({
            'background-color': '',
            'border-color': '',
            'color': ''
        });

        listview.page.inner_toolbar.find('.btn').filter(function() {
            return $(this).text().trim() === button_name;
        }).css({
            'background-color': '#add8e6',
            'border-color': '#87ceeb',
            'color': '#000'
        });
    },

    // ==========================================
    // SHOW ONLY SELECTED TICKETS
    // ==========================================

    show_matching_tickets(listview, names) {

        // First restore normal filters
        this.apply_default_filters(listview);

        if (!names || !names.length) {

            frappe.msgprint(
                'No matching tickets found.'
            );

            listview.refresh();

            return;
        }

        // Add only matching ticket names
        listview.filter_area.add([
            [
                'support_ticket',
                'name',
                'in',
                names
            ]
        ]);

        listview.refresh();
    },


    // ==========================================
    // ONLOAD
    // ==========================================

    onload(listview) {

        listview.page.add_inner_button('User Ticket Summary', function () {
            frappe.set_route('query-report', 'hbs_support_ticket');
        });

        // Apply normal filters initially
        frappe.call({
            method: 'hbs_ticket_system.hbs_support_system.doctype.support_ticket.support_ticket.get_new_tickets_only',
            callback: (r) => {
                this.new_tickets_only = Number(r.message) === 1;

                this.apply_default_filters(listview);
                listview.refresh();
            }
        });

        // ======================================
        // CREATED > 2 HOURS
        // ======================================

        listview.page.add_inner_button(
            'Created > 2 Hours',
            function() {

                frappe.listview_settings['support_ticket']
                    .set_active_button(listview, 'Created > 2 Hours');

                frappe.call({

                    method:
                        'hbs_ticket_system.hbs_support_system.support_ticket_reportview.get_old_created_tickets',

                    freeze: true,

                    freeze_message:
                        'Finding tickets older than 2 hours...',

                    callback: function(r) {

                        let names =
                            r.message || [];

                        frappe.listview_settings[
                            'support_ticket'
                        ].show_matching_tickets(
                            listview,
                            names
                        );

                    }

                });

            }
        );


        // ======================================
        // LAST REMARKS > 2 HOURS
        // ======================================

        listview.page.add_inner_button(
            'Last Remarks > 2 Hours',
            function() {

                frappe.listview_settings['support_ticket']
                    .set_active_button(listview, 'Last Remarks > 2 Hours');

                frappe.call({


                    method:
                        'hbs_ticket_system.hbs_support_system.support_ticket_reportview.get_old_remark_tickets',

                    freeze: true,

                    freeze_message:
                        'Finding tickets with remarks older than 2 hours...',

                    callback: function(r) {

                        let names =
                            r.message || [];

                        frappe.listview_settings[
                            'support_ticket'
                        ].show_matching_tickets(
                            listview,
                            names
                        );

                    }

                });

            }
        );


        // ======================================
        // NORMAL SORTING
        // ======================================

        listview.page.add_inner_button(
            'Normal Sorting',
            function() {

                frappe.listview_settings['support_ticket']
                    .set_active_button(listview, 'Normal Sorting');


                frappe.listview_settings[
                    'support_ticket'
                ].apply_default_filters(
                    listview
                );

                listview.refresh();

            }
        );

    },


    // ==========================================
    // REFRESH
    // ==========================================

    refresh(listview) {

        setTimeout(() => {

            if (this.active_button) {
                this.set_active_button(
                    listview,
                    this.active_button
                );
            }

            listview.$result
                .find('.list-row')
                .each(function() {

                    let row = $(this);

                    let name =
                        row.find(
                            '.list-row-checkbox'
                        ).data('name');

                    if (!name) {
                        return;
                    }

                    let doc =
                        listview.data.find(
                            d => d.name === name
                        );

                    // AMC YES = RED
                    if (
                        doc &&
                        doc.amc_status === 'YES'
                    ) {

                        row.find(
                            '.level-left, .level-right, a, span'
                        ).each(function() {

                            this.style.setProperty(
                                'color',
                                'red',
                                'important'
                            );

                        });

                    }

                });

        }, 300);

    }

};



(function () {
    const REFRESH_INTERVAL = 1 * 60 * 1000; // 5 minutes

    if (window.support_ticket_list_timer) {
        clearInterval(window.support_ticket_list_timer);
    }

    window.support_ticket_list_timer = setInterval(() => {
        if (
            frappe.get_route()[0] === "List" &&
            frappe.get_route()[1] === "support_ticket"
        ) {

            const list_view = cur_list;
            if (list_view) {
                list_view.refresh();
            }
        }
    }, REFRESH_INTERVAL);
})();