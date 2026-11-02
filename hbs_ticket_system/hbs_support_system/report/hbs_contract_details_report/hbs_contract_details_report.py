# -*- coding: utf-8 -*-
# Copyright (c) 2026, HBS and contributors
# For license information, please see license.txt

import os
import frappe
from frappe import _
from frappe.utils import nowdate, getdate


def is_manager_or_admin(user=None):
    user = user or frappe.session.user
    if user in ("Administrator",) or "System Manager" in frappe.get_roles(user):
        return True

    from hbs_ticket_system.hbs_support_system.doctype.support_ticket.support_ticket import is_owner_or_admin
    if is_owner_or_admin(user):
        return True

    # Check if user is assigned as Manager in support_team_hierarchy
    is_mgr = frappe.db.sql("""
        SELECT 1
        FROM `tabsupport_team_supervisor` s
        JOIN `tabsupport_team_hierarchy` h ON h.name = s.parent
        WHERE h.enabled = 1
          AND s.user = %s
          AND (s.role_type = 'Manager' OR s.can_alter_ledger = 1)
        LIMIT 1
    """, (user,))
    return bool(is_mgr)


@frappe.whitelist()
def check_report_manager_permission():
    user = frappe.session.user
    return {
        "is_manager": is_manager_or_admin(user),
        "user": user
    }


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
            "width": 130,
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
            "width": 105,
        },
        {
            "label": _("Product"),
            "fieldname": "product",
            "fieldtype": "Link",
            "options": "support_contract_product",
            "width": 170,
        },
        {
            "label": _("Status / Health"),
            "fieldname": "health_status",
            "fieldtype": "Data",
            "width": 170,
        },
        {
            "label": _("Expiry Date"),
            "fieldname": "expiry_date",
            "fieldtype": "Date",
            "width": 115,
        },
        {
            "label": _("Amount"),
            "fieldname": "amount",
            "fieldtype": "Currency",
            "width": 110,
        },
        {
            "label": _("Action"),
            "fieldname": "action",
            "fieldtype": "Data",
            "width": 185,
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

    user = frappe.session.user
    if not is_manager_or_admin(user):
        # Standard executives strictly see only contracts where they are assigned.
        # Check contract row executives first; if contract has no executives specified, fall back to ledger header.
        conditions.append("""(
            (COALESCE(c.executive1, '') != '' OR COALESCE(c.executive2, '') != '')
            AND (c.executive1 = %(logged_user)s OR c.executive2 = %(logged_user)s)
            OR (
                COALESCE(c.executive1, '') = '' AND COALESCE(c.executive2, '') = ''
                AND (l.executive = %(logged_user)s OR l.executive2 = %(logged_user)s)
            )
        )""")
        values["logged_user"] = user
    elif filters.get("executive"):
        conditions.append("""(
            (COALESCE(c.executive1, '') != '' OR COALESCE(c.executive2, '') != '')
            AND (c.executive1 = %(executive)s OR c.executive2 = %(executive)s)
            OR (
                COALESCE(c.executive1, '') = '' AND COALESCE(c.executive2, '') = ''
                AND (l.executive = %(executive)s OR l.executive2 = %(executive)s)
            )
        )""")
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
            COALESCE(NULLIF(c.company_name, ''), l.our_company_name, 'HBS Solutions Pvt Ltd') as company_name,
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
            l.serial_no as primary_serial,
            l.our_company_name,
            l.email as customer_email
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


# ==========================================================
# CONTRACT FOLLOW-UP & QUOTATION DISPATCH
# ==========================================================

import re

def extract_pi_number_and_prefix(val, default_prefix="HBS/TS"):
    if not val:
        return default_prefix, 0, None
    val_str = str(val).strip()

    if val_str.startswith("HB/") or (default_prefix == "HB" and not val_str.startswith("HBS")):
        m_hb = re.match(r"^HB(?:/(\d{2}-\d{2}))?/(\d+)$", val_str)
        if m_hb:
            return "HB", int(m_hb.group(2)), m_hb.group(1)
        digits = re.findall(r"\d+", val_str)
        if digits:
            return "HB", int(digits[-1]), None

    m = re.match(r"^(.*?/)?(\d+)(/.*)?$", val_str)
    if m:
        prefix = (m.group(1) or f"{default_prefix}/").rstrip("/")
        number = int(m.group(2))
        suffix = (m.group(3) or "").lstrip("/") or None
        return prefix, number, suffix
    digits = re.findall(r"\d+", val_str)
    if digits:
        return default_prefix, int(digits[0]), None
    return default_prefix, 0, None


def generate_next_pi_number(quotation_format="HBS Quotation", commit_to_settings=False):
    is_new_age = (quotation_format == "New Age Quotation")
    is_hbs_services = (quotation_format == "HBS Services Quotation")

    if is_hbs_services:
        setting_field = "hbs_services_lead_pi_number"
        last_gen_field = "last_generated_hbs_services_pi_number"
        default_prefix = "HBSS"
    elif is_new_age:
        setting_field = "new_age_lead_pi_number"
        last_gen_field = "last_generated_new_age_pi_number"
        default_prefix = "NIPL/TS"
    else:
        setting_field = "hbs_lead_pi_number"
        last_gen_field = "last_generated_pi_number"
        default_prefix = "HBS/TS"

    admin_val = ""
    last_gen_val = ""
    try:
        admin_val = frappe.db.get_single_value("Hbs CRM Settings", setting_field) or ""
        last_gen_val = frappe.db.get_single_value("Hbs CRM Settings", last_gen_field) or ""
    except Exception:
        pass

    prefix, admin_num, suffix = extract_pi_number_and_prefix(admin_val, default_prefix=default_prefix)
    _, last_gen_num, _ = extract_pi_number_and_prefix(last_gen_val, default_prefix=default_prefix)

    max_lead_num = 0
    if frappe.db.table_exists("Hbs Crm Lead"):
        if is_hbs_services:
            cond_lead = "(`quotation_format` = 'HBS Services Quotation' OR `pi_number` LIKE 'HBSS/%' OR `pi_number` LIKE 'HB/%')"
        elif is_new_age:
            cond_lead = "(`quotation_format` = 'New Age Quotation' OR `pi_number` LIKE 'NIPL/%')"
        else:
            cond_lead = "((`quotation_format` NOT IN ('New Age Quotation', 'HBS Services Quotation') OR `quotation_format` IS NULL) AND (`pi_number` NOT LIKE 'NIPL/%' AND `pi_number` NOT LIKE 'HBSS/%' AND `pi_number` NOT LIKE 'HB/%'))"
        lead_rows = frappe.db.sql(f"""
            SELECT pi_number FROM `tabHbs Crm Lead`
            WHERE pi_number IS NOT NULL AND pi_number != '' AND {cond_lead}
            ORDER BY creation DESC LIMIT 50
        """, as_dict=True)
        for r in lead_rows:
            _, num, _ = extract_pi_number_and_prefix(r.pi_number, default_prefix=default_prefix)
            if num > max_lead_num:
                max_lead_num = num

    max_fup_num = 0
    if frappe.db.table_exists("support_contract_followup"):
        if is_hbs_services:
            cond_fup = "(`pi_number` LIKE 'HBSS/%' OR `pi_number` LIKE 'HB/%')"
        elif is_new_age:
            cond_fup = "pi_number LIKE 'NIPL/%'"
        else:
            cond_fup = "pi_number LIKE 'HBS/%'"
        followup_rows = frappe.db.sql(f"""
            SELECT pi_number FROM `tabsupport_contract_followup`
            WHERE pi_number IS NOT NULL AND pi_number != '' AND {cond_fup}
            ORDER BY creation DESC LIMIT 50
        """, as_dict=True)
        for r in followup_rows:
            _, num, _ = extract_pi_number_and_prefix(r.pi_number, default_prefix=default_prefix)
            if num > max_fup_num:
                max_fup_num = num

    next_num = max(admin_num, last_gen_num, max_lead_num, max_fup_num) + 1
    d = frappe.utils.getdate(frappe.utils.nowdate())
    fy_start = d.year if d.month >= 4 else (d.year - 1)
    fy_str = suffix or f"{str(fy_start)[-2:]}-{str(fy_start + 1)[-2:]}"
    prefix_clean = prefix or default_prefix
    full_pi_number = f"{prefix_clean}/{next_num}/{fy_str}"

    if commit_to_settings:
        try:
            frappe.db.set_single_value("Hbs CRM Settings", last_gen_field, full_pi_number)
        except Exception:
            pass

    return full_pi_number


def render_contract_quotation_html(
    unique_id,
    contract_id,
    quotation_format="HBS Quotation",
    pi_number=None,
    item_name=None,
    item_description=None,
    qty=None,
    rate=None,
    amount=None,
    include_all_serials=1
):
    ledger = frappe.get_doc("support_ticket_ledger", unique_id)
    contract = None
    for c in ledger.contracts:
        if c.name == contract_id:
            contract = c
            break

    if not contract and ledger.contracts:
        contract = ledger.contracts[0]

    if not contract:
        frappe.throw(_("No contract details found for this customer."))

    category = (contract.category or "").strip().upper()
    default_item_name = "Annual Maintenance Contract" if "AMC" in category else ("Cloud Hosting Charges" if "CLOUD" in category else (contract.product or "Annual Maintenance Contract"))
    item_name = (item_name or "").strip() or default_item_name

    default_qty = float(contract.qty or 1)
    try:
        qty = float(qty) if qty is not None and str(qty).strip() != "" else default_qty
    except Exception:
        qty = default_qty

    default_rate = float(contract.rate or contract.amount or 0)
    try:
        rate = float(rate) if rate is not None and str(rate).strip() != "" else default_rate
    except Exception:
        rate = default_rate

    default_amount = float(contract.amount or (qty * rate))
    try:
        amount = float(amount) if amount is not None and str(amount).strip() != "" else default_amount
    except Exception:
        amount = default_amount

    serial_str = ledger.serial_no or "-"
    if frappe.utils.cint(include_all_serials) == 1:
        serials = frappe.get_all("support_ticket_ledger_serials", filters={"parent": unique_id}, pluck="serial_no")
        if serials:
            serial_str = ", ".join(serials)

    default_item_desc = f"{item_name} for {contract.product or 'Tally Software'} (Serial: {serial_str}). Renewal Period: {contract.period or '1 Year'}."
    item_description = (item_description or "").strip() or default_item_desc

    if not pi_number:
        pi_number = generate_next_pi_number(quotation_format, commit_to_settings=False)

    if quotation_format == "HBS Services Quotation":
        folder = "hbs_services_quotation"
        html_name = "hbs_services_quotation.html"
    elif quotation_format == "New Age Quotation":
        folder = "new_age_quotation"
        html_name = "new_age_quotation.html"
    else:
        folder = "hbs_quotation"
        html_name = "hbs_quotation.html"

    template_str = None
    candidate_paths = [
        # 1. Bundled inside hbs_ticket_system
        frappe.get_app_path("hbs_ticket_system", "hbs_support_system", "print_format", folder, html_name),
        frappe.get_app_path("hbs_ticket_system", "print_format", folder, html_name),
        # 2. Dynamic app path from hbs_crm
        frappe.get_app_path("hbs_crm", "hbs_crm", "print_format", folder, html_name),
        frappe.get_app_path("hbs_crm", "print_format", folder, html_name),
        # 3. Relative to bench / sites
        os.path.normpath(os.path.join(frappe.get_site_path(), "..", "..", "apps", "hbs_crm", "hbs_crm", "hbs_crm", "print_format", folder, html_name)),
        os.path.normpath(os.path.join(frappe.get_site_path(), "..", "apps", "hbs_crm", "hbs_crm", "hbs_crm", "print_format", folder, html_name)),
        f"/home/manish/frappe-bench/apps/hbs_crm/hbs_crm/hbs_crm/print_format/{folder}/{html_name}",
    ]
    for p in candidate_paths:
        if p and os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    content = f.read()
                    if content and content.strip():
                        template_str = content
                        break
            except Exception:
                pass

    if not template_str and frappe.db.exists("Print Format", quotation_format):
        db_html = frappe.db.get_value("Print Format", quotation_format, "html")
        if db_html and db_html.strip():
            template_str = db_html

    if not template_str:
        frappe.throw(_(f"Quotation template for '{quotation_format}' could not be found."))

    class ItemObj:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)
        def get(self, k, d=None):
            return self.__dict__.get(k, d)

    class DocObj:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)
        def get(self, k, d=None):
            return self.__dict__.get(k, d)

    subtotal = round(float(amount or (qty * rate)), 2)
    tax_percent = 18.0
    tax_amount = round((subtotal * tax_percent) / 100.0, 2)
    grand_total = round(subtotal + tax_amount, 2)
    final_rounded = round(grand_total)

    doc_obj = DocObj(
        company_name=ledger.party_name or "CLIENT",
        address=ledger.address or "",
        company_gst=ledger.gstin or "",
        quotation_date=frappe.utils.nowdate(),
        pi_number=pi_number,
        creation=frappe.utils.nowdate(),
        name=unique_id,
        lead_type="AMC",
        delivery=None,
        support=None,
        validity=None,
        payment_terms=None,
        taxes=None,
        additional_discount=0,
        total_before_tax=subtotal,
        total_tax=tax_amount,
        total_after_tax=grand_total,
        final_total=final_rounded,
        grand_total=final_rounded,
        items=[ItemObj(
            item_name=item_name,
            hsn="998313",
            description=item_description,
            qty=qty,
            rate=rate,
            amount=subtotal,
            tax=tax_percent,
            tax_amount=tax_amount,
            discount_amount=0
        )]
    )

    html = frappe.render_template(template_str, {"doc": doc_obj})
    return html, pi_number


