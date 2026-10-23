# Copyright (c) 2026, HBS and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class HbsSupportSettings(Document):
    pass


def get_next_customer_unique_id():
    """
    Monotonically increments and returns the next customer unique ID (e.g. CUST-00011).
    Ensures that even if records are deleted, the ID counter never moves backwards or reuses deleted IDs.
    Updates 'last_customer_unique_id' and 'last_customer_counter' in Hbs Support Settings.
    """
    if not frappe.db.exists("DocType", "Hbs Support Settings"):
        return None

    settings = frappe.get_single("Hbs Support Settings")
    current_counter = int(getattr(settings, "last_customer_counter", 0) or 0)

    max_db_counter = 0
    try:
        res = frappe.db.sql("""
            SELECT MAX(CAST(SUBSTRING(unique_id, 6) AS UNSIGNED)) 
            FROM `tabsupport_ticket_ledger` 
            WHERE unique_id LIKE 'CUST-%'
        """)
        if res and res[0] and res[0][0]:
            max_db_counter = int(res[0][0])
    except Exception:
        pass

    counter = max(current_counter, max_db_counter) + 1
    next_id = f"CUST-{counter:05d}"

    settings.last_customer_counter = counter
    settings.last_customer_unique_id = next_id
    settings.flags.ignore_permissions = True
    settings.save(ignore_permissions=True)
    frappe.db.commit()

    return next_id
