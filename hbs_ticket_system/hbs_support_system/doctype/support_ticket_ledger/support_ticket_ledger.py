# Copyright (c) 2026, HBS and contributors
# For license information, please see license.txt

import json
import frappe
from frappe import _
from frappe.model.document import Document


def calculate_contract_expiry(start_date, period):
    if not start_date or not period:
        return None
    try:
        from dateutil.relativedelta import relativedelta
        import datetime
        dt = frappe.utils.getdate(start_date)
        period_str = str(period).upper().replace(" ", "").replace("-", "")
        months = 0
        if "YEAR" in period_str and "HALF" not in period_str:
            months = 12
        elif "HALF" in period_str:
            months = 6
        elif "QUART" in period_str:
            months = 3
        elif "MONTH" in period_str:
            months = 1
        if months:
            exp = dt + relativedelta(months=months) - datetime.timedelta(days=1)
            return exp.strftime("%Y-%m-%d")
    except Exception:
        pass
    return None


class support_ticket_ledger(Document):

    def autoname(self):
        if not self.name or self.name.startswith("new-support-ticket-ledger"):
            if self.unique_id:
                self.name = self.unique_id
            else:
                from hbs_ticket_system.hbs_support_system.doctype.hbs_support_settings.hbs_support_settings import get_next_customer_unique_id
                next_id = get_next_customer_unique_id()
                if next_id:
                    self.name = next_id
                    self.unique_id = next_id
        else:
            if not self.unique_id:
                self.unique_id = self.name

    def before_insert(self):
        if not self.unique_id and self.name:
            self.unique_id = self.name

    def validate(self):
        self.check_alter_permission()

        if not self.unique_id and self.name:
            self.unique_id = self.name

        # Process and validate contracts
        today_str = frappe.utils.nowdate()
        has_active_amc = False
        latest_amc_exp = None
        for row in self.get("contracts") or []:
            if row.product and not row.category:
                row.category = frappe.db.get_value("support_contract_product", row.product, "category") or "Other"

            qty = float(row.qty or 0)
            rate = float(row.rate or 0)
            if qty > 0 and rate > 0:
                row.amount = round(qty * rate, 2)
            else:
                row.amount = round(float(row.amount or 0), 2)

            if row.start_date and row.period and not row.expiry_date:
                row.expiry_date = calculate_contract_expiry(row.start_date, row.period)

            is_active = False
            if row.expiry_date:
                is_active = (str(row.expiry_date) >= today_str)
                row.status = "Active" if is_active else "Expired"
            else:
                row.status = "Active"
                is_active = True

            cat = (row.category or "").strip().upper()
            if "AMC" in cat and is_active:
                has_active_amc = True
                if not latest_amc_exp or str(row.expiry_date) > str(latest_amc_exp):
                    latest_amc_exp = row.expiry_date
                if row.visits and not self.visits:
                    self.visits = row.visits
                if row.executive1 and not self.executive:
                    self.executive = row.executive1
                if row.executive2 and not self.executive2:
                    self.executive2 = row.executive2

        if self.get("contracts"):
            self.amc_status = "YES" if has_active_amc else "NO"
            self.amc_expiry_date = latest_amc_exp if has_active_amc else None

        # Validate child serial numbers
        cleaned_serials = []
        for row in self.get("serial_numbers") or []:
            s = str(row.serial_no or "").strip()
            if s.endswith(".0"):
                s = s[:-2]
            row.serial_no = s
            if not s:
                continue
            if not s.isdigit() or len(s) != 9:
                frappe.throw(_(f"Serial No '{s}' must contain exactly 9 digits."))
            cleaned_serials.append(s)

        # Sync header serial_no for backward compatibility
        if cleaned_serials:
            self.serial_no = cleaned_serials[0]
        elif self.serial_no and not cleaned_serials:
            s_hdr = str(self.serial_no).strip()
            if s_hdr.endswith(".0"):
                s_hdr = s_hdr[:-2]
            if s_hdr.isdigit() and len(s_hdr) == 9:
                self.append("serial_numbers", {"serial_no": s_hdr})
                self.serial_no = s_hdr

    def check_alter_permission(self):
        user = frappe.session.user
        if user in ("Administrator", "Guest"):
            return

        from hbs_ticket_system.hbs_support_system.doctype.support_ticket.support_ticket import is_owner_or_admin, get_support_user_settings
        if is_owner_or_admin(user):
            return

        user_roles = set(frappe.get_roles(user))
        allowed_roles = {"Support User", "Sales User", "System Manager", "HBS Support"}
        if not user_roles.intersection(allowed_roles):
            frappe.throw(
                _("You do not have permission to alter or create Support Ticket Ledgers."),
                frappe.PermissionError,
                title=_("Permission Denied")
            )

        settings = get_support_user_settings()

        # Enforce Contract alteration security on existing ledgers
        if not self.is_new():
            old_doc = self.get_doc_before_save()
            if not old_doc and self.name and frappe.db.exists(self.doctype, self.name):
                old_doc = frappe.get_doc(self.doctype, self.name)
            if old_doc and not settings.get("can_alter_amc"):
                old_contracts = [
                    (str(c.product or ""), str(c.start_date or ""), str(c.expiry_date or ""), float(c.amount or 0))
                    for c in (old_doc.get("contracts") or [])
                ]
                new_contracts = [
                    (str(c.product or ""), str(c.start_date or ""), str(c.expiry_date or ""), float(c.amount or 0))
                    for c in (self.get("contracts") or [])
                ]
                if old_contracts != new_contracts:
                    frappe.throw(
                        _("Only authorized supervisors and system owners are permitted to alter customer contract details."),
                        frappe.PermissionError,
                        title=_("Contract Alteration Denied")
                    )


