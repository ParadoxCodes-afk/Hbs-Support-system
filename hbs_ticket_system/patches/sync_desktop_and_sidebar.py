import os
import frappe

def execute():
    """Ensure Desktop Icon, Workspace Sidebar, and Workspace are forcefully synced into the database."""
    app_path = frappe.get_app_path("hbs_ticket_system")

    # 1. Sync Workspace Sidebar from app root
    sidebar_file = os.path.join(app_path, "workspace_sidebar", "support_ticket.json")
    if os.path.exists(sidebar_file):
        try:
            from frappe.modules.import_file import import_file_by_path
            import_file_by_path(sidebar_file, force=True)
        except Exception as e:
            frappe.logger().error(f"Failed to import workspace sidebar: {e}")

    # 2. Sync Workspace
    ws_file = os.path.join(app_path, "hbs_support_system", "workspace", "support_ticket", "support_ticket.json")
    if os.path.exists(ws_file):
        try:
            from frappe.modules.import_file import import_file_by_path
            import_file_by_path(ws_file, force=True)
        except Exception as e:
            frappe.logger().error(f"Failed to import workspace: {e}")

    # 3. Sync Desktop Icon from file
    icon_file = os.path.join(app_path, "desktop_icon", "support_ticket.json")
    if os.path.exists(icon_file):
        try:
            from frappe.modules.import_file import import_file_by_path
            import_file_by_path(icon_file, force=True)
        except Exception as e:
            frappe.logger().error(f"Failed to import desktop icon: {e}")

    # 4. Explicitly guarantee Desktop Icon in database
    if frappe.db.exists("DocType", "Desktop Icon"):
        if not frappe.db.exists("Desktop Icon", "Support Ticket"):
            try:
                doc = frappe.get_doc({
                    "doctype": "Desktop Icon",
                    "name": "Support Ticket",
                    "label": "Support Ticket",
                    "icon_type": "App",
                    "link_type": "External",
                    "link": "/app/support-ticket",
                    "app": "hbs_ticket_system",
                    "sidebar": "Support Ticket",
                    "logo_url": "/assets/hbs_ticket_system/images/support_ticket_logo.svg",
                    "standard": 1,
                    "hidden": 0
                })
                doc.flags.ignore_permissions = True
                doc.flags.ignore_mandatory = True
                doc.insert()
            except Exception as e:
                frappe.logger().error(f"Failed to insert desktop icon: {e}")
        else:
            frappe.db.set_value("Desktop Icon", "Support Ticket", {
                "label": "Support Ticket",
                "icon_type": "App",
                "link_type": "External",
                "link": "/app/support-ticket",
                "app": "hbs_ticket_system",
                "sidebar": "Support Ticket",
                "logo_url": "/assets/hbs_ticket_system/images/support_ticket_logo.svg",
                "standard": 1,
                "hidden": 0
            })

    # Clear all desktop and workspace caches
    frappe.clear_cache(doctype="Desktop Icon")
    frappe.clear_cache(doctype="Workspace Sidebar")
    frappe.clear_cache(doctype="Workspace")
    frappe.clear_cache()