@frappe.whitelist()
def get_contract_followup_history(unique_id, contract_id=None):
    if not unique_id or not frappe.db.exists("support_ticket_ledger", unique_id):
        return []

    conds = ["parent = %(unique_id)s"]
    vals = {"unique_id": unique_id}

    if contract_id:
        conds.append("(contract_id = %(contract_id)s OR IFNULL(contract_id, '') = '')")
        vals["contract_id"] = contract_id

    where_clause = " AND ".join(conds)

    rows = frappe.db.sql(f"""
        SELECT
            name,
            contract_id,
            product,
            activity_type,
            remarks,
            next_followup_date,
            logged_by,
            logged_on,
            email_sent,
            pi_number,
            quotation_format
        FROM `tabsupport_contract_followup`
        WHERE {where_clause}
        ORDER BY logged_on DESC, creation DESC
        LIMIT 50
    """, vals, as_dict=True)

    user_names = {}
    for r in rows:
        u = r.logged_by
        if u and u not in user_names:
            user_names[u] = frappe.db.get_value("User", u, "full_name") or u
        r.logged_by_name = user_names.get(u, u or "System")
        r.logged_on_str = frappe.utils.format_datetime(r.logged_on, "dd-MMM-yyyy hh:mm a") if r.logged_on else ""
        r.next_followup_date_str = frappe.utils.formatdate(r.next_followup_date, "dd-MMM-yyyy") if r.next_followup_date else ""

    return rows