@frappe.whitelist()
def update_customer_contracts(ledger_name, contracts_json):
    """Save updated contracts directly from List View popup dialog."""
    if not ledger_name or not frappe.db.exists("support_ticket_ledger", ledger_name):
        frappe.throw(_("Customer Ledger not found."))

    user = frappe.session.user
    if user not in ("Administrator", "Guest"):
        from hbs_ticket_system.hbs_support_system.doctype.support_ticket.support_ticket import is_owner_or_admin, get_support_user_settings
        if not is_owner_or_admin(user):
            settings = get_support_user_settings()
            if not settings.get("can_alter_amc"):
                frappe.throw(
                    _("Only authorized supervisors and system owners can update contracts."),
                    frappe.PermissionError,
                    title=_("Permission Denied")
                )

    rows = json.loads(contracts_json) if isinstance(contracts_json, str) else contracts_json
    doc = frappe.get_doc("support_ticket_ledger", ledger_name)
    doc.set("contracts", [])
    for r in rows:
        if not r.get("product"):
            continue
        doc.append("contracts", {
            "product": r.get("product"),
            "category": r.get("category"),
            "period": r.get("period"),
            "start_date": r.get("start_date") or None,
            "expiry_date": r.get("expiry_date") or None,
            "visits": r.get("visits") or None,
            "qty": float(r.get("qty")) if r.get("qty") not in (None, "") else None,
            "rate": float(r.get("rate")) if r.get("rate") not in (None, "") else None,
            "amount": float(r.get("amount") or 0),
            "ip_address": r.get("ip_address"),
            "unique_id": r.get("unique_id"),
            "executive1": r.get("executive1") or None,
            "executive2": r.get("executive2") or None,
            "remarks": r.get("remarks")
        })
    doc.save()
    return {"success": True, "message": _("Contracts updated successfully")}


@frappe.whitelist()
def get_customer_contracts(ledger_name):
    """Fetch existing contracts for list view dialog."""
    if not ledger_name or not frappe.db.exists("support_ticket_ledger", ledger_name):
        return []
    doc = frappe.get_doc("support_ticket_ledger", ledger_name)
    return [c.as_dict() for c in (doc.get("contracts") or [])]
