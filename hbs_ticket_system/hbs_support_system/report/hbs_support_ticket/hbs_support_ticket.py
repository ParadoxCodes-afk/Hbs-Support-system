# Copyright (c) 2026, HBS and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def execute(filters=None):
    filters = frappe._dict(filters or {})
    columns = get_columns(filters)
    data = get_data(filters)
    report_summary = get_report_summary(data, filters)
    return columns, data, None, None, report_summary


def format_duration_mins(avg_mins):
    if not avg_mins or avg_mins <= 0:
        return "-"
    total_seconds = int(avg_mins * 60)
    minutes = total_seconds // 60
    hours = minutes // 60
    rem_mins = minutes % 60
    if hours > 0:
        return f"{hours}h {rem_mins}m"
    return f"{rem_mins}m"


def get_columns(filters=None):
    return [
        {
            "fieldname": "executive",
            "label": _("Executive ID"),
            "fieldtype": "Link",
            "options": "User",
            "width": 150,
        },
        {
            "fieldname": "executive_name",
            "label": _("Executive Name"),
            "fieldtype": "Data",
            "width": 130,
        },
        {
            "fieldname": "total_tickets",
            "label": _("Total Tickets"),
            "fieldtype": "Int",
            "width": 95,
        },
        {
            "fieldname": "new_tickets",
            "label": _("New"),
            "fieldtype": "Int",
            "width": 70,
        },
        {
            "fieldname": "followup_tickets",
            "label": _("Followup"),
            "fieldtype": "Int",
            "width": 75,
        },
        {
            "fieldname": "pending_tickets",
            "label": _("Pending"),
            "fieldtype": "Int",
            "width": 75,
        },
        {
            "fieldname": "completed_tickets",
            "label": _("Completed"),
            "fieldtype": "Int",
            "width": 85,
        },
        {
            "fieldname": "amc_tickets",
            "label": _("AMC (Yes)"),
            "fieldtype": "Int",
            "width": 80,
        },
        {
            "fieldname": "non_amc_tickets",
            "label": _("Non-AMC"),
            "fieldtype": "Int",
            "width": 80,
        },
        {
            "fieldname": "avg_res_time",
            "label": _("Avg Resolution"),
            "fieldtype": "Data",
            "width": 110,
        },
        {
            "fieldname": "long_pending_tickets",
            "label": _("Pending > 2h"),
            "fieldtype": "Int",
            "width": 100,
        },
        {
            "fieldname": "action",
            "label": _("Action"),
            "fieldtype": "Data",
            "width": 110,
        },
    ]


def build_conditions(filters):
    conditions = []
    params = {}

    from_date = filters.get("from_date")
    to_date = filters.get("to_date")
    executive = filters.get("executive")
    status = filters.get("status")
    amc_status = filters.get("amc_status")

    if from_date:
        conditions.append("DATE(st.creation) >= %(from_date)s")
        params["from_date"] = from_date
    if to_date:
        conditions.append("DATE(st.creation) <= %(to_date)s")
        params["to_date"] = to_date

    if executive and executive != "All":
        conditions.append("st.executive2 = %(executive)s")
        params["executive"] = executive

    if status and status != "All":
        if status == "OPEN":
            conditions.append("st.status != 'COMPLETED'")
        else:
            conditions.append("st.status = %(status)s")
            params["status"] = status

    if amc_status and amc_status != "All":
        conditions.append("st.amc_status = %(amc_status)s")
        params["amc_status"] = amc_status

    return conditions, params


def get_data(filters=None):
    filters = filters or {}
    conditions, params = build_conditions(filters)
    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    query = f"""
        SELECT
            COALESCE(st.executive2, 'Unassigned') AS executive,
            COALESCE(NULLIF(TRIM(u.full_name), ''), st.executive2, 'Unassigned') AS executive_name,
            COUNT(*) AS total_tickets,
            SUM(CASE WHEN st.status = 'NEW' THEN 1 ELSE 0 END) AS new_tickets,
            SUM(CASE WHEN st.status = 'FOLLOWUP' THEN 1 ELSE 0 END) AS followup_tickets,
            SUM(CASE WHEN st.status = 'PENDING' THEN 1 ELSE 0 END) AS pending_tickets,
            SUM(CASE WHEN st.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_tickets,
            SUM(CASE WHEN st.amc_status = 'YES' THEN 1 ELSE 0 END) AS amc_tickets,
            SUM(CASE WHEN st.amc_status != 'YES' THEN 1 ELSE 0 END) AS non_amc_tickets,
            AVG(CASE WHEN st.status = 'COMPLETED' AND st.total_time_taken_mins > 0 THEN st.total_time_taken_mins ELSE NULL END) AS avg_res_mins,
            SUM(CASE
                WHEN st.status != 'COMPLETED' AND (
                    (st.pending_time_start IS NOT NULL AND TIMESTAMPDIFF(MINUTE, st.pending_time_start, NOW()) > 120)
                    OR (st.pending_time_start IS NULL AND TIMESTAMPDIFF(MINUTE, st.creation, NOW()) > 120)
                ) THEN 1
                ELSE 0
            END) AS long_pending_tickets
        FROM `tabsupport_ticket` st
        LEFT JOIN `tabUser` u ON u.name = st.executive2
        {where_clause}
        GROUP BY st.executive2
        ORDER BY total_tickets DESC, executive_name ASC
    """

    rows = frappe.db.sql(query, params, as_dict=True)
    data = []

    for r in rows:
        exec_id = r.get("executive") or "Unassigned"
        avg_mins = float(r.get("avg_res_mins") or 0.0)
        formatted_avg = format_duration_mins(avg_mins)

        val_escaped = frappe.utils.escape_html(str(exec_id))
        action_btn = (
            f'<button class="btn btn-default btn-xs btn-drilldown-ticket" data-exec="{val_escaped}" '
            'onclick="frappe.query_reports[\'hbs_support_ticket\'].open_tickets(this, event)" '
            'style="border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 10px; '
            'font-size: 11px; font-weight: 500; display: inline-flex; align-items: center; gap: 4px;">'
            '<svg class="icon icon-xs" style="width: 11px; height: 11px;"><use href="#icon-list"></use></svg>'
            '<span>View Tickets</span>'
            '</button>'
        )

        data.append({
            "executive": exec_id,
            "executive_name": r.get("executive_name") or exec_id,
            "total_tickets": int(r.get("total_tickets") or 0),
            "new_tickets": int(r.get("new_tickets") or 0),
            "followup_tickets": int(r.get("followup_tickets") or 0),
            "pending_tickets": int(r.get("pending_tickets") or 0),
            "completed_tickets": int(r.get("completed_tickets") or 0),
            "amc_tickets": int(r.get("amc_tickets") or 0),
            "non_amc_tickets": int(r.get("non_amc_tickets") or 0),
            "avg_res_time": formatted_avg,
            "long_pending_tickets": int(r.get("long_pending_tickets") or 0),
            "action": action_btn,
        })

    return data