@frappe.whitelist()
def preview_contract_quotation(
    unique_id,
    contract_id,
    quotation_format="HBS Quotation",
    item_name=None,
    item_description=None,
    qty=None,
    rate=None,
    amount=None,
    include_all_serials=1
):
    html, pi_number = render_contract_quotation_html(
        unique_id,
        contract_id,
        quotation_format,
        pi_number=None,
        item_name=item_name,
        item_description=item_description,
        qty=qty,
        rate=rate,
        amount=amount,
        include_all_serials=include_all_serials
    )
    return {
        "html": html,
        "pi_number": pi_number
    }


@frappe.whitelist()
def get_contract_email_defaults(unique_id, contract_id=None):
    if not unique_id or not frappe.db.exists("support_ticket_ledger", unique_id):
        frappe.throw(_("Customer record not found."))

    ledger = frappe.get_doc("support_ticket_ledger", unique_id)
    contract = None
    if contract_id:
        for c in ledger.contracts:
            if c.name == contract_id:
                contract = c
                break

    crm_settings = frappe.get_single("Hbs CRM Email Settings") if frappe.db.exists("DocType", "Hbs CRM Email Settings") else frappe._dict()
    sender_name = getattr(crm_settings, "sender_name", None) or "HBS Sales Team"
    from_email = getattr(crm_settings, "email_id", None) or "tally@hbsmail.in"

    exec_user = (contract.executive1 if contract and contract.executive1 else None) or (ledger.executive if ledger.executive else None) or frappe.session.user
    exec_doc = frappe.get_doc("User", exec_user) if exec_user and frappe.db.exists("User", exec_user) else None
    logged_in_user_doc = frappe.get_doc("User", frappe.session.user) if frappe.session.user and frappe.db.exists("User", frappe.session.user) else None

    def get_user_dict(u_doc):
        if not u_doc:
            return {"full_name": "Executive", "email": "", "mobile_no": "", "phone": "", "phone_number": "", "designation": ""}
        m = u_doc.get("mobile_no") or u_doc.get("phone") or u_doc.get("phone_number") or ""
        return {
            "full_name": u_doc.get("full_name") or u_doc.get("first_name") or "Executive",
            "email": u_doc.get("email") or "",
            "mobile_no": m,
            "phone": m,
            "phone_number": m,
            "designation": u_doc.get("designation") or ""
        }

    executive_dict = get_user_dict(exec_doc)
    logged_in_user_dict = get_user_dict(logged_in_user_doc)

    serial_str = ledger.serial_no or ""
    serials = frappe.get_all("support_ticket_ledger_serials", filters={"parent": unique_id}, pluck="serial_no")
    if serials:
        serial_str = ", ".join([str(s) for s in serials if s])

    contact_person = ""
    contact_phone = ""
    contact_details = ledger.get("contact_details") or []
    for ct in contact_details:
        if getattr(ct, "contact_name", None):
            contact_person = ct.contact_name
            contact_phone = ct.contact_phone or getattr(ct, "phone_number", "") or ""
            break

    doc_context = {
        "name": unique_id,
        "company_name": ledger.party_name or "Valued Client",
        "party_name": ledger.party_name or "Valued Client",
        "contact_name": contact_person or ledger.party_name or "Valued Client",
        "cc_acc_name": ledger.party_name or "Valued Client",
        "portal_acc_name": ledger.party_name or "Valued Client",
        "cc_contact": contact_person or ledger.party_name or "Valued Client",
        "portal_contact": contact_person or ledger.party_name or "Valued Client",
        "contact_phone": contact_phone,
        "tally_serial": serial_str,
        "tss_tally_serial": serial_str,
        "serial_no": serial_str,
        "product": contract.product if contract else "",
        "category": contract.category if contract else "AMC",
        "period": contract.period if contract else "1 Year",
        "license": contract.product if contract else "TallyPrime",
        "edition": contract.product if contract else "TallyPrime",
        "flavour": contract.product if contract else "TallyPrime",
        "acc_expiry_date": frappe.utils.formatdate(contract.expiry_date, "dd-MMM-yyyy") if (contract and contract.expiry_date) else "N/A",
        "portal_expiry_date": frappe.utils.formatdate(contract.expiry_date, "dd-MMM-yyyy") if (contract and contract.expiry_date) else "N/A",
        "expiry_date": frappe.utils.formatdate(contract.expiry_date, "dd-MMM-yyyy") if (contract and contract.expiry_date) else "N/A",
        "cc_amount": frappe.utils.fmt_money(contract.amount or contract.rate or 0) if contract else "0.00",
        "final_total": frappe.utils.fmt_money(contract.amount or contract.rate or 0) if contract else "0.00",
        "amount": frappe.utils.fmt_money(contract.amount or contract.rate or 0) if contract else "0.00",
        "executive_1": contract.executive1 if contract else "",
    }

    render_context = {
        "doc": doc_context,
        "executive": executive_dict,
        "logged_in_user": logged_in_user_dict,
        "frappe": frappe
    }

    subject_tmpl = None
    body_tmpl = None
    if getattr(crm_settings, "contract_email_subject", None) or getattr(crm_settings, "contract_email_body", None):
        subject_tmpl = getattr(crm_settings, "contract_email_subject", None)
        body_tmpl = getattr(crm_settings, "contract_email_body", None)
    elif contract and contract.category in ("AMC", "TSS") and getattr(crm_settings, "renewal_email_subject", None):
        subject_tmpl = crm_settings.renewal_email_subject
        body_tmpl = crm_settings.renewal_email_body
    elif getattr(crm_settings, "email_subject", None):
        subject_tmpl = crm_settings.email_subject
        body_tmpl = crm_settings.email_body

    subject = ""
    message = ""
    default_subject = f"Quotation for {doc_context.get('category') or 'Contract'} Renewal — {doc_context.get('product') or 'Services'} — {doc_context.get('company_name')}"
    if subject_tmpl:
        try:
            subject = frappe.render_template(subject_tmpl, render_context)
        except Exception:
            subject = default_subject
    else:
        subject = default_subject

    if body_tmpl:
        try:
            message = frappe.render_template(body_tmpl, render_context)
        except Exception:
            message = ""

    if not message:
        message = f"""<p>Dear {doc_context['contact_name']},</p>
<p>Greetings from HBS Solutions!</p>
<p>With reference to our discussion regarding the renewal of your <b>{doc_context['product'] or 'Contract Services'}</b>, please find below the renewal details and the attached official quotation:</p>
<table class="table table-bordered" style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px;">
\t<tbody>
\t\t<tr>
\t\t\t<td style="padding: 8px; background: #f8fafc; font-weight: 600; width: 180px;">Customer / Account:</td>
\t\t\t<td style="padding: 8px;"><b>{doc_context['company_name']}</b></td>
\t\t</tr>
\t\t<tr>
\t\t\t<td style="padding: 8px; background: #f8fafc; font-weight: 600;">Contract / Service:</td>
\t\t\t<td style="padding: 8px;">{doc_context['product']} ({doc_context['category']})</td>
\t\t</tr>
\t\t<tr>
\t\t\t<td style="padding: 8px; background: #f8fafc; font-weight: 600;">Serial Number(s):</td>
\t\t\t<td style="padding: 8px; font-family: monospace;">{doc_context['serial_no'] or '-'}</td>
\t\t</tr>
\t\t<tr>
\t\t\t<td style="padding: 8px; background: #f8fafc; font-weight: 600;">Expiry Date:</td>
\t\t\t<td style="padding: 8px; color: #dc2626; font-weight: 600;">{doc_context['expiry_date'] or '-'}</td>
\t\t</tr>
\t\t<tr>
\t\t\t<td style="padding: 8px; background: #f8fafc; font-weight: 600;">Renewal Amount:</td>
\t\t\t<td style="padding: 8px; color: #059669; font-size: 15px; font-weight: 700;">₹ {doc_context['amount'] or '0.00'}</td>
\t\t</tr>
\t</tbody>
</table>
<p>Please find attached your official quotation PDF for your review and approval.</p>
<p>Do let us know if you require any modifications or have any queries.</p>
<p>Warm regards,<br>
<b>{executive_dict['full_name']}</b><br>
HBS Solutions Pvt Ltd
</p>"""

    user_email = logged_in_user_dict.get("email") or (frappe.session.user if frappe.session and "@" in str(frappe.session.user) else "")
    client_email = ledger.email or ""

    comp_name = (contract.get("company_name") if contract else None) or getattr(ledger, "our_company_name", None) or "HBS Solutions Pvt Ltd"
    if "SERVICES" in comp_name.upper():
        detected_format = "HBS Services Quotation"
    elif "NEWAGE" in comp_name.upper():
        detected_format = "New Age Quotation"
    else:
        detected_format = "HBS Quotation"

    return {
        "sender_name": sender_name,
        "from_email": from_email,
        "recipient_email": client_email,
        "cc_email": user_email,
        "subject": subject,
        "message": message,
        "company_name": comp_name,
        "quotation_format": detected_format
    }


