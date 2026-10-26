// Copyright (c) 2026, HBS and contributors
// For license information, please see license.txt

frappe.query_reports["HBS Contract Details Report"] = {
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

        return value;
    }
};
