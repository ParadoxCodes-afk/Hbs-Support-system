# Copyright (c) 2026, Hbs and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class support_team_hierarchy(Document):
	def validate(self):
		if not self.executives:
			frappe.throw(_("Please select at least one Executive in the team."), title=_("Missing Information"))


def has_permission(doc, ptype="read", user=None):
	from hbs_ticket_system.hbs_support_system.doctype.support_ticket.support_ticket import is_owner_or_admin
	return is_owner_or_admin(user)