@frappe.whitelist()
def save_contract_followup(
    unique_id,
    contract_id=None,
    remarks="",
    next_followup_date=None,
    send_email=0,
    recipient_email=None,
    quotation_format="HBS Quotation",
    email_subject=None,
    email_body=None,
    activity_type=None,
    sender_name=None,
    from_email=None,
    cc_email=None,
    item_name=None,
    item_description=None,
    qty=None,
    rate=None,
    amount=None,
    include_all_serials=1
):
    if not unique_id or not frappe.db.exists("support_ticket_ledger", unique_id):
        frappe.throw(_("Customer record not found."))

    send_email = frappe.utils.cint(send_email) == 1
    raw_remarks = (remarks or "").strip()
    pi_number = ""

    if send_email:
        if not recipient_email or not recipient_email.strip():
            frappe.throw(_("Recipient email is required to send quotation."))

        pi_number = generate_next_pi_number(quotation_format, commit_to_settings=True)
        html, quote_pi = render_contract_quotation_html(
            unique_id,
            contract_id,
            quotation_format,
            pi_number=pi_number,
            item_name=item_name,
            item_description=item_description,
            qty=qty,
            rate=rate,
            amount=amount,
            include_all_serials=include_all_serials
        )
        pdf_bytes = frappe.utils.pdf.get_pdf(html)

        subject = (email_subject or "").strip() or f"AMC Renewal Quotation - {pi_number}"
        message = (email_body or "").strip() or f"Dear Client,\n\nPlease find attached your AMC Renewal Quotation ({pi_number}).\n\nRegards,\nHBS Solutions"

        display_name = (sender_name or "").strip()
        email_addr = (from_email or "").strip()
        if not display_name or not email_addr:
            if frappe.db.exists("DocType", "Hbs CRM Email Settings"):
                crm_settings = frappe.get_single("Hbs CRM Email Settings")
                if not display_name:
                    display_name = getattr(crm_settings, "sender_name", None) or "HBS Sales Team"
                if not email_addr:
                    email_addr = getattr(crm_settings, "email_id", None) or "tally@hbsmail.in"
        display_name = display_name or "HBS Sales Team"
        email_addr = email_addr or "tally@hbsmail.in"
        sender = f"{display_name} <{email_addr}>"

        cc_list = [e.strip() for e in cc_email.split(",") if e.strip()] if cc_email else []

        fname = f"Quotation_{pi_number.replace('/', '_')}.pdf"

        frappe.sendmail(
            recipients=[recipient_email.strip()],
            sender=sender,
            cc=cc_list if cc_list else None,
            subject=subject,
            message=message,
            attachments=[{
                "fname": fname,
                "fcontent": pdf_bytes
            }],
            now=True
        )

        activity_type = activity_type or "Email Sent"
        if raw_remarks:
            final_remarks = f"Quotation {pi_number} sent via email to {recipient_email.strip()}. Notes: {raw_remarks}"
        else:
            final_remarks = f"Quotation {pi_number} sent via email to {recipient_email.strip()}."
    else:
        if not raw_remarks:
            frappe.throw(_("Discussion remarks are required."))
        activity_type = activity_type or "Phone Call"
        final_remarks = raw_remarks

    ledger = frappe.get_doc("support_ticket_ledger", unique_id)
    contract_product = ""
    for c in ledger.contracts:
        if c.name == contract_id:
            contract_product = c.product
            break

    row = ledger.append("contract_followups", {})
    row.contract_id = contract_id or ""
    row.product = contract_product or ""
    row.activity_type = activity_type
    row.remarks = final_remarks
    row.next_followup_date = next_followup_date or None
    row.logged_by = frappe.session.user
    row.logged_on = frappe.utils.now_datetime()
    row.email_sent = 1 if send_email else 0
    row.pi_number = pi_number if send_email else ""
    row.quotation_format = quotation_format if send_email else ""

    ledger.save(ignore_permissions=True)

    return {
        "success": True,
        "pi_number": pi_number,
        "message": _("Follow-up logged successfully.") + (_(f" Quotation {pi_number} sent to {recipient_email}.") if send_email else "")
    }

