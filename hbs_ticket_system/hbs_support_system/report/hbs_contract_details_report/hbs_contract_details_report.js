// Copyright (c) 2026, HBS and contributors
// For license information, please see license.txt

frappe.query_reports["HBS Contract Details Report"] = {
    onload: function(report) {
        // Pre-fill Expiry To Date with current month's last date
        const today = new Date();
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        const yyyy = lastDay.getFullYear();
        const mm = String(lastDay.getMonth() + 1).padStart(2, '0');
        const dd = String(lastDay.getDate()).padStart(2, '0');
        const monthEndStr = `${yyyy}-${mm}-${dd}`;

        if (!report.get_filter_value("to_date")) {
            report.set_filter_value("to_date", monthEndStr);
        }

        // Live auto-refresh when removing or changing Date filters
        function bind_live_date_filter(fieldname) {
            const f = report.get_filter(fieldname);
            if (!f || !f.$input) return;

            let debounceTimer = null;
            const handle_change = () => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    const rawVal = (f.$input.val() || "").trim();
                    if (!rawVal) {
                        if (f.datepicker) {
                            f.datepicker.clear();
                        }
                        f.value = null;
                        f.last_value = null;
                        f.set_input("");
                        report.previous_filters = null;
                        report.refresh(true);
                    } else {
                        let parsed = f.parse ? f.parse(rawVal) : rawVal;
                        if (!parsed && frappe.datetime && frappe.datetime.user_to_str) {
                            try {
                                parsed = frappe.datetime.user_to_str(rawVal);
                            } catch (e) {}
                        }
                        parsed = parsed || rawVal;
                        if (f.value !== parsed) {
                            f.value = parsed;
                            f.last_value = parsed;
                            report.previous_filters = null;
                            report.refresh(true);
                        }
                    }
                }, 300);
            };

            f.$input.on("input keyup paste change", handle_change);

            if (f.datepicker && f.datepicker_options) {
                const origOnSelect = f.datepicker_options.onSelect;
                f.datepicker_options.onSelect = function() {
                    if (origOnSelect) origOnSelect.apply(this, arguments);
                    handle_change();
                };
            }
        }

        bind_live_date_filter("to_date");
        bind_live_date_filter("from_date");

        frappe.call({
            method: "hbs_ticket_system.hbs_support_system.report.hbs_contract_details_report.hbs_contract_details_report.check_report_manager_permission",
            callback: function(r) {
                const res = r.message || {};
                if (!res.is_manager && res.user) {
                    report.set_filter_value("executive", res.user);
                    const f_exec = report.get_filter("executive");
                    if (f_exec) {
                        f_exec.df.read_only = 1;
                        f_exec.refresh();
                    }
                }
            }
        });

        // Modern Executive KPI Summary Cards Styling
        frappe.dom.set_style(`
            .report-summary {
                background: transparent !important;
                border: none !important;
                padding: 10px 0 16px 0 !important;
                margin: 0 !important;
                display: flex !important;
                flex-wrap: wrap !important;
                gap: 14px !important;
                justify-content: flex-start !important;
            }
            .report-summary .summary-item {
                background: #ffffff !important;
                border: 1px solid #e2e8f0 !important;
                border-radius: 10px !important;
                padding: 14px 18px !important;
                margin: 0 !important;
                min-width: 165px !important;
                max-width: none !important;
                height: auto !important;
                min-height: 84px !important;
                flex: 1 1 170px !important;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05) !important;
                display: flex !important;
                flex-direction: column !important;
                justify-content: center !important;
                align-items: center !important;
                box-sizing: border-box !important;
                overflow: visible !important;
                transition: transform 0.15s ease, box-shadow 0.15s ease !important;
            }
            .report-summary .summary-item:hover {
                transform: translateY(-2px) !important;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08) !important;
            }
            .report-summary .summary-item .summary-label {
                font-size: 11px !important;
                font-weight: 600 !important;
                text-transform: uppercase !important;
                letter-spacing: 0.5px !important;
                color: #64748b !important;
                margin: 0 0 6px 0 !important;
                padding: 0 !important;
                line-height: 1.3 !important;
                text-align: center !important;
                white-space: normal !important;
                overflow: visible !important;
                height: auto !important;
            }
            .report-summary .summary-item .summary-value {
                font-size: 21px !important;
                font-weight: 700 !important;
                line-height: 1.25 !important;
                margin: 0 !important;
                padding: 0 !important;
                text-align: center !important;
                overflow: visible !important;
                height: auto !important;
                color: #0f172a !important;
            }
            .report-summary .summary-item .summary-value.blue {
                color: #2563eb !important;
            }
            .report-summary .summary-item .summary-value.green {
                color: #16a34a !important;
            }
            .report-summary .summary-item .summary-value.orange {
                color: #d97706 !important;
            }
            .report-summary .summary-item .summary-value.red {
                color: #dc2626 !important;
            }
            .report-summary .summary-item:has(.summary-value.blue) {
                border-top: 3px solid #3b82f6 !important;
                background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%) !important;
            }
            .report-summary .summary-item:has(.summary-value.green) {
                border-top: 3px solid #10b981 !important;
                background: linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%) !important;
            }
            .report-summary .summary-item:has(.summary-value.orange) {
                border-top: 3px solid #f59e0b !important;
                background: linear-gradient(180deg, #fffbeb 0%, #ffffff 100%) !important;
            }
            .report-summary .summary-item:has(.summary-value.red) {
                border-top: 3px solid #ef4444 !important;
                background: linear-gradient(180deg, #fef2f2 0%, #ffffff 100%) !important;
            }
            .btn-contract-more-info {
                padding: 2px 8px !important;
                font-size: 11px !important;
                font-weight: 500 !important;
                border-radius: 4px !important;
                background: #f1f5f9 !important;
                border: 1px solid #cbd5e1 !important;
                color: #1e293b !important;
                transition: all 0.15s ease !important;
                cursor: pointer !important;
                white-space: nowrap !important;
            }
            .btn-contract-more-info:hover {
                background: #e2e8f0 !important;
                color: #0f172a !important;
                border-color: #94a3b8 !important;
            }
            .btn-contract-followup {
                padding: 2px 8px !important;
                font-size: 11px !important;
                font-weight: 500 !important;
                border-radius: 4px !important;
                background: #ecfdf5 !important;
                border: 1px solid #a7f3d0 !important;
                color: #065f46 !important;
                transition: all 0.15s ease !important;
                cursor: pointer !important;
                white-space: nowrap !important;
            }
            .btn-contract-followup:hover {
                background: #d1fae5 !important;
                color: #047857 !important;
                border-color: #6ee7b7 !important;
            }
            .report-wrapper .dt-scrollable,
            .datatable .dt-scrollable {
                min-height: 140px !important;
            }
        `);

        // Global handler for More Info button click
        $(document).off("click.contract_more_info").on("click.contract_more_info", ".btn-contract-more-info", function(e) {
            e.preventDefault();
            e.stopPropagation();
            let rawJson = $(this).attr("data-contract-json");
            if (!rawJson) return;
            try {
                let row = JSON.parse(decodeURIComponent(rawJson));
                show_contract_more_info_dialog(row);
            } catch (err) {
                console.error("Failed to parse contract details", err);
            }
        });

        // Global handler for Follow Up button click
        $(document).off("click.contract_followup").on("click.contract_followup", ".btn-contract-followup", function(e) {
            e.preventDefault();
            e.stopPropagation();
            let rawJson = $(this).attr("data-contract-json");
            if (!rawJson) return;
            try {
                let row = JSON.parse(decodeURIComponent(rawJson));
                show_contract_followup_dialog(row, report);
            } catch (err) {
                console.error("Failed to parse contract details", err);
            }
        });
    },
    filters: [
        {
            fieldname: "category",
            label: __("Contract Type / Category"),
            fieldtype: "Link",
            options: "support_contract_category"
        },
        {
            fieldname: "status",
            label: __("Contract Status"),
            fieldtype: "Select",
            options: ["All", "Active", "Expiring Soon (<= 15 Days)", "Expiring in 30 Days", "Expired"],
            default: "All"
        },
        {
            fieldname: "product",
            label: __("Product"),
            fieldtype: "Link",
            options: "support_contract_product"
        },
        {
            fieldname: "from_date",
            label: __("Expiry From Date"),
            fieldtype: "Date",
            on_change: function(report) {
                const f = report.get_filter("from_date");
                if (f && f.$input && !f.$input.val().trim()) {
                    if (f.datepicker) f.datepicker.clear();
                    f.value = null;
                    f.last_value = null;
                }
                report.previous_filters = null;
                report.refresh(true);
            }
        },
        {
            fieldname: "to_date",
            label: __("Expiry To Date (Default: Month End)"),
            fieldtype: "Date",
            on_change: function(report) {
                const f = report.get_filter("to_date");
                if (f && f.$input && !f.$input.val().trim()) {
                    if (f.datepicker) f.datepicker.clear();
                    f.value = null;
                    f.last_value = null;
                }
                report.previous_filters = null;
                report.refresh(true);
            }
        },
        {
            fieldname: "executive",
            label: __("Executive (1 or 2)"),
            fieldtype: "Link",
            options: "User"
        },
        {
            fieldname: "search",
            label: __("Search Party / Serial / IP"),
            fieldtype: "Data"
        }
    ],

    formatter: function(value, row, column, data, default_formatter) {
        value = default_formatter(value, row, column, data);
        if (!data) return value;

        if (column.fieldname === "category") {
            let cat = (data.category || "").toUpperCase();
            if (cat.includes("AMC")) {
                return `<span class="indicator-pill green" style="font-size: 11px;">AMC</span>`;
            } else if (cat.includes("CLOUD")) {
                return `<span class="indicator-pill blue" style="font-size: 11px;">Cloud</span>`;
            } else if (cat.includes("MODUL")) {
                return `<span class="indicator-pill purple" style="font-size: 11px;">Module</span>`;
            }
            return `<span class="indicator-pill gray" style="font-size: 11px;">${data.category || 'Other'}</span>`;
        }

        if (column.fieldname === "health_status") {
            if (data.is_expired) {
                return `<span style="color: #dc2626; font-weight: 600;">● ${data.health_status}</span>`;
            } else if (data.is_expiring_soon) {
                return `<span style="color: #d97706; font-weight: 600;">● ${data.health_status}</span>`;
            } else {
                return `<span style="color: #16a34a; font-weight: 500;">● ${data.health_status}</span>`;
            }
        }

        if (data.is_expired && (column.fieldname === "expiry_date" || column.fieldname === "party_name")) {
            return `<span style="color: #dc2626; font-weight: 600;">${value}</span>`;
        } else if (data.is_expiring_soon && (column.fieldname === "expiry_date" || column.fieldname === "party_name")) {
            return `<span style="color: #b45309; font-weight: 500;">${value}</span>`;
        }

        if (column.fieldname === "action") {
            let encoded = encodeURIComponent(JSON.stringify(data));
            return `<div style="display: flex; gap: 5px; align-items: center;">
                <button type="button" class="btn btn-xs btn-contract-more-info" data-contract-json="${encoded}">
                    <i class="fa fa-info-circle text-primary"></i> ${__("More Info")}
                </button>
                <button type="button" class="btn btn-xs btn-contract-followup" data-contract-json="${encoded}">
                    <i class="fa fa-phone" style="color: #10b981;"></i> ${__("Follow Up")}
                </button>
            </div>`;
        }

        return value;
    },

    after_refresh: function(report) {
        if (report.$summary) {
            report.$summary.find(".summary-item").each(function() {
                const $val = $(this).find(".summary-value");
                if ($val.hasClass("blue")) {
                    $(this).css({
                        "border-top": "3px solid #3b82f6",
                        "background": "linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)"
                    });
                } else if ($val.hasClass("green")) {
                    $(this).css({
                        "border-top": "3px solid #10b981",
                        "background": "linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)"
                    });
                } else if ($val.hasClass("orange")) {
                    $(this).css({
                        "border-top": "3px solid #f59e0b",
                        "background": "linear-gradient(180deg, #fffbeb 0%, #ffffff 100%)"
                    });
                } else if ($val.hasClass("red")) {
                    $(this).css({
                        "border-top": "3px solid #ef4444",
                        "background": "linear-gradient(180deg, #fef2f2 0%, #ffffff 100%)"
                    });
                }
            });
        }
    }
};

