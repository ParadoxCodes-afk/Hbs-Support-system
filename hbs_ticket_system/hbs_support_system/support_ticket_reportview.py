import frappe
from frappe.desk import reportview


# ==========================================
# COMMON TICKET FILTERS
# ==========================================


def get_allowed_tickets():

    filters = {}

    new_tickets_only = frappe.utils.cint(
        frappe.db.get_value(
            "User",
            frappe.session.user,
            "new_tickets_only"
        ) or 0
    )

    if new_tickets_only:
        filters["status"] = "NEW"
    else:
        filters["status"] = ["!=", "COMPLETED"]

        if frappe.session.user != "Administrator":
            filters["executive2"] = frappe.session.user

    return frappe.get_list(
        "support_ticket",
        filters=filters,
        fields=["name", "creation"],
        limit_page_length=0
    )

# ==========================================
# CREATED > 2 HOURS
# ==========================================

@frappe.whitelist()
def get_old_created_tickets():

    tickets = get_allowed_tickets()

    two_hours_ago = frappe.utils.add_to_date(
        frappe.utils.now_datetime(),
        hours=-2
    )

    names = []

    for ticket in tickets:

        if ticket.creation < two_hours_ago:

            names.append(ticket.name)

    return names


# ==========================================
# LAST REMARKS > 2 HOURS
# ==========================================

@frappe.whitelist()
def get_old_remark_tickets():

    tickets = get_allowed_tickets()

    if not tickets:
        return []

    ticket_names = [
        ticket.name
        for ticket in tickets
    ]

    two_hours_ago = frappe.utils.add_to_date(
        frappe.utils.now_datetime(),
        hours=-2
    )

    # Get latest follow-up update for each ticket
    placeholders = ", ".join(
        ["%s"] * len(ticket_names)
    )

    query = f"""
        SELECT
            parent,
            MAX(updated_on) AS last_updated
        FROM
            `tabsupport_ticket_followup`
        WHERE
            parent IN ({placeholders})
        GROUP BY
            parent
        HAVING
            MAX(updated_on) < %s
    """

    values = ticket_names + [
        two_hours_ago
    ]

    rows = frappe.db.sql(
        query,
        values,
        as_dict=True
    )

    return [
        row.parent
        for row in rows
    ]


# ==========================================
# NORMAL LIST SORTING
# ==========================================

def _set_support_ticket_order():

    if frappe.form_dict.get("doctype") == "support_ticket":

        frappe.form_dict.order_by = (
            "list_sort_order asc, creation asc"
        )


@frappe.whitelist()
def get():

    _set_support_ticket_order()

    return reportview.get()



@frappe.whitelist()
def get_list():
    _set_support_ticket_order()
    return reportview.get_list()