// Copyright (c) 2026, HBS and contributors
// For license information, please see license.txt

frappe.query_reports["HBS AMC Report"] = {
    filters: [
        {
            fieldname: "amc_expiry_status",
            label: __("AMC Expiry Status"),
            fieldtype: "Select",
            options: ["All", "Active", "Expiring Soon (<= 15 Days)", "Expired"],
            default: "All"
        },
        {
            fieldname: "from_date",
            label: __("Expiry From Date"),
            fieldtype: "Date"
        },
        {
            fieldname: "to_date",
            label: __("Expiry To Date"),
            fieldtype: "Date"
        },
        {
            fieldname: "executive",
            label: __("Executive"),
            fieldtype: "Link",
            options: "User"
        },
        {
            fieldname: "search_party",
            label: __("Search Party / Serial"),
            fieldtype: "Data"
        }
    ],

    formatter: function(value, row, column, data, default_formatter) {
        value = default_formatter(value, row, column, data);
        if (!data) return value;

        if (data.is_expired) {
            // Expired: whole row rendered in prominent red
            return `<span style="color: #dc2626; font-weight: 600;">${value}</span>`;
        } else if (data.is_expiring_soon) {
            // Expiring soon: rendered in amber / warning color
            return `<span style="color: #b45309; font-weight: 500;">${value}</span>`;
        }

        return value;
    }
};
