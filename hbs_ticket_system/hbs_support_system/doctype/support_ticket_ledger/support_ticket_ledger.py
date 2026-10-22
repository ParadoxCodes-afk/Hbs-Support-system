# Copyright (c) 2026, HBS and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class support_ticket_ledger(Document):

    def validate(self):
        self.check_alter_permission()

        if self.amc_status == "YES" and self.amc_start_date and self.amc_period and not self.amc_expiry_date:
            self.amc_expiry_date = self.get_calculated_amc_expiry()

        if not self.serial_no:
            return

        serial_no = str(self.serial_no).strip()

        if not serial_no.isdigit() or len(serial_no) != 9:
            frappe.throw(_("Serial No must contain exactly 9 digits."))

    def get_calculated_amc_expiry(self):
        if not self.amc_start_date or not self.amc_period:
            return None
        try:
            from dateutil.relativedelta import relativedelta
            import datetime
            dt = frappe.utils.getdate(self.amc_start_date)
            period_str = str(self.amc_period).upper().replace(" ", "").replace("-", "")
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

        # Enforce AMC Tab alteration security on existing ledgers
        if not self.is_new():
            old_doc = self.get_doc_before_save()
            if not old_doc and self.name and frappe.db.exists(self.doctype, self.name):
                old_doc = frappe.db.get_value(
                    self.doctype,
                    self.name,
                    ["amc_status", "amc_period", "amc_start_date", "amc_expiry_date", "amount"],
                    as_dict=True
                )
            if old_doc:
                amc_fields = ["amc_status", "amc_period", "amc_start_date", "amc_expiry_date", "amount"]
                has_amc_change = any(
                    str(self.get(f) or "").strip() != str(old_doc.get(f) or "").strip()
                    for f in amc_fields
                )
                if has_amc_change and not settings.get("can_alter_amc"):
                    frappe.throw(
                        _("Only authorized supervisors and system owners are permitted to alter AMC contract details."),
                        frappe.PermissionError,
                        title=_("AMC Alteration Denied")
                    )
