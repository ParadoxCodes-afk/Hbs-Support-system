# Copyright (c) 2026, HBS and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class support_ticket_ledger(Document):

    def validate(self):
        if not self.serial_no:
            return

        serial_no = str(self.serial_no).strip()

        if not serial_no.isdigit() or len(serial_no) != 9:
            frappe.throw("Serial No must contain exactly 9 digits.")