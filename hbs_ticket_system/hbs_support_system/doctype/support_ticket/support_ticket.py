import frappe
from frappe.model.document import Document


class support_ticket(Document):

    def before_insert(self):
        self.add_creation_followup()

    def before_save(self):
        self.update_list_sort_order()

        

    def after_insert(self):
        self.send_new_ticket_email()

    def on_update(self):
        self.update_ledger()


    # ============================================================
    # CREATION FOLLOWUP
    # ============================================================

    def add_creation_followup(self):

        self.append("followup_history", {
            "updated_by": frappe.session.user,
            "updated_on": frappe.utils.now(),
            "remarks"   : self.remarks,
            "status"    : "NEW",
            "call_type" : self.call_type
        })


    # ============================================================
    # LIST SORT ORDER
    # ============================================================

    def update_list_sort_order(self):

        # AMC is primary
        if self.amc_status == "YES":
            amc_order = 1
        else:
            amc_order = 2

        # Status is secondary
        status_order = {
            "FOLLOWUP": 1,
            "NEW": 2,
            "PENDING": 3,
            "COMPLETED": 4
        }

        status_value = status_order.get(self.status, 99)

        self.list_sort_order = (amc_order * 10) + status_value


    # ============================================================
    # UPDATE LEDGER
    # ============================================================

    def update_ledger(self):

        serial_no = str(self.serial_no or "").strip()

        if not serial_no.isdigit() or len(serial_no) != 9:
            frappe.throw(
                "Serial No must contain exactly 9 digits."
            )

        ledger = frappe.get_doc(
            "support_ticket_ledger",
            serial_no
        )

        ledger.party_name = self.party_name
        ledger.email = self.email

        if self.contact_name:

            existing_contact = None

            for contact in ledger.contact_details:

                if contact.contact_name == self.contact_name:
                    existing_contact = contact
                    break

            if existing_contact:

                existing_contact.contact_phone = self.contact_phone

            else:

                ledger.append(
                    "contact_details",
                    {
                        "contact_name": self.contact_name,
                        "contact_phone": self.contact_phone
                    }
                )

        ledger.save(ignore_permissions=True)



    # ============================================================
    # SEND EMAIL FOR NEW SUPPORT TICKET
    # ============================================================

    def send_new_ticket_email(self):

        if not self.email:
            return

        executive_email = None
        executive2_email = None

        if self.executive:

            executive_email = frappe.db.get_value(
                "User",
                self.executive,
                "email"
            )

        if self.executive2:

            executive2_email = frappe.db.get_value(
                "User",
                self.executive2,
                "email"
            )

        cc_list = []

        if executive_email:
            cc_list.append(executive_email)

        if executive2_email:
            cc_list.append(executive2_email)

        frappe.sendmail(

            recipients=[self.email],

            cc=cc_list,

            subject="Support Ticket Created - " + self.name,

            message=f"""
            <p>Dear Customer,</p>

            <p>
                Your support ticket has been created successfully.
            </p>

            <p>
                <b>Ticket No:</b> {self.name}<br>
                <b>Serial No:</b> {self.serial_no or ""}<br>
                <b>Status:</b> {self.status or ""}
            </p>

            <p>
                Thank you.
            </p>

            <p>
                Regards,<br>
                <b>HBS Solutions Pvt Ltd</b>
            </p>
            """
        )


@frappe.whitelist()
def get_active_users(doctype, txt, searchfield, start, page_len, filters):
    return frappe.db.sql("""
        SELECT name
        FROM `tabUser`
        WHERE enabled = 1
          AND user_type = 'System User'
          AND name LIKE %s
        ORDER BY name
        LIMIT %s, %s
    """, (
        f"%{txt}%",
        start,
        page_len
    ))

@frappe.whitelist()
def get_call_history(serial_no, current_ticket=None):
    if not serial_no:
        return []

    filters = {"serial_no": serial_no}

    # Exclude the ticket currently open
    if current_ticket:
        filters["name"] = ["!=", current_ticket]

    return frappe.get_all(
        "support_ticket",
        filters=filters,
        fields=[
            "name",
            "call_source",
            "call_type",
            "status",
            "creation"
        ],
        order_by="creation desc",
        limit_page_length=100
    )
    

@frappe.whitelist()
def get_new_tickets_only():
    return frappe.utils.cint(
        frappe.db.get_value(
            "User",
            frappe.session.user,
            "new_tickets_only"
        ) or 0
    )


def get_permission_query_conditions(user):
    if user == "Administrator":
        return ""

    new_tickets_only = frappe.utils.cint(
        frappe.db.get_value("User", user, "new_tickets_only") or 0
    )

    if new_tickets_only:
        return "`tabsupport_ticket`.status = 'NEW'"

    return ""

# GET TICKET FOLLOWUP HISTORY FOR VIEW DETAILS DIALOG

@frappe.whitelist()
def get_ticket_followup_history(ticket_name):
    if not ticket_name:
        return {}

    doc = frappe.get_doc("support_ticket", ticket_name)

    return {
        "name": doc.name,
        "status": doc.status,
        "creation":doc.creation,
        "followup_history": [
            {
                "followup_date": row.followup_date,
                "followup_time": row.followup_time,
                "call_type": row.call_type,
                "remarks": row.remarks,
                "updated_by": row.updated_by,
                "updated_on": row.updated_on,
                "status": row.status,
                "sub_status": row.sub_status,
                "sub_sub_status": row.sub_sub_status
            }
            for row in doc.followup_history
        ]
    }

@frappe.whitelist()
def get_ticket_contacts(serial_no):
    serial_no = str(serial_no or "").strip()

    if not serial_no:
        return []

    if not frappe.db.exists("support_ticket_ledger", serial_no):
        return []

    ledger = frappe.get_doc("support_ticket_ledger", serial_no)

    return [
        {
            "contact_name": contact.contact_name,
            "contact_phone": contact.contact_phone
        }
        for contact in ledger.contact_details
    ]
