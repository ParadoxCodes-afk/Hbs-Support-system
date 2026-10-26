# -*- coding: utf-8 -*-
# Copyright (c) 2026, HBS and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import nowdate, getdate


def execute(filters=None):
    filters = filters or {}
    columns = get_columns()
    data, summary = get_data(filters)
    return columns, data, None, None, summary


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
            "label": _("Type / Category"),
            "fieldname": "category",
            "fieldtype": "Data",
            "width": 100,
        },
        {
            "label": _("Product"),
            "fieldname": "product",
            "fieldtype": "Link",
            "options": "support_contract_product",
            "width": 180,
        },
        {
            "label": _("Status / Health"),
            "fieldname": "health_status",
            "fieldtype": "Data",
            "width": 170,
        },
        {
            "label": _("Start Date"),
            "fieldname": "start_date",
            "fieldtype": "Date",
            "width": 110,
        },
        {
            "label": _("Expiry Date"),
            "fieldname": "expiry_date",
            "fieldtype": "Date",
            "width": 115,
        },
        {
            "label": _("Cycle"),
            "fieldname": "period",
            "fieldtype": "Data",
            "width": 95,
        },
        {
            "label": _("Visits"),
            "fieldname": "visits",
            "fieldtype": "Data",
            "width": 80,
        },
        {
            "label": _("Users / Qty"),
            "fieldname": "qty",
            "fieldtype": "Float",
            "width": 90,
        },
        {
            "label": _("Rate"),
            "fieldname": "rate",
            "fieldtype": "Currency",
            "width": 95,
        },
        {
            "label": _("Amount"),
            "fieldname": "amount",
            "fieldtype": "Currency",
            "width": 110,
        },
        {
            "label": _("IP / License ID"),
            "fieldname": "ip_address",
            "fieldtype": "Data",
            "width": 130,
        },
        {
            "label": _("Executive 1"),
            "fieldname": "executive1",
            "fieldtype": "Link",
            "options": "User",
            "width": 120,
        },
        {
            "label": _("Executive 2"),
            "fieldname": "executive2",
            "fieldtype": "Link",
            "options": "User",
            "width": 120,
        },
        {
            "label": _("Contact Info"),
            "fieldname": "contact",
            "fieldtype": "Data",
            "width": 180,
        },
        {
            "label": _("Remarks"),
            "fieldname": "remarks",
            "fieldtype": "Data",
            "width": 160,
        },
    ]


def get_data(filters):
    conditions = []
    values = {}

    cat = filters.get("category")
    if cat and cat != "All":
        conditions.append("c.category = %(category)s")
        values["category"] = cat

    prod = filters.get("product")
    if prod:
        conditions.append("c.product = %(product)s")
        values["product"] = prod

    if filters.get("from_date"):
        conditions.append("c.expiry_date >= %(from_date)s")
        values["from_date"] = filters["from_date"]

    if filters.get("to_date"):
        conditions.append("c.expiry_date <= %(to_date)s")
        values["to_date"] = filters["to_date"]

    if filters.get("executive"):
        conditions.append("(c.executive1 = %(executive)s OR c.executive2 = %(executive)s OR l.executive = %(executive)s OR l.executive2 = %(executive)s)")
        values["executive"] = filters["executive"]

    search = (filters.get("search") or "").strip()
    if search:
        like_str = f"%{search}%"
        conditions.append("""(
            l.party_name LIKE %(search_like)s
            OR l.name LIKE %(search_like)s
            OR l.serial_no LIKE %(search_like)s
            OR c.ip_address LIKE %(search_like)s
            OR c.unique_id LIKE %(search_like)s
            OR c.product LIKE %(search_like)s
            OR EXISTS (SELECT 1 FROM `tabsupport_ticket_ledger_serials` s WHERE s.parent = l.name AND s.serial_no LIKE %(search_like)s)
        )""")
        values["search_like"] = like_str

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    sql = f"""
        SELECT
            c.name as contract_id,
            c.parent as unique_id,
            c.product,
            c.category,
            c.period,
            c.start_date,
            c.expiry_date,
            c.status as contract_status,
            c.visits,
            c.qty,
            c.rate,
            c.amount,
            COALESCE(NULLIF(c.ip_address, ''), c.unique_id) as ip_address,
            c.executive1,
            c.executive2,
            c.remarks,
            l.party_name,
            l.serial_no as primary_serial
        FROM
            `tabsupport_ticket_ledger_contracts` c
        JOIN
            `tabsupport_ticket_ledger` l ON l.name = c.parent
        {where_clause}
        ORDER BY
            c.expiry_date IS NULL, c.expiry_date ASC, l.party_name ASC
    """

    raw_data = frappe.db.sql(sql, values, as_dict=True)

    today = getdate(nowdate())
    status_filter = filters.get("status") or "All"

    # Preload serial numbers and contacts for customers in result set
    parent_ids = list(set(r.unique_id for r in raw_data if r.unique_id))
    serials_map = {}
    contacts_map = {}

    if parent_ids:
        serials_rows = frappe.get_all(
            "support_ticket_ledger_serials",
            filters={"parent": ["in", parent_ids]},
            fields=["parent", "serial_no"],
            order_by="idx asc"
        )
        for s in serials_rows:
            p = s.parent
            if s.serial_no:
                serials_map.setdefault(p, []).append(s.serial_no)

        contacts_rows = frappe.get_all(
            "support_ticket_ledger_contacts",
            filters={"parent": ["in", parent_ids], "parentfield": "contact_details"},
            fields=["parent", "contact_name", "contact_phone", "phone_number"],
            order_by="idx asc"
        )
        for ct in contacts_rows:
            p = ct.parent
            if p not in contacts_map:
                name_part = (ct.contact_name or "").strip()
                phone_part = (ct.contact_phone or ct.phone_number or "").strip()
                if name_part and phone_part:
                    contacts_map[p] = f"{name_part} ({phone_part})"
                elif name_part:
                    contacts_map[p] = name_part
                elif phone_part:
                    contacts_map[p] = phone_part

    filtered_data = []
    total_amount = 0.0
    active_count = 0
    expired_count = 0
    expiring_soon_count = 0

    for row in raw_data:
        p_id = row.unique_id
        all_serials = serials_map.get(p_id, [])
        if all_serials:
            row.serial_no = ", ".join(all_serials)
        else:
            row.serial_no = row.primary_serial or "-"

        row.contact = contacts_map.get(p_id, "-")

        exp = getdate(row.expiry_date) if row.expiry_date else None
        is_expired = False
        is_expiring_soon = False
        days_left = None

        if exp:
            days_left = (exp - today).days
            if days_left < 0:
                is_expired = True
                health_status = f"Expired ({abs(days_left)}d ago)"
            elif days_left <= 15:
                is_expiring_soon = True
                health_status = f"Expiring Soon ({days_left}d left)"
            else:
                health_status = f"Active ({days_left}d left)"
        else:
            health_status = "Active (No Expiry)"

        row.is_expired = is_expired
        row.is_expiring_soon = is_expiring_soon
        row.health_status = health_status

        # Status filter check
        if status_filter == "Active" and is_expired:
            continue
        elif status_filter == "Expiring Soon (<= 15 Days)" and not is_expiring_soon:
            continue
        elif status_filter == "Expiring in 30 Days" and (is_expired or days_left is None or days_left > 30):
            continue
        elif status_filter == "Expired" and not is_expired:
            continue

        # Accumulate metrics
        amt = float(row.amount or 0.0)
        total_amount += amt
        if is_expired:
            expired_count += 1
        elif is_expiring_soon:
            expiring_soon_count += 1
            active_count += 1
        else:
            active_count += 1

        filtered_data.append(row)

    # Build KPI Summary cards
    summary = [
        {
            "value": len(filtered_data),
            "label": _("Total Contracts"),
            "datatype": "Int",
            "indicator": "Blue"
        },
        {
            "value": active_count,
            "label": _("Active Contracts"),
            "datatype": "Int",
            "indicator": "Green"
        },
        {
            "value": expiring_soon_count,
            "label": _("Expiring Soon (≤15d)"),
            "datatype": "Int",
            "indicator": "Orange"
        },
        {
            "value": expired_count,
            "label": _("Expired"),
            "datatype": "Int",
            "indicator": "Red"
        },
        {
            "value": total_amount,
            "label": _("Total Contract Value"),
            "datatype": "Currency",
            "indicator": "Blue"
        }
    ]

    return filtered_data, summary