def get_report_summary(data, filters=None):
    if not data:
        return None

    total_tickets = sum(d.get("total_tickets") or 0 for d in data)
    new_tickets = sum(d.get("new_tickets") or 0 for d in data)
    followup_tickets = sum(d.get("followup_tickets") or 0 for d in data)
    pending_tickets = sum(d.get("pending_tickets") or 0 for d in data)
    completed_tickets = sum(d.get("completed_tickets") or 0 for d in data)
    amc_tickets = sum(d.get("amc_tickets") or 0 for d in data)
    long_pending = sum(d.get("long_pending_tickets") or 0 for d in data)
    open_tickets = new_tickets + followup_tickets + pending_tickets

    return [
        {
            "value": total_tickets,
            "label": _("Total Tickets"),
            "datatype": "Int",
        },
        {
            "value": open_tickets,
            "label": _("Open / In-Progress"),
            "datatype": "Int",
            "indicator": "orange",
        },
        {
            "value": completed_tickets,
            "label": _("Completed"),
            "datatype": "Int",
            "indicator": "green",
        },
        {
            "value": amc_tickets,
            "label": _("AMC Tickets"),
            "datatype": "Int",
            "indicator": "blue",
        },
        {
            "value": long_pending,
            "label": _("Pending > 2 Hours"),
            "datatype": "Int",
            "indicator": "red" if long_pending > 0 else "gray",
        },
    ]


@frappe.whitelist()
def get_executive_ticket_details(
    executive=None,
    from_date=None,
    to_date=None,
    status=None,
    amc_status=None,
):
    conditions = []
    params = {}

    if executive and executive != "All":
        if executive == "Unassigned":
            conditions.append("(st.executive2 IS NULL OR TRIM(st.executive2) = '' OR st.executive2 = 'Unassigned')")
        else:
            conditions.append("st.executive2 = %(executive)s")
            params["executive"] = executive

    if from_date:
        conditions.append("DATE(st.creation) >= %(from_date)s")
        params["from_date"] = from_date
    if to_date:
        conditions.append("DATE(st.creation) <= %(to_date)s")
        params["to_date"] = to_date

    if status and status != "All":
        if status == "OPEN":
            conditions.append("st.status != 'COMPLETED'")
        else:
            conditions.append("st.status = %(status)s")
            params["status"] = status

    if amc_status and amc_status != "All":
        conditions.append("st.amc_status = %(amc_status)s")
        params["amc_status"] = amc_status

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    query = f"""
        SELECT
            st.name,
            COALESCE(st.serial_no, '') AS serial_no,
            COALESCE(st.party_name, '') AS party_name,
            COALESCE(st.contact_name, '') AS contact_name,
            COALESCE(st.contact_phone, '') AS contact_phone,
            COALESCE(st.amc_status, 'NO') AS amc_status,
            COALESCE(st.status, 'NEW') AS status,
            COALESCE(st.call_type, '') AS call_type,
            COALESCE(st.pending_time, '') AS pending_time,
            COALESCE(st.total_time_taken, '') AS total_time_taken,
            DATE_FORMAT(st.creation, '%%Y-%%m-%%d %%H:%%i') AS creation_time,
            COALESCE(NULLIF(TRIM(u.full_name), ''), st.executive2, 'Unassigned') AS executive_name
        FROM `tabsupport_ticket` st
        LEFT JOIN `tabUser` u ON u.name = st.executive2
        {where_clause}
        ORDER BY
            CASE
                WHEN st.status = 'NEW' THEN 1
                WHEN st.status = 'FOLLOWUP' THEN 2
                WHEN st.status = 'PENDING' THEN 3
                ELSE 4
            END,
            st.creation DESC
        LIMIT 500
    """

    return frappe.db.sql(query, params, as_dict=True)
