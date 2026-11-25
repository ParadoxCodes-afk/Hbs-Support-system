// Copyright (c) 2026, HBS and contributors
// For license information, please see license.txt

frappe.query_reports["hbs_support_ticket"] = {
    filters: [
        {
            fieldname: "from_date",
            label: __("From Date"),
            fieldtype: "Date",
            default: frappe.datetime.get_today(),
            reqd: 0
        },
        {
            fieldname: "to_date",
            label: __("To Date"),
            fieldtype: "Date",
            default: frappe.datetime.get_today(),
            reqd: 0
        },
        {
            fieldname: "executive",
            label: __("Executive"),
            fieldtype: "Link",
            options: "User",
            reqd: 0
        },
        {
            fieldname: "status",
            label: __("Status"),
            fieldtype: "Select",
            options: [
                "All",
                "OPEN",
                "NEW",
                "FOLLOWUP",
                "PENDING",
                "COMPLETED"
            ],
            default: "All"
        },
        {
            fieldname: "amc_status",
            label: __("AMC Status"),
            fieldtype: "Select",
            options: [
                "All",
                "YES",
                "NO"
            ],
            default: "All"
        },
        {
            fieldname: "dynamic_filters",
            label: __("Dynamic Filters"),
            fieldtype: "Data",
            hidden: 1,
            default: ""
        }
    ],

    formatter: function(value, row, column, data, default_formatter) {
        value = default_formatter(value, row, column, data);

        if (column.fieldname === "long_pending_tickets" && data && data.long_pending_tickets > 0) {
            value = `<span class="indicator-pill red" style="font-weight: 600;">${data.long_pending_tickets}</span>`;
        }

        if (column.fieldname === "completed_tickets" && data && data.completed_tickets > 0) {
            value = `<span style="font-weight: 600; color: #16a34a;">${data.completed_tickets}</span>`;
        }

        if (column.fieldname === "amc_tickets" && data && data.amc_tickets > 0) {
            value = `<span style="font-weight: 600; color: #2563eb;">${data.amc_tickets}</span>`;
        }

        return value;
    },

    open_tickets: function(btn, event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        let exec = $(btn).attr("data-exec");
        let report = frappe.query_report;
        if (report && exec) {
            open_ticket_drilldown_dialog(report, exec);
        }
    },

    get_datatable_options: function(options) {
        return Object.assign(options, {
            layout: "fluid"
        });
    },

    after_datatable_render: function(datatable) {
        if (!datatable || !datatable.wrapper) return;
        $(datatable.wrapper).find(".dt-scrollable").css({
            "min-height": "140px",
            "overflow-x": "auto"
        });
    },

    onload: function(report) {
        frappe.dom.set_style(`
            .report-wrapper .dt-scrollable,
            .datatable .dt-scrollable {
                min-height: 140px !important;
            }
        `);

        // Event delegation for drilldown button in datatable
        if (report && report.page && report.page.wrapper) {
            report.page.wrapper.off("click", ".btn-drilldown-ticket").on("click", ".btn-drilldown-ticket", function(e) {
                e.preventDefault();
                e.stopPropagation();
                let exec = $(this).attr("data-exec");
                if (exec) {
                    open_ticket_drilldown_dialog(report, exec);
                }
            });
        }
        // Setup Desk-style dynamic Filter button using frappe.ui.FilterGroup
        if (report && report.page && report.page.page_form) {
            let $form = report.page.page_form;
            if (!$form.find(".btn-desk-filter").length) {
                let $btn_container = $(`
                    <div class="form-group desk-filter-btn-container" style="display: inline-flex; align-items: center; padding: 0 6px; margin-bottom: 8px;">
                        <button class="btn btn-xs btn-default btn-desk-filter" style="height: 28px; font-weight: 600; display: inline-flex; align-items: center; gap: 5px;">
                            <span class="filter-icon"><i class="fa fa-filter"></i></span>
                            <span class="button-label">${__("Filter")}</span>
                        </button>
                        <button class="btn btn-xs btn-default filter-x-button text-muted" style="height: 28px; display: none; margin-left: 4px; padding: 2px 6px;">
                            <i class="fa fa-times"></i>
                        </button>
                    </div>
                `);
                $form.append($btn_container);

                try {
                    let filter_group = new frappe.ui.FilterGroup({
                        parent: $btn_container,
                        doctype: "support_ticket",
                        filter_button: $btn_container.find(".btn-desk-filter"),
                        filter_x_button: $btn_container.find(".filter-x-button"),
                        on_change: function() {
                            let raw_filters = filter_group.get_filters();
                            let filter_json = (raw_filters && raw_filters.length) ? JSON.stringify(raw_filters) : "";
                            report.set_filter_value("dynamic_filters", filter_json);
                            report.refresh();
                        }
                    });
                    report.filter_group = filter_group;
                } catch (e) {
                    console.warn("Could not initialize frappe.ui.FilterGroup:", e);
                }
            }
        }
    }
};

