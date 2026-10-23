# -*- coding: utf-8 -*-
import frappe
from frappe import _


def execute(filters=None):
    filters = filters or {}
    columns = get_columns()
    data = get_data(filters)
    return columns, data


def get_columns():
    return [
        {
            "label": _("Customer ID"),
            "fieldname": "unique_id",
            "fieldtype": "Link",
            "options": "support_ticket_ledger",
            "width": 110,
        },
        {
            "label": _("Serial No(s)"),
            "fieldname": "serial_no",
            "fieldtype": "Data",
            "width": 140,
        },
        {
            "label": _("Party Name"),
            "fieldname": "party_name",
            "fieldtype": "Data",
            "width": 220,
        },
        {
            "label": _("AMC Status"),
            "fieldname": "amc_status",
            "fieldtype": "Data",
            "width": 95,
        },
        {
            "label": _("AMC Start Date"),
            "fieldname": "amc_start_date",
            "fieldtype": "Date",
            "width": 115,
        },
        {
            "label": _("AMC Expiry Date"),
            "fieldname": "amc_expiry_date",
            "fieldtype": "Date",
            "width": 120,
        },
        {
            "label": _("AMC Health / Status"),
            "fieldname": "status_label",
            "fieldtype": "Data",
            "width": 160,
        },
        {
            "label": _("Days Left / Overdue"),
            "fieldname": "days_left_text",
            "fieldtype": "Data",
            "width": 140,
        },
        {
            "label": _("Amount"),
            "fieldname": "amount",
            "fieldtype": "Currency",
            "width": 105,
        },
        {
            "label": _("Executive"),
            "fieldname": "executive",
            "fieldtype": "Link",
            "options": "User",
            "width": 130,
        },
        {
            "label": _("Executive 2"),
            "fieldname": "executive2",
            "fieldtype": "Link",
            "options": "User",
            "width": 130,
        },
        {
            "label": _("Email"),
            "fieldname": "email",
            "fieldtype": "Data",
            "width": 160,
        },
    ]


def get_data(filters):
    conditions = ["l.amc_status = 'YES'"]
    values = {}

    if filters.get("from_date"):
        conditions.append("l.amc_expiry_date >= %(from_date)s")
        values["from_date"] = filters["from_date"]

    if filters.get("to_date"):
        conditions.append("l.amc_expiry_date <= %(to_date)s")
        values["to_date"] = filters["to_date"]

    if filters.get("executive"):
        conditions.append("(l.executive = %(executive)s OR l.executive2 = %(executive)s)")
        values["executive"] = filters["executive"]

    if filters.get("search_party"):
        conditions.append("(l.party_name LIKE %(search)s OR l.serial_no LIKE %(search)s)")
        values["search"] = f"%{filters['search_party']}%"

    where_clause = " AND ".join(conditions)

    sql = f"""
        SELECT 
            l.name as unique_id,
            COALESCE(GROUP_CONCAT(DISTINCT s.serial_no ORDER BY s.idx SEPARATOR ', '), l.serial_no, l.name) as serial_no,
            l.party_name,
            l.amc_status,
            l.amc_start_date,
            l.amc_expiry_date,
            l.amount,
            l.executive,
            l.executive2,
            l.email
        FROM `tabsupport_ticket_ledger` l
        LEFT JOIN `tabsupport_ticket_ledger_serials` s ON s.parent = l.name
        WHERE {where_clause}
        GROUP BY l.name
        ORDER BY l.amc_expiry_date ASC, l.party_name ASC
    """

    raw_records = frappe.db.sql(sql, values, as_dict=True)
    today = frappe.utils.nowdate()

    status_filter = filters.get("amc_expiry_status", "All")
    result = []

    for row in raw_records:
        expiry_date = row.amc_expiry_date
        diff = None
        is_expired = 0
        is_expiring_soon = 0
        status_label = "Active"
        days_left_text = "N/A"

        if expiry_date:
            diff = frappe.utils.date_diff(str(expiry_date), today)
            if diff < 0:
                is_expired = 1
                days_ago = abs(diff)
                status_label = f"Expired ({days_ago}d ago)"
                days_left_text = f"{days_ago} days overdue"
            elif diff <= 15:
                is_expiring_soon = 1
                status_label = f"Expiring Soon ({diff}d)"
                days_left_text = f"{diff} days left"
            else:
                status_label = "Active"
                days_left_text = f"{diff} days left"
        else:
            status_label = "No Expiry Date"
            days_left_text = "N/A"

        # Apply amc_expiry_status filter
        if status_filter == "Expired" and not is_expired:
            continue
        elif status_filter == "Expiring Soon (<= 15 Days)" and not is_expiring_soon:
            continue
        elif status_filter == "Active" and (is_expired or is_expiring_soon):
            continue

        row["is_expired"] = is_expired
        row["is_expiring_soon"] = is_expiring_soon
        row["status_label"] = status_label
        row["days_left_text"] = days_left_text
        row["days_left"] = diff if diff is not None else 999999

        result.append(row)

    return result