function show_contract_more_info_dialog(data) {
    if (!data) return;

    const esc = (v) => frappe.utils.escape_html(String(v || "-"));
    const fmt_curr = (v) => (v !== undefined && v !== null && v !== "") ? format_currency(v) : "-";
    const fmt_date = (v) => {
        if (!v) return "-";
        let str = String(v).split(" ")[0];
        let parts = str.split("-");
        if (parts.length === 3 && parts[0].length === 4) {
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return str;
    };

    let healthBadge = "";
    if (data.is_expired) {
        healthBadge = `<span class="indicator-pill red" style="font-weight: 600;">${esc(data.health_status)}</span>`;
    } else if (data.is_expiring_soon) {
        healthBadge = `<span class="indicator-pill orange" style="font-weight: 600;">${esc(data.health_status)}</span>`;
    } else {
        healthBadge = `<span class="indicator-pill green" style="font-weight: 500;">${esc(data.health_status)}</span>`;
    }

    let d = new frappe.ui.Dialog({
        title: __("📋 Contract Information — {0}", [data.party_name || data.unique_id]),
        size: "large",
        fields: [
            {
                fieldname: "details_html",
                fieldtype: "HTML",
                options: `
                    <div style="font-size: 13px; color: #1e293b; line-height: 1.5;">
                        <!-- Header Banner -->
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 2px;">${esc(data.party_name)}</div>
                                <div style="font-size: 12px; color: #64748b;">
                                    <b>Customer ID:</b> <a href="/app/support_ticket_ledger/${encodeURIComponent(data.unique_id)}" target="_blank" style="color: #2563eb; font-weight: 600;">${esc(data.unique_id)}</a>
                                    &nbsp;•&nbsp; <b>Primary Serial:</b> <span style="font-family: monospace; font-weight: 600;">${esc(data.serial_no)}</span>
                                </div>
                            </div>
                            <div style="text-align: right;">
                                ${healthBadge}
                            </div>
                        </div>

                        <!-- 3 Column Cards Layout -->
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 14px;">
                            
                            <!-- Subscription Card -->
                            <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #ffffff;">
                                <div style="font-weight: 600; font-size: 12px; color: #475569; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px;">
                                    <i class="fa fa-file-text-o text-primary"></i> Subscription
                                </div>
                                <div style="display: grid; grid-template-columns: 95px 1fr; gap: 6px; font-size: 12.5px;">
                                    <span style="color: #64748b;">Company:</span> <span style="font-weight: 600; color: #0284c7;">${esc(data.company_name || data.our_company_name || 'HBS Solutions Pvt Ltd')}</span>
                                    <span style="color: #64748b;">Category:</span> <span style="font-weight: 600;">${esc(data.category)}</span>
                                    <span style="color: #64748b;">Product:</span> <span style="font-weight: 600;">${esc(data.product)}</span>
                                    <span style="color: #64748b;">Billing Cycle:</span> <span>${esc(data.period)}</span>
                                    <span style="color: #64748b;">Start Date:</span> <span>${fmt_date(data.start_date)}</span>
                                    <span style="color: #64748b;">Expiry Date:</span> <span style="font-weight: 600; color: ${data.is_expired ? '#dc2626' : '#0f172a'};">${fmt_date(data.expiry_date)}</span>
                                </div>
                            </div>

                            <!-- Commercials Card -->
                            <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #ffffff;">
                                <div style="font-weight: 600; font-size: 12px; color: #475569; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px;">
                                    <i class="fa fa-inr text-success"></i> Commercials
                                </div>
                                <div style="display: grid; grid-template-columns: 90px 1fr; gap: 6px; font-size: 12.5px;">
                                    <span style="color: #64748b;">Qty / Users:</span> <span>${esc(data.qty)}</span>
                                    <span style="color: #64748b;">Rate:</span> <span>${fmt_curr(data.rate)}</span>
                                    <span style="color: #64748b;">Net Amount:</span> <span style="font-weight: 700; color: #047857; font-size: 13px;">${fmt_curr(data.amount)}</span>
                                    <span style="color: #64748b;">Visits:</span> <span>${esc(data.visits)}</span>
                                </div>
                            </div>

                            <!-- Assigned Team Card -->
                            <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #ffffff;">
                                <div style="font-weight: 600; font-size: 12px; color: #475569; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px;">
                                    <i class="fa fa-users text-info"></i> Assigned Team
                                </div>
                                <div style="display: grid; grid-template-columns: 90px 1fr; gap: 6px; font-size: 12.5px;">
                                    <span style="color: #64748b;">Executive 1:</span> <span style="font-weight: 600;">${esc(data.executive1)}</span>
                                    <span style="color: #64748b;">Executive 2:</span> <span style="font-weight: 600;">${esc(data.executive2)}</span>
                                    <span style="color: #64748b;">Contact:</span> <span>${esc(data.contact)}</span>
                                </div>
                            </div>

                        </div>

                        <!-- Technical & License Information -->
                        <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #ffffff;">
                            <div style="font-weight: 600; font-size: 12px; color: #475569; text-transform: uppercase; margin-bottom: 6px;">
                                <i class="fa fa-info-circle text-muted"></i> Technical & Additional Details
                            </div>
                            <div style="display: grid; grid-template-columns: 120px 1fr; gap: 6px; font-size: 12.5px;">
                                <span style="color: #64748b;">IP / License ID:</span> <span style="font-family: monospace;">${esc(data.ip_address)}</span>
                                <span style="color: #64748b;">Remarks:</span> <span>${esc(data.remarks)}</span>
                            </div>
                        </div>
                    </div>
                `
            }
        ],
        primary_action_label: __("Open Customer Ledger"),
        primary_action: function() {
            d.hide();
            frappe.set_route("Form", "support_ticket_ledger", data.unique_id);
        }
    });

    d.show();
}

function show_contract_followup_dialog(data, report) {
    if (!data) return;

    const esc = (v) => frappe.utils.escape_html(String(v || "-"));
    const fmt_date = (v) => {
        if (!v) return "-";
        let str = String(v).split(" ")[0];
        let parts = str.split("-");
        if (parts.length === 3 && parts[0].length === 4) {
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return str;
    };

    const compName = String(data.company_name || data.our_company_name || "").toUpperCase();
    let defaultFormat = "HBS Quotation";
    if (compName.includes("SERVICES")) {
        defaultFormat = "HBS Services Quotation";
    } else if (compName.includes("NEWAGE")) {
        defaultFormat = "New Age Quotation";
    }

    const catUpper = String(data.category || "").toUpperCase();
    let defaultItemName = "Annual Maintenance Contract";
    if (catUpper.includes("CLOUD")) {
        defaultItemName = "Cloud Hosting Charges";
    } else if (!catUpper.includes("AMC") && data.product) {
        defaultItemName = data.product;
    }

    const defaultQty = flt(data.qty) || 1;
    const defaultAmount = flt(data.amount) || (defaultQty * (flt(data.rate) || 0));
    const defaultRate = flt(data.rate) || (defaultQty > 0 ? flt(defaultAmount / defaultQty, 2) : defaultAmount);
    const allSerialsStr = data.serial_no || "-";
    const primarySerialStr = data.primary_serial || (data.serial_no ? data.serial_no.split(",")[0].trim() : "-");
    const defaultItemDesc = `${defaultItemName} for ${data.product || 'Tally Software'} (Serial: ${allSerialsStr}). Renewal Period: ${data.period || '1 Year'}.`;

    let d = new frappe.ui.Dialog({
        title: __("📞 Follow-Up & Quotation — {0}", [data.party_name || data.unique_id]),
        size: "large",
        fields: [
            {
                fieldname: "header_html",
                fieldtype: "HTML",
                options: `
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; font-size: 13px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <span style="font-size: 15px; font-weight: 700; color: #0f172a;">${esc(data.party_name)}</span>
                            <span class="indicator-pill ${data.is_expired ? 'red' : (data.is_expiring_soon ? 'orange' : 'green')}">${esc(data.health_status)}</span>
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; color: #475569;">
                            <div><b>Customer ID:</b> <a href="/app/support_ticket_ledger/${encodeURIComponent(data.unique_id)}" target="_blank" style="color: #2563eb; font-weight: 600;">${esc(data.unique_id)}</a></div>
                            <div><b>Company:</b> <span style="font-weight: 600; color: #0284c7;">${esc(data.company_name || data.our_company_name || 'HBS Solutions Pvt Ltd')}</span></div>
                            <div><b>Product:</b> <span style="font-weight: 600;">${esc(data.product)}</span></div>
                            <div><b>Serial:</b> <span style="font-family: monospace;">${esc(data.serial_no)}</span></div>
                            <div><b>Expiry:</b> <span style="font-weight: 600; color: ${data.is_expired ? '#dc2626' : '#0f172a'};">${fmt_date(data.expiry_date)}</span></div>
                            <div><b>Contact:</b> <span>${esc(data.contact)}</span></div>
                        </div>
                    </div>
                `
            },
            {
                fieldname: "history_html",
                fieldtype: "HTML",
                options: `<div id="contract-followup-history-box" style="margin-bottom: 14px; max-height: 180px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; background: #ffffff;">
                    <div style="text-align: center; color: #94a3b8; padding: 8px;"><i class="fa fa-spinner fa-spin"></i> Loading follow-up history...</div>
                </div>`
            },
            {
                fieldname: "section_log",
                fieldtype: "Section Break",
                label: __("Log Discussion & Follow-Up")
            },
            {
                fieldname: "next_followup_date",
                label: __("Next Follow-up Date"),
                fieldtype: "Date"
            },
            {
                fieldname: "remarks",
                label: __("Discussion Remarks *"),
                fieldtype: "Small Text",
                description: __("Enter discussion details. If sending email, you can leave this blank to auto-log."),
                reqd: 1
            },
            {
                fieldname: "section_quote",
                fieldtype: "Section Break",
                label: __("Email Quotation to Client")
            },
            {
                fieldname: "send_email",
                label: __("Send Email with Quotation to Client"),
                fieldtype: "Check",
                default: 0
            },
            {
                fieldname: "col_email_sender",
                fieldtype: "Column Break",
                depends_on: "eval:doc.send_email == 1"
            },
            {
                fieldname: "sender_name",
                label: __("Sender Display Name"),
                fieldtype: "Data",
                default: "HBS Sales Team",
                read_only: 1,
                depends_on: "eval:doc.send_email == 1"
            },
            {
                fieldname: "from_email",
                label: __("From Email (CRM Settings)"),
                fieldtype: "Data",
                default: "tally@hbsmail.in",
                read_only: 1,
                depends_on: "eval:doc.send_email == 1"
            },
            {
                fieldname: "col_email_recipients",
                fieldtype: "Column Break",
                depends_on: "eval:doc.send_email == 1"
            },
            {
                fieldname: "recipient_email",
                label: __("To (Client Email) *"),
                fieldtype: "Data",
                default: data.customer_email || "",
                depends_on: "eval:doc.send_email == 1"
            },
            {
                fieldname: "cc_email",
                label: __("CC (Executive Copy)"),
                fieldtype: "Data",
                default: "",
                depends_on: "eval:doc.send_email == 1"
            },
            {
                fieldname: "sec_quote_details",
                fieldtype: "Section Break",
                label: __("Item & Quotation Details"),
                depends_on: "eval:doc.send_email == 1"
            },
            {
                fieldname: "item_name",
                label: __("Item Name *"),
                fieldtype: "Data",
                default: defaultItemName,
                depends_on: "eval:doc.send_email == 1"
            },
            {
                fieldname: "include_all_serials",
                label: __("Include all serial numbers (unchecked = primary only)"),
                fieldtype: "Check",
                default: 1,
                depends_on: "eval:doc.send_email == 1"
            },
            {
                fieldname: "item_description",
                label: __("Item Description"),
                fieldtype: "Small Text",
                default: defaultItemDesc,
                depends_on: "eval:doc.send_email == 1"
            },
            {
                fieldname: "col_quote_calc_1",
                fieldtype: "Column Break",
                depends_on: "eval:doc.send_email == 1"
            },
            {
                fieldname: "item_qty",
                label: __("Qty"),
                fieldtype: "Float",
                default: defaultQty,
                depends_on: "eval:doc.send_email == 1"
            },
            {
                fieldname: "item_rate",
                label: __("Rate (₹)"),
                fieldtype: "Currency",
                default: defaultRate,
                depends_on: "eval:doc.send_email == 1"
            },
            {
                fieldname: "col_quote_calc_2",
                fieldtype: "Column Break",
                depends_on: "eval:doc.send_email == 1"
            },
            {
                fieldname: "item_amount",
                label: __("Amount (₹)"),
                fieldtype: "Currency",
                default: defaultAmount,
                depends_on: "eval:doc.send_email == 1"
            },
            {
                fieldname: "sec_quote_format_break",
                fieldtype: "Section Break",
                depends_on: "eval:doc.send_email == 1"
            },
            {
                fieldname: "quotation_format",
                label: __("Quotation Format"),
                fieldtype: "Select",
                options: "HBS Quotation\nNew Age Quotation\nHBS Services Quotation",
                default: defaultFormat,
                depends_on: "eval:doc.send_email == 1"
            },
            {
                fieldname: "preview_btn",
                label: __("Preview Quotation"),
                fieldtype: "Button",
                depends_on: "eval:doc.send_email == 1"
            },
            {
                fieldname: "email_subject",
                label: __("Email Subject *"),
                fieldtype: "Data",
                default: `AMC Renewal Quotation — ${data.product || ''} — ${data.party_name || ''}`,
                depends_on: "eval:doc.send_email == 1"
            },
            {
                fieldname: "email_body",
                label: __("Email Message *"),
                fieldtype: "Text Editor",
                default: "",
                depends_on: "eval:doc.send_email == 1"
            }
        ],
        primary_action_label: __("Save Follow-up"),
        primary_action: function(values) {
            if (!values.send_email && (!values.remarks || !values.remarks.trim())) {
                frappe.msgprint(__("Please enter discussion remarks."));
                return;
            }

            if (values.send_email && (!values.recipient_email || !values.recipient_email.trim())) {
                frappe.msgprint(__("Please enter recipient email to send quotation."));
                return;
            }

            d.get_primary_btn().prop("disabled", true).html(`<i class="fa fa-spinner fa-spin"></i> Saving...`);

            frappe.call({
                method: "hbs_ticket_system.hbs_support_system.report.hbs_contract_details_report.hbs_contract_details_report.save_contract_followup",
                args: {
                    unique_id: data.unique_id,
                    contract_id: data.contract_id,
                    remarks: values.remarks || "",
                    next_followup_date: values.next_followup_date || null,
                    send_email: values.send_email ? 1 : 0,
                    recipient_email: values.recipient_email || "",
                    quotation_format: values.quotation_format || defaultFormat,
                    email_subject: values.email_subject || "",
                    email_body: values.email_body || "",
                    sender_name: values.sender_name || "",
                    from_email: values.from_email || "",
                    cc_email: values.cc_email || "",
                    item_name: values.item_name || defaultItemName,
                    item_description: values.item_description || defaultItemDesc,
                    qty: flt(values.item_qty) || defaultQty,
                    rate: flt(values.item_rate) || defaultRate,
                    amount: flt(values.item_amount) || defaultAmount,
                    include_all_serials: values.include_all_serials ? 1 : 0
                },
                callback: function(r) {
                    d.get_primary_btn().prop("disabled", false).text(__("Save Follow-up"));
                    if (r.message && r.message.success) {
                        frappe.show_alert({
                            message: r.message.message || __("Follow-up saved successfully."),
                            indicator: "green"
                        }, 5);
                        d.hide();
                        if (report && report.refresh) {
                            report.refresh();
                        }
                    }
                },
                error: function() {
                    d.get_primary_btn().prop("disabled", false).text(__("Save Follow-up"));
                }
            });
        }
    });

    // Preview Quotation Button Click
    d.fields_dict.preview_btn.$input.on("click", function() {
        const qFormat = d.get_value("quotation_format") || defaultFormat;
        const itemName = d.get_value("item_name") || defaultItemName;
        const itemDesc = d.get_value("item_description") || defaultItemDesc;
        const itemQty = flt(d.get_value("item_qty")) || defaultQty;
        const itemRate = flt(d.get_value("item_rate")) || defaultRate;
        const itemAmt = flt(d.get_value("item_amount")) || defaultAmount;
        const incAll = d.get_value("include_all_serials") ? 1 : 0;

        frappe.call({
            method: "hbs_ticket_system.hbs_support_system.report.hbs_contract_details_report.hbs_contract_details_report.preview_contract_quotation",
            args: {
                unique_id: data.unique_id,
                contract_id: data.contract_id,
                quotation_format: qFormat,
                item_name: itemName,
                item_description: itemDesc,
                qty: itemQty,
                rate: itemRate,
                amount: itemAmt,
                include_all_serials: incAll
            },
            callback: function(r) {
                if (r.message && r.message.html) {
                    let prev_d = new frappe.ui.Dialog({
                        title: __("Quotation Preview ({0} - Next PI: {1})", [qFormat, r.message.pi_number || 'TBD']),
                        size: "large",
                        fields: [
                            {
                                fieldtype: "HTML",
                                fieldname: "preview_html",
                                options: `<iframe srcdoc="${frappe.utils.escape_html(r.message.html)}" style="width: 100%; height: 600px; border: 1px solid #cbd5e1; border-radius: 4px;"></iframe>`
                            }
                        ],
                        primary_action_label: __("Close"),
                        primary_action: function() {
                            prev_d.hide();
                        },
                        secondary_action_label: __("⬇️ Download PDF"),
                        secondary_action: function() {
                            let query_params = $.param({
                                unique_id: data.unique_id,
                                contract_id: data.contract_id,
                                quotation_format: qFormat,
                                item_name: itemName,
                                item_description: itemDesc,
                                qty: itemQty,
                                rate: itemRate,
                                amount: itemAmt,
                                include_all_serials: incAll
                            });
                            let download_url = frappe.urllib.get_full_url(
                                `/api/method/hbs_ticket_system.hbs_support_system.report.hbs_contract_details_report.hbs_contract_details_report.download_contract_quotation_pdf?${query_params}`
                            );
                            let a = document.createElement("a");
                            a.href = download_url;
                            a.download = "";
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                        }
                    });
                    prev_d.show();
                    if (prev_d.get_secondary_btn) {
                        prev_d.get_secondary_btn().removeClass('btn-default').addClass('btn-primary').css({ "margin-right": "auto" });
                    }
                }
            }
        });
    });

    // Two-way calculation between Qty, Rate, and Amount
    let isCalculating = false;

    function calc_from_qty_rate() {
        if (isCalculating) return;
        isCalculating = true;
        let q = flt(d.get_value("item_qty"));
        if (q <= 0) q = 1;
        let r = flt(d.get_value("item_rate")) || 0;
        let amt = flt(q * r, 2);
        d.set_value("item_amount", amt);
        isCalculating = false;
    }

    function calc_from_amount() {
        if (isCalculating) return;
        isCalculating = true;
        let amt = flt(d.get_value("item_amount")) || 0;
        let q = flt(d.get_value("item_qty"));
        if (q <= 0) q = 1;
        let r = flt(amt / q, 2);
        d.set_value("item_rate", r);
        isCalculating = false;
    }

    if (d.fields_dict.item_qty && d.fields_dict.item_qty.$input) {
        d.fields_dict.item_qty.$input.on("input change", calc_from_qty_rate);
    }
    if (d.fields_dict.item_rate && d.fields_dict.item_rate.$input) {
        d.fields_dict.item_rate.$input.on("input change", calc_from_qty_rate);
    }
    if (d.fields_dict.item_amount && d.fields_dict.item_amount.$input) {
        d.fields_dict.item_amount.$input.on("input change", calc_from_amount);
    }

    // Toggle all serials vs primary serial in item_description
    if (d.fields_dict.include_all_serials) {
        d.fields_dict.include_all_serials.df.onchange = function() {
            const incAll = d.get_value("include_all_serials");
            const activeSerial = incAll ? allSerialsStr : primarySerialStr;
            let curDesc = d.get_value("item_description") || "";
            if (curDesc.includes("(Serial:")) {
                curDesc = curDesc.replace(/\(Serial:[^)]*\)/, `(Serial: ${activeSerial})`);
            } else {
                curDesc = `${curDesc} (Serial: ${activeSerial})`;
            }
            d.set_value("item_description", curDesc);
        };
    }

    // Toggle button label and remarks requirement based on send_email checkbox
    d.fields_dict.send_email.df.onchange = function() {
        const send = d.get_value("send_email");
        if (send) {
            d.get_primary_btn().text(__("Save & Send Quotation"));
            d.set_df_property("remarks", "reqd", 0);
            d.set_df_property("remarks", "label", __("Discussion Remarks (Optional)"));
            setTimeout(function() {
                if (d.fields_dict.email_body && d.fields_dict.email_body.quill) {
                    d.fields_dict.email_body.quill.update();
                }
            }, 100);
        } else {
            d.get_primary_btn().text(__("Save Follow-up"));
            d.set_df_property("remarks", "reqd", 1);
            d.set_df_property("remarks", "label", __("Discussion Remarks *"));
        }
    };

    // Load History
    function load_history() {
        frappe.call({
            method: "hbs_ticket_system.hbs_support_system.report.hbs_contract_details_report.hbs_contract_details_report.get_contract_followup_history",
            args: {
                unique_id: data.unique_id,
                contract_id: data.contract_id
            },
            callback: function(r) {
                const rows = r.message || [];
                const $box = d.$wrapper.find("#contract-followup-history-box");
                if (!rows.length) {
                    $box.html(`<div style="text-align: center; color: #94a3b8; font-size: 12px; padding: 12px;">No previous follow-ups logged for this contract yet.</div>`);
                    return;
                }

                let html = `<div style="font-size: 12px; line-height: 1.4;">
                    <div style="font-weight: 600; color: #475569; margin-bottom: 8px; text-transform: uppercase; font-size: 11px;">
                        <i class="fa fa-history"></i> Follow-up History (${rows.length})
                    </div>
                `;

                rows.forEach(item => {
                    let emailBadge = item.email_sent ? `<span class="indicator-pill blue" style="font-size: 10px; margin-left: 6px;"><i class="fa fa-envelope"></i> ${esc(item.pi_number || 'Quotation Sent')}</span>` : '';
                    let nextDate = item.next_followup_date_str ? `<span style="color: #047857; font-size: 11px; margin-left: 8px;"><b>Next:</b> ${esc(item.next_followup_date_str)}</span>` : '';
                    html += `
                        <div style="border-bottom: 1px solid #f1f5f9; padding: 6px 0;">
                            <div style="display: flex; justify-content: space-between; color: #64748b; font-size: 11px; margin-bottom: 2px;">
                                <span><b>${esc(item.logged_by_name)}</b> &nbsp;•&nbsp; <span style="font-weight: 600; color: #1e293b;">${esc(item.activity_type)}</span>${emailBadge}${nextDate}</span>
                                <span>${esc(item.logged_on_str)}</span>
                            </div>
                            <div style="color: #1e293b; padding-left: 4px;">${esc(item.remarks)}</div>
                        </div>
                    `;
                });

                html += `</div>`;
                $box.html(html);
            }
        });
    }

    // Load Email Defaults from Hbs CRM Email Settings
    function load_email_defaults() {
        frappe.call({
            method: "hbs_ticket_system.hbs_support_system.report.hbs_contract_details_report.hbs_contract_details_report.get_contract_email_defaults",
            args: {
                unique_id: data.unique_id,
                contract_id: data.contract_id
            },
            callback: function(r) {
                if (r.message) {
                    const em = r.message;
                    if (em.sender_name) d.set_value("sender_name", em.sender_name);
                    if (em.from_email) d.set_value("from_email", em.from_email);
                    if (em.recipient_email && !d.get_value("recipient_email")) d.set_value("recipient_email", em.recipient_email);
                    if (em.cc_email) d.set_value("cc_email", em.cc_email);
                    if (em.quotation_format) d.set_value("quotation_format", em.quotation_format);
                    if (em.subject) d.set_value("email_subject", em.subject);
                    if (em.message) d.set_value("email_body", em.message);
                }
            }
        });
    }

    d.show();
    load_history();
    load_email_defaults();
}