function open_ticket_drilldown_dialog(report, exec_id) {
    let filters = report.get_values() || {};
    let label = exec_id === "Unassigned" ? __("Unassigned Tickets") : exec_id;

    let dynamic_val = filters.dynamic_filters || "";
    if (!dynamic_val && report.filter_group) {
        let raw = report.filter_group.get_filters();
        if (raw && raw.length) dynamic_val = JSON.stringify(raw);
    }

    let args = {
        executive: exec_id,
        from_date: filters.from_date || "",
        to_date: filters.to_date || "",
        status: filters.status || "",
        amc_status: filters.amc_status || "",
        dynamic_filters: dynamic_val
    };

    frappe.call({
        method: "hbs_ticket_system.hbs_support_system.report.hbs_support_ticket.hbs_support_ticket.get_executive_ticket_details",
        args: args,
        freeze: true,
        freeze_message: __("Loading tickets for {0}...", [label]),
        callback: function(r) {
            let tickets = r.message || [];
            render_ticket_drilldown_dialog(exec_id, label, tickets, filters);
        }
    });
}

function render_ticket_drilldown_dialog(exec_id, label, tickets, filters) {
    let get_status_badge = function(st) {
        st = (st || "").toUpperCase();
        let color_map = {
            "COMPLETED": "badge-success",
            "PENDING": "badge-warning",
            "FOLLOWUP": "badge-info",
            "NEW": "badge-primary"
        };
        let cls = color_map[st] || "badge-secondary";
        return `<span class="badge ${cls}" style="font-size: 11px; font-weight: 600; text-transform: uppercase;">${st || 'NEW'}</span>`;
    };

    let get_amc_badge = function(amc) {
        let is_yes = (amc || "").toUpperCase() === "YES";
        let cls = is_yes ? "badge-success" : "badge-light text-muted";
        return `<span class="badge ${cls}" style="font-size: 11px; font-weight: 600;">${is_yes ? 'AMC YES' : 'NO'}</span>`;
    };

    let build_table_rows = function(ticket_list) {
        if (!ticket_list || ticket_list.length === 0) {
            return `<tr><td colspan="9" class="text-center text-muted" style="padding: 24px;">${__("No tickets found for this selection.")}</td></tr>`;
        }
        return ticket_list.map((t, idx) => `
            <tr>
                <td style="text-align: center; color: #64748b; font-size: 11px;">${idx + 1}</td>
                <td>
                    <a href="/app/support_ticket/${t.name}" target="_blank" style="font-weight: 700; font-family: monospace; color: #1d4ed8;">
                        ${t.name}
                    </a>
                </td>
                <td>
                    <div style="font-weight: 600; color: #0f172a;">${frappe.utils.escape_html(t.party_name || '-')}</div>
                    <div style="font-size: 11px; color: #64748b;">Serial: <b>${frappe.utils.escape_html(t.serial_no || '-')}</b></div>
                </td>
                <td>
                    <div>${frappe.utils.escape_html(t.contact_name || '-')}</div>
                    <div style="font-size: 11px; color: #64748b;">${frappe.utils.escape_html(t.contact_phone || '')}</div>
                </td>
                <td>
                    <span class="badge badge-light" style="font-size: 11px; color: #334155; font-weight: 600; background: #f1f5f9; border: 1px solid #e2e8f0;">
                        ${frappe.utils.escape_html(t.call_source || '-')}
                    </span>
                </td>
                <td style="text-align: center;">${get_amc_badge(t.amc_status)}</td>
                <td style="text-align: center;">${get_status_badge(t.status)}</td>
                <td style="text-align: center; white-space: nowrap; font-size: 11px; color: #475569;">${t.creation_time || '-'}</td>
                <td style="text-align: center; font-weight: 600; font-size: 11px; color: #0284c7;">
                    ${frappe.utils.escape_html(t.status === 'COMPLETED' ? (t.total_time_taken || '-') : (t.pending_time || '-'))}
                </td>
            </tr>
        `).join("");
    };

    let dialog = new frappe.ui.Dialog({
        title: __("🎫 Tickets: {0}", [label]),
        size: "extra-large",
        fields: [
            {
                fieldname: "header_html",
                fieldtype: "HTML",
                options: `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 16px; flex-wrap: wrap; gap: 10px;">
                        <div>
                            <span style="font-size: 15px; font-weight: 700; color: #0f172a;">${frappe.utils.escape_html(label)}</span>
                            <span class="text-muted" style="margin-left: 12px; font-size: 13px;">Total Tickets: <b style="color: #0284c7;">${tickets.length}</b></span>
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <input type="text" class="form-control form-control-sm ticket-filter-input" placeholder="${__('Search party, serial, call source, contact...')}" style="width: 260px; font-size: 12px; border-radius: 6px;">
                            <button class="btn btn-xs btn-default btn-open-ticket-list" style="font-weight: 600; border-radius: 6px; padding: 5px 12px;">
                                <i class="fa fa-external-link"></i> ${__('Open in List View')}
                            </button>
                        </div>
                    </div>
                `
            },
            {
                fieldname: "tickets_table_html",
                fieldtype: "HTML",
                options: `
                    <div style="max-height: 500px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                        <table class="table table-bordered table-hover table-sm" style="margin: 0; font-size: 12px; width: 100%;">
                            <thead style="position: sticky; top: 0; background: #f1f5f9; z-index: 2;">
                                <tr style="color: #334155; font-size: 11px; text-transform: uppercase;">
                                    <th style="width: 40px; text-align: center;">#</th>
                                    <th style="width: 130px;">${__('Ticket ID')}</th>
                                    <th style="width: 200px;">${__('Party & Serial')}</th>
                                    <th style="width: 150px;">${__('Contact')}</th>
                                    <th style="width: 120px;">${__('Call Source')}</th>
                                    <th style="width: 80px; text-align: center;">${__('AMC')}</th>
                                    <th style="width: 100px; text-align: center;">${__('Status')}</th>
                                    <th style="width: 120px; text-align: center;">${__('Created')}</th>
                                    <th style="width: 100px; text-align: center;">${__('Duration')}</th>
                                </tr>
                            </thead>
                            <tbody class="tickets-table-body">
                                ${build_table_rows(tickets)}
                            </tbody>
                        </table>
                    </div>
                `
            }
        ],
        primary_action_label: __("Close"),
        primary_action: function() {
            dialog.hide();
        }
    });

    dialog.$wrapper.find(".modal-dialog").css({
        "max-width": "1150px",
        "width": "95%"
    });

    // Real-time live filtering
    dialog.$wrapper.find(".ticket-filter-input").on("input", function() {
        let q = $(this).val().toLowerCase().trim();
        if (!q) {
            dialog.$wrapper.find(".tickets-table-body").html(build_table_rows(tickets));
            return;
        }
        let filtered = tickets.filter(t =>
            (t.name && t.name.toLowerCase().includes(q)) ||
            (t.party_name && t.party_name.toLowerCase().includes(q)) ||
            (t.serial_no && t.serial_no.toLowerCase().includes(q)) ||
            (t.call_source && t.call_source.toLowerCase().includes(q)) ||
            (t.contact_name && t.contact_name.toLowerCase().includes(q)) ||
            (t.contact_phone && t.contact_phone.toLowerCase().includes(q)) ||
            (t.status && t.status.toLowerCase().includes(q))
        );
        dialog.$wrapper.find(".tickets-table-body").html(build_table_rows(filtered));
    });

    // Open in Support Ticket List view
    dialog.$wrapper.find(".btn-open-ticket-list").on("click", function() {
        let route_opts = {};
        if (exec_id && exec_id !== "Unassigned") {
            route_opts["executive2"] = exec_id;
        }
        if (filters.status && filters.status !== "All") {
            if (filters.status !== "OPEN") {
                route_opts["status"] = filters.status;
            }
        }
        if (filters.amc_status && filters.amc_status !== "All") {
            route_opts["amc_status"] = filters.amc_status;
        }
        if (filters.call_source && filters.call_source !== "All") {
            route_opts["call_source"] = filters.call_source;
        }
        dialog.hide();
        frappe.set_route("List", "support_ticket", route_opts);
    });

    dialog.show();
}