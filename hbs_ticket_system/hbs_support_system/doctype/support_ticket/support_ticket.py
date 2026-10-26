import frappe
from frappe.model.document import Document


def normalize_phone(phone):
    if not phone:
        return ""
    phone = str(phone).strip()
    digits = "".join(filter(str.isdigit, phone))
    if len(digits) == 10:
        return f"+91-{digits}"
    elif len(digits) == 12 and digits.startswith("91"):
        return f"+91-{digits[2:]}"
    elif not phone.startswith("+") and digits:
        return f"+91-{digits}"
    return phone


def is_genuine_tally_serial(serial):
    if not serial:
        return True
    s = str(serial).strip()
    if len(s) != 9 or not s.isdigit():
        return False
    if not s.startswith("7"):
        return False
    sum_digits = sum(int(d) for d in s)
    while sum_digits >= 10:
        sum_digits = sum(int(d) for d in str(sum_digits))
    return sum_digits == 9


def format_duration(seconds):
    if seconds is None:
        return ""
    seconds = max(0, int(seconds))
    minutes = seconds // 60
    days = minutes // 1440
    hours = (minutes % 1440) // 60
    mins = minutes % 60
    parts = []
    if days:
        suffix = 's' if days > 1 else ''
        parts.append(f"{days} day{suffix}")
    if hours:
        parts.append(f"{hours} hr")
    if mins or not parts:
        parts.append(f"{mins} min")
    return " ".join(parts)


@frappe.whitelist()
def get_ledger_for_serial(serial_no):
    """Lookup parent ledger info for a given 9-digit serial number."""
    serial_no = str(serial_no or "").strip()
    if serial_no.endswith(".0"):
        serial_no = serial_no[:-2]
    if not serial_no:
        return None

    parent = frappe.db.get_value("support_ticket_ledger_serials", {"serial_no": serial_no}, "parent")
    if not parent:
        parent = frappe.db.get_value("support_ticket_ledger", serial_no, "name")
    if not parent:
        parent = frappe.db.get_value("support_ticket_ledger", {"serial_no": serial_no}, "name")
    if not parent:
        return None

    ledger = frappe.db.get_value(
        "support_ticket_ledger",
        parent,
        [
            "name as unique_id",
            "party_name",
            "email",
            "amc_status",
            "amc_expiry_date",
            "executive as amc_executive",
            "executive2 as amc_executive2"
        ],
        as_dict=True
    ) or {}

    # Evaluate multi-item contracts
    contracts = []
    if frappe.db.exists("DocType", "support_ticket_ledger_contracts"):
        contracts = frappe.get_all(
            "support_ticket_ledger_contracts",
            filters={"parent": parent},
            fields=["product", "category", "status", "start_date", "expiry_date", "executive1", "executive2"],
            order_by="expiry_date desc"
        )

    today_str = frappe.utils.nowdate()
    amc_active = False
    cloud_active = False
    modules_active = False
    latest_amc_exp = None
    latest_cloud_exp = None
    latest_mod_exp = None
    c_exec1 = None
    c_exec2 = None

    for c in contracts:
        cat = (c.category or "").strip().upper()
        is_active = (c.expiry_date and str(c.expiry_date) >= today_str)

        if "AMC" in cat and is_active:
            amc_active = True
            if not latest_amc_exp or c.expiry_date > latest_amc_exp:
                latest_amc_exp = c.expiry_date
                c_exec1 = c.executive1 or c_exec1
                c_exec2 = c.executive2 or c_exec2
        elif "CLOUD" in cat and is_active:
            cloud_active = True
            if not latest_cloud_exp or c.expiry_date > latest_cloud_exp:
                latest_cloud_exp = c.expiry_date
        elif "MODULE" in cat and is_active:
            modules_active = True
            if not latest_mod_exp or c.expiry_date > latest_mod_exp:
                latest_mod_exp = c.expiry_date

    if contracts:
        ledger["amc_status"] = "YES" if amc_active else "NO"
        ledger["amc_expiry_date"] = latest_amc_exp
        if c_exec1: ledger["amc_executive"] = c_exec1
        if c_exec2: ledger["amc_executive2"] = c_exec2

    ledger["cloud_status"] = "YES" if cloud_active else "NO"
    ledger["cloud_expiry_date"] = latest_cloud_exp
    ledger["modules_status"] = "YES" if modules_active else "NO"
    ledger["modules_expiry_date"] = latest_mod_exp

    return ledger


class support_ticket(Document):

    def validate(self):
        if self.serial_no:
            s = str(self.serial_no).strip()
            if not is_genuine_tally_serial(s):
                frappe.throw("Invalid Serial Number", title="Invalid Serial Number")
            self.serial_no = s

    def before_insert(self):
        self.add_creation_followup()

    def before_save(self):
        self.sync_amc_details()
        self.sync_followup_date()
        self.update_list_sort_order()
        self.update_timing_metrics()
        self.sync_renewal_details()

    def sync_followup_date(self):
        if self.status in ("FOLLOWUP", "PENDING"):
            latest_date = None
            for row in reversed(self.get("followup_history") or []):
                if row.followup_date:
                    latest_date = frappe.utils.getdate(row.followup_date)
                    break
            self.followup_date = latest_date or frappe.utils.getdate(self.creation or frappe.utils.nowdate())
        elif self.status == "NEW":
            if not self.followup_date:
                self.followup_date = frappe.utils.getdate(self.creation or frappe.utils.nowdate())
        else:
            self.followup_date = None

        

    def after_insert(self):
        self.send_new_ticket_email()

    def on_update(self):
        self.update_ledger()


    # ============================================================
    # TIMING & COMPLETION METRICS
    # ============================================================

    def update_timing_metrics(self):
        now = frappe.utils.now_datetime()

        # Track first entry into FOLLOWUP status
        if self.status == "FOLLOWUP" and not self.followup_start_time:
            self.followup_start_time = now

        # When status is COMPLETED
        if self.status == "COMPLETED":
            if not self.completed_on:
                self.completed_on = now

            created = frappe.utils.get_datetime(self.creation) if self.creation else now
            completed = frappe.utils.get_datetime(self.completed_on)

            # 1. New to Completed
            total_sec = max(0, (completed - created).total_seconds())
            self.total_time_taken_mins = round(total_sec / 60.0, 2)
            self.total_time_taken = format_duration(total_sec)
            self.pending_time = self.total_time_taken

            # 2. Followup to Completed
            if self.followup_start_time:
                fu_start = frappe.utils.get_datetime(self.followup_start_time)
                fu_sec = max(0, (completed - fu_start).total_seconds())
                self.followup_time_taken_mins = round(fu_sec / 60.0, 2)
                self.followup_time_taken = format_duration(fu_sec)
        else:
            # Active ticket (not completed): update pending_time snapshot
            created = frappe.utils.get_datetime(self.creation) if self.creation else now
            elapsed_sec = max(0, (now - created).total_seconds())
            self.pending_time = format_duration(elapsed_sec)

            # If ticket was reopened from completed
            if self.completed_on:
                self.completed_on = None
                self.total_time_taken_mins = 0
                self.total_time_taken = ""
                self.followup_time_taken_mins = 0
                self.followup_time_taken = ""

    def sync_amc_details(self):
        if not getattr(self, "serial_no", None):
            self.unique_id = None
            self.amc_executive = None
            self.amc_executive2 = None
            return

        ledger = get_ledger_for_serial(self.serial_no)
        if ledger:
            if ledger.get("unique_id"):
                self.unique_id = ledger.unique_id
            if ledger.get("amc_status") == "YES":
                self.amc_status = "YES"
                if ledger.get("amc_expiry_date"):
                    self.amc_expiry_date = ledger.amc_expiry_date
                self.amc_executive = ledger.get("amc_executive")
                self.amc_executive2 = ledger.get("amc_executive2")
            else:
                self.amc_status = ledger.get("amc_status") or "NO"
                self.amc_executive = None
                self.amc_executive2 = None

            self.cloud_status = ledger.get("cloud_status") or "NO"
            self.cloud_expiry_date = ledger.get("cloud_expiry_date")
            self.modules_status = ledger.get("modules_status") or "NO"
            self.modules_expiry_date = ledger.get("modules_expiry_date")
        else:
            self.amc_executive = None
            self.amc_executive2 = None
            self.cloud_status = "NO"
            self.cloud_expiry_date = None
            self.modules_status = "NO"
            self.modules_expiry_date = None

    def sync_renewal_details(self):
        if not getattr(self, "serial_no", None):
            self.renewal_party_name = ""
            self.renewal_license_type = ""
            self.renewal_tally_version = ""
            self.renewal_tss_expiry_date = None
            self.renewal_partner_name = ""
            self.renewal_tss_status = ""
            self.renewal_mobile = ""
            self.renewal_email = ""
            return

        details = get_tally_renewal_details(self.serial_no)
        if details:
            self.renewal_party_name = details.get("party_name") or ""
            self.renewal_license_type = details.get("license_type") or ""
            self.renewal_tally_version = details.get("tally_version") or ""
            self.renewal_tss_expiry_date = details.get("tss_expiry_date")
            self.renewal_partner_name = details.get("partner_name") or ""
            self.renewal_tss_status = details.get("tss_status") or ""
            self.renewal_mobile = details.get("mobile") or ""
            self.renewal_email = details.get("email") or ""
        else:
            self.renewal_party_name = ""
            self.renewal_license_type = ""
            self.renewal_tally_version = ""
            self.renewal_tss_expiry_date = None
            self.renewal_partner_name = ""
            self.renewal_tss_status = ""
            self.renewal_mobile = ""
            self.renewal_email = ""


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

        # Status is secondary: NEW -> FOLLOWUP -> PENDING -> COMPLETED
        status_order = {
            "NEW": 1,
            "FOLLOWUP": 2,
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

        if not is_genuine_tally_serial(serial_no):
            frappe.throw("Invalid Serial Number", title="Invalid Serial Number")

        c_name = (self.contact_name or "").strip()
        c_phone = normalize_phone(self.contact_phone)
        if c_phone and not self.contact_phone:
            self.contact_phone = c_phone

        ledger_id = getattr(self, "unique_id", None)
        if not ledger_id:
            ledger_id = frappe.db.get_value("support_ticket_ledger_serials", {"serial_no": serial_no}, "parent")
        if not ledger_id and frappe.db.exists("support_ticket_ledger", serial_no):
            ledger_id = serial_no
        if not ledger_id and getattr(self, "party_name", None):
            ledger_id = frappe.db.get_value("support_ticket_ledger", {"party_name": self.party_name}, "name")

        if ledger_id and frappe.db.exists("support_ticket_ledger", ledger_id):
            ledger = frappe.get_doc("support_ticket_ledger", ledger_id)
            if self.party_name:
                ledger.party_name = self.party_name
            if self.email:
                ledger.email = self.email

            # Ensure serial_no is in serial_numbers child table
            existing_serials = {s.serial_no for s in (ledger.get("serial_numbers") or []) if s.serial_no}
            if serial_no and serial_no not in existing_serials:
                ledger.append("serial_numbers", {"serial_no": serial_no})

            if c_name or c_phone:
                existing_contact = None
                for contact in (ledger.get("contact_details") or []):
                    if c_name and (contact.contact_name or "").strip().lower() == c_name.lower():
                        existing_contact = contact
                        break
                    elif not c_name and c_phone and (contact.contact_phone or "").strip() == c_phone:
                        existing_contact = contact
                        break

                if existing_contact:
                    if c_name:
                        existing_contact.contact_name = c_name
                    if c_phone:
                        existing_contact.contact_phone = c_phone
                else:
                    ledger.append(
                        "contact_details",
                        {
                            "contact_name": c_name,
                            "contact_phone": c_phone
                        }
                    )
            ledger.save(ignore_permissions=True)
            if not self.unique_id:
                self.unique_id = ledger.name
        else:
            contacts = []
            if c_name or c_phone:
                contacts.append({
                    "contact_name": c_name,
                    "contact_phone": c_phone
                })

            ledger = frappe.get_doc({
                "doctype": "support_ticket_ledger",
                "party_name": self.party_name or serial_no,
                "email": self.email,
                "amc_status": self.amc_status or "NO",
                "amc_expiry_date": self.amc_expiry_date,
                "serial_numbers": [{"serial_no": serial_no}],
                "contact_details": contacts
            })
            ledger.insert(ignore_permissions=True)
            self.unique_id = ledger.name



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

        display_name = "HBS Support Team"
        email_addr = "support@hbsmail.in"

        if frappe.db.exists("DocType", "Hbs CRM Email Settings") and frappe.db.exists("Hbs CRM Email Settings"):
            crm_settings = frappe.get_doc("Hbs CRM Email Settings", ignore_permissions=True)
            if not getattr(crm_settings, "enable_auto_ticket_email", 1):
                return
            if crm_settings.email_id:
                email_addr = crm_settings.email_id
            if crm_settings.sender_name:
                display_name = crm_settings.sender_name

        sender = f"{display_name} <{email_addr}>"

        try:
            frappe.sendmail(
                recipients=[self.email],
                sender=sender,
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
        except Exception:
            frappe.log_error(f"Failed to send new ticket email for {self.name}", "Support Ticket Email Error")


@frappe.whitelist()
def search_ledger_contacts(query=""):
    """Search support_ticket_ledger flattened across multiple contact persons."""
    query = (query or "").strip()
    like_q = f"%{query}%"

    sql = """
        SELECT
            COALESCE(s.serial_no, l.serial_no, l.name) AS serial_no,
            l.name AS unique_id,
            l.party_name,
            l.email,
            l.amc_status,
            l.amc_expiry_date,
            l.executive AS amc_executive,
            l.executive2 AS amc_executive2,
            c.contact_name,
            c.contact_phone,
            c.phone_number
        FROM
            `tabsupport_ticket_ledger` l
        LEFT JOIN
            `tabsupport_ticket_ledger_serials` s
            ON s.parent = l.name
        LEFT JOIN
            `tabsupport_ticket_ledger_contacts` c
            ON c.parent = l.name AND c.parentfield = 'contact_details'
        WHERE
            s.serial_no LIKE %s
            OR l.name LIKE %s
            OR l.serial_no LIKE %s
            OR l.party_name LIKE %s
            OR c.contact_name LIKE %s
            OR c.contact_phone LIKE %s
            OR c.phone_number LIKE %s
        ORDER BY
            l.name ASC, s.idx ASC, c.idx ASC
        LIMIT 50
    """
    return frappe.db.sql(sql, (like_q, like_q, like_q, like_q, like_q, like_q, like_q), as_dict=True)


@frappe.whitelist()
def create_ledger_entry(serial_no, party_name, contact_name, contact_phone, email=None, amc_status="NO", amc_expiry_date=None):
    """Create a new ledger entry with initial contact details and return it for ticket autofill."""
    if not is_genuine_tally_serial(serial_no):
        frappe.throw("Invalid Serial Number", title="Invalid Serial Number")

    existing_parent = frappe.db.get_value("support_ticket_ledger_serials", {"serial_no": serial_no}, "parent")
    if existing_parent or frappe.db.exists("support_ticket_ledger", serial_no):
        frappe.throw(f"Serial No {serial_no} already exists in the Ledger.")

    party_name = (party_name or "").strip()
    if not party_name:
        frappe.throw("Party Name is required.")

    contact_name = (contact_name or "").strip()
    contact_phone = normalize_phone(contact_phone)
    if not contact_name or not contact_phone:
        frappe.throw("Contact Name and Contact Phone are required.")

    # Only authorized supervisors and owners can register AMC as YES
    if amc_status == "YES":
        settings = get_support_user_settings()
        if not settings.get("can_alter_amc"):
            amc_status = "NO"
            amc_expiry_date = None

    ledger = frappe.get_doc({
        "doctype": "support_ticket_ledger",
        "party_name": party_name,
        "email": (email or "").strip(),
        "amc_status": amc_status or "NO",
        "amc_expiry_date": amc_expiry_date or None,
        "serial_numbers": [{"serial_no": serial_no}],
        "contact_details": [
            {
                "contact_name": contact_name,
                "contact_phone": contact_phone
            }
        ]
    })
    ledger.insert(ignore_permissions=True)

    return {
        "serial_no": serial_no,
        "unique_id": ledger.name,
        "party_name": ledger.party_name,
        "email": ledger.email,
        "amc_status": ledger.amc_status,
        "amc_expiry_date": str(ledger.amc_expiry_date or ""),
        "contact_name": contact_name,
        "contact_phone": contact_phone
    }


@frappe.whitelist()
def get_active_users(doctype, txt, searchfield, start, page_len, filters):
    start = frappe.utils.cint(start or 0)
    page_len = frappe.utils.cint(page_len or 20)
    return frappe.db.sql("""
        SELECT DISTINCT u.name
        FROM `tabUser` u
        JOIN `tabHas Role` hr ON hr.parent = u.name
        WHERE u.enabled = 1
          AND u.user_type = 'System User'
          AND hr.role = 'Support User'
          AND u.name NOT IN ('Administrator', 'Guest')
          AND (u.name LIKE %s OR u.full_name LIKE %s)
        ORDER BY u.full_name ASC
        LIMIT %s, %s
    """, (
        f"%{txt}%",
        f"%{txt}%",
        start,
        page_len
    ))


@frappe.whitelist()
def get_executive_workload():
    """Return active Support User role members with active tickets count, sorted by lowest workload first."""
    users = frappe.db.sql("""
        SELECT DISTINCT u.name, u.full_name
        FROM `tabUser` u
        JOIN `tabHas Role` hr ON hr.parent = u.name
        WHERE u.enabled = 1
          AND u.user_type = 'System User'
          AND hr.role = 'Support User'
          AND u.name NOT IN ('Administrator', 'Guest')
        ORDER BY u.full_name ASC
    """, as_dict=True)

    counts = frappe.db.sql("""
        SELECT executive2, status, COUNT(*) AS cnt
        FROM `tabsupport_ticket`
        WHERE status IN ('NEW', 'FOLLOWUP')
          AND IFNULL(executive2, '') != ''
          AND DATE(creation) = CURDATE()
        GROUP BY executive2, status
    """, as_dict=True)

    workload_map = {}
    for row in counts:
        u = row.executive2
        if u not in workload_map:
            workload_map[u] = {"NEW": 0, "FOLLOWUP": 0, "TOTAL": 0}
        s = str(row.status or "").upper()
        cnt = row.cnt or 0
        if s in workload_map[u]:
            workload_map[u][s] += cnt
        workload_map[u]["TOTAL"] += cnt

    result = []
    for user in users:
        u_id = user.name
        metrics = workload_map.get(u_id, {"NEW": 0, "FOLLOWUP": 0, "TOTAL": 0})
        result.append({
            "name": u_id,
            "full_name": user.full_name or u_id,
            "new_count": metrics["NEW"],
            "followup_count": metrics["FOLLOWUP"],
            "total_count": metrics["TOTAL"],
            "is_support": True
        })

    # Sort ascending: minimum total (NEW + FOLLOWUP) first, then minimum NEW, then minimum FOLLOWUP
    result.sort(key=lambda x: (x["total_count"], x["new_count"], x["followup_count"], x["full_name"].lower()))
    return result

@frappe.whitelist()
def get_call_history(serial_no=None, current_ticket=None, unique_id=None):
    serial_no = str(serial_no or "").strip()
    unique_id = str(unique_id or "").strip()
    current_ticket = str(current_ticket or "").strip()

    if not serial_no and not unique_id:
        return []

    conds = []
    vals = {}

    if unique_id and serial_no:
        conds.append("(unique_id = %(unique_id)s OR serial_no = %(serial_no)s)")
        vals["unique_id"] = unique_id
        vals["serial_no"] = serial_no
    elif unique_id:
        conds.append("unique_id = %(unique_id)s")
        vals["unique_id"] = unique_id
    else:
        conds.append("serial_no = %(serial_no)s")
        vals["serial_no"] = serial_no

    if current_ticket:
        conds.append("name != %(current_ticket)s")
        vals["current_ticket"] = current_ticket

    where_clause = " AND ".join(conds)

    return frappe.db.sql(f"""
        SELECT
            name,
            serial_no,
            call_source,
            call_type,
            executive,
            status,
            remarks,
            creation
        FROM `tabsupport_ticket`
        WHERE {where_clause}
        ORDER BY creation DESC
        LIMIT 100
    """, vals, as_dict=True)
    

def is_owner_or_admin(user=None):
    """Return True if user is Administrator/System, has System Manager role, or role_type == 'Owner' in Hbs User Hierarchy."""
    if not user:
        user = frappe.session.user if frappe.session else "Administrator"
    if user in ("Administrator", "System"):
        return True
    if "System Manager" in frappe.get_roles(user):
        return True
    try:
        role_type = frappe.db.get_value("Hbs User Hierarchy", {"user": user}, "role_type")
        return role_type == "Owner"
    except Exception:
        return False


@frappe.whitelist()
def get_support_user_settings():
    user = frappe.session.user
    if is_owner_or_admin(user):
        return {
            "is_admin": True,
            "is_owner": True,
            "is_supervisor": True,
            "only_new_tickets": False,
            "allowed_statuses": [],
            "can_alter_amc": True,
            "can_alter_ledger": True,
            "can_import_excel": True,
            "user": user
        }

    # Query enabled support_team_hierarchy records for user
    allowed_statuses = []
    is_supervisor = False
    can_alter_amc = False
    amc_supervisor_name = ""

    try:
        # Check supervisor row (Supervisors with can_alter_ledger can alter AMC)
        sup_record = frappe.db.sql("""
            SELECT s.can_alter_ledger
            FROM `tabsupport_team_supervisor` s
            JOIN `tabsupport_team_hierarchy` h ON h.name = s.parent
            WHERE h.enabled = 1 AND s.user = %s
            ORDER BY s.can_alter_ledger DESC
            LIMIT 1
        """, (user,), as_dict=True)

        if sup_record:
            is_supervisor = True
            can_alter_amc = bool(sup_record[0].can_alter_ledger)

        # Retrieve dynamic name of the configured AMC supervisor
        active_sup = frappe.db.sql("""
            SELECT COALESCE(NULLIF(TRIM(u.full_name), ''), s.user) as sup_name
            FROM `tabsupport_team_supervisor` s
            JOIN `tabsupport_team_hierarchy` h ON h.name = s.parent
            LEFT JOIN `tabUser` u ON u.name = s.user
            WHERE h.enabled = 1 AND s.can_alter_ledger = 1
            LIMIT 1
        """, as_dict=True)
        if active_sup:
            amc_supervisor_name = active_sup[0].sup_name

        # Check executive row
        exec_record = frappe.db.sql("""
            SELECT e.allowed_statuses
            FROM `tabsupport_team_executive` e
            JOIN `tabsupport_team_hierarchy` h ON h.name = e.parent
            WHERE h.enabled = 1 AND e.user = %s
            LIMIT 1
        """, (user,), as_dict=True)

        if exec_record:
            rec = exec_record[0]
            raw_st = (rec.allowed_statuses or "").strip()
            if raw_st:
                allowed_statuses = [s.strip().upper() for s in raw_st.replace(",", "\n").split("\n") if s.strip()]

    except Exception:
        allowed_statuses = []

    return {
        "is_admin": "System Manager" in frappe.get_roles(user),
        "is_owner": False,
        "is_supervisor": is_supervisor,
        "only_new_tickets": (allowed_statuses == ["NEW"]),
        "allowed_statuses": allowed_statuses,
        "can_alter_amc": can_alter_amc,
        "can_alter_ledger": True,
        "can_import_excel": False,
        "amc_supervisor_name": amc_supervisor_name,
        "user": user
    }


@frappe.whitelist()
def get_amc_pending_count():
    threshold = frappe.utils.add_to_date(frappe.utils.now_datetime(), minutes=-10)
    return frappe.db.count("support_ticket", filters={
        "amc_status": "YES",
        "status": "NEW",
        "creation": ["<=", threshold]
    })


@frappe.whitelist()
def get_new_tickets_only():
    settings = get_support_user_settings()
    return 1 if settings.get("only_new_tickets") else 0


@frappe.whitelist()
def get_pending_amc_alerts():
    user = frappe.session.user
    if not user or user == "Guest":
        return []

    settings = get_support_user_settings()
    is_sup_or_creator = bool(
        settings.get("is_supervisor")
        or settings.get("is_owner")
        or settings.get("is_admin")
        or settings.get("only_new_tickets")
    )

    threshold = frappe.utils.add_to_date(frappe.utils.now_datetime(), minutes=-20)

    if is_sup_or_creator:
        # Alert for unassigned AMC tickets or tickets assigned directly to them
        tickets = frappe.db.sql("""
            SELECT name, party_name, creation, executive2
            FROM `tabsupport_ticket`
            WHERE amc_status = 'YES'
              AND status = 'NEW'
              AND creation <= %s
              AND (executive2 IS NULL OR executive2 = '' OR executive2 = %s)
            ORDER BY creation ASC
        """, (threshold, user), as_dict=True)
    else:
        # Regular executive: alert for AMC tickets assigned to them
        tickets = frappe.db.sql("""
            SELECT name, party_name, creation, executive2
            FROM `tabsupport_ticket`
            WHERE amc_status = 'YES'
              AND status = 'NEW'
              AND creation <= %s
              AND executive2 = %s
            ORDER BY creation ASC
        """, (threshold, user), as_dict=True)

    now = frappe.utils.now_datetime()
    results = []
    for t in tickets:
        created = frappe.utils.get_datetime(t.creation)
        mins = int(max(0, (now - created).total_seconds() / 60))
        results.append({
            "name": t.name,
            "party_name": t.party_name or "Unknown Party",
            "pending_mins": mins,
            "executive2": t.executive2 or ""
        })

    return results


def get_permission_query_conditions(user):
    return ""

# GET TICKET FOLLOWUP HISTORY FOR VIEW DETAILS DIALOG

@frappe.whitelist()
def get_ticket_followup_history(ticket_name):
    ticket_name = str(ticket_name or "").strip()
    if not ticket_name:
        return {}

    if not frappe.db.exists("support_ticket", ticket_name):
        return {}

    doc = frappe.get_doc("support_ticket", ticket_name)

    return {
        "name": doc.name,
        "party_name": doc.party_name or "",
        "contact_name": doc.contact_name or "",
        "contact_phone": doc.contact_phone or "",
        "executive": doc.executive or "",
        "call_source": doc.call_source or "",
        "call_type": doc.call_type or "",
        "remarks": doc.remarks or "",
        "status": doc.status or "",
        "creation": str(doc.creation or ""),
        "followup_history": [
            {
                "followup_date": str(row.followup_date or ""),
                "followup_time": str(row.followup_time or ""),
                "call_type": row.call_type or "",
                "remarks": row.remarks or "",
                "updated_by": row.updated_by or "",
                "updated_on": str(row.updated_on or ""),
                "status": row.status or "",
                "sub_status": row.sub_status or "",
                "sub_sub_status": row.sub_sub_status or ""
            }
            for row in doc.followup_history
        ]
    }




def has_app_permission():
    """Check if current user has permission to access Support Ticket App Switcher card."""
    return True


@frappe.whitelist()
def get_tally_renewal_details(serial_no):
    if not serial_no:
        return None

    serial = str(serial_no).strip()
    if not serial:
        return None

    try:
        record = frappe.db.sql("""
            SELECT 
                cc_acc_name, portal_acc_name,
                license, license_type,
                tally_version, product_ver, `release`,
                acc_expiry_date, portal_expiry_date,
                partner_name, portal_partner_name,
                tss_status,
                cc_mobile, portal_mobile,
                cc_email, portal_email,
                account_id,
                cc_contact, portal_contact
            FROM `tabHbs Tally Renewal`
            WHERE tss_tally_serial = %s OR tally_serial = %s
            ORDER BY modified DESC
            LIMIT 1
        """, (serial, serial), as_dict=True)

        if not record:
            return None

        row = record[0]
        expiry = row.acc_expiry_date or row.portal_expiry_date
        return {
            "party_name": row.portal_acc_name or row.cc_acc_name or "",
            "contact_name": row.portal_contact or row.cc_contact or "",
            "license_type": row.license or row.license_type or "",
            "tally_version": row.tally_version or row.get("release") or row.product_ver or "",
            "tss_expiry_date": str(expiry) if expiry else None,
            "partner_name": row.portal_partner_name or row.partner_name or "",
            "tss_status": row.tss_status or "",
            "mobile": row.portal_mobile or row.cc_mobile or "",
            "email": row.account_id or row.portal_email or row.cc_email or ""
        }
    except Exception:
        frappe.log_error("Failed to fetch tally renewal details", "Support Ticket")
        return None
