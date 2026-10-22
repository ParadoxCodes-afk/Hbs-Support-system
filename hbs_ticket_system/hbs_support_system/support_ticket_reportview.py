import frappe
from frappe.desk import reportview

# Pass-through stubs in case any cached call hits these endpoints
@frappe.whitelist()
def get(*args, **kwargs):
    return reportview.get(*args, **kwargs)

@frappe.whitelist()
def get_list(*args, **kwargs):
    return reportview.get_list(*args, **kwargs)