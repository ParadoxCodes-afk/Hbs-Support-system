frappe.listview_settings['support_ticket'] = {

    add_fields: [
        'unique_id',
        'followup_date',
        'amc_status',
        'amc_expiry_date',
        'amc_executive',
        'amc_executive2',
        'list_sort_order',
        'creation',
        'status',
        'total_time_taken',
        'pending_time_start'
    ],

    formatters: {
        pending_time(value, df, doc) {
            if (doc.status === 'COMPLETED') {
                const total = doc.total_time_taken || value || '';
                return `<span style="color: #16a34a; font-weight: 600;">✓ ${total || 'Completed'}</span>`;
            }
            if (!doc.creation) return '';

            const created = frappe.datetime.str_to_obj(doc.creation);
            const minutes = Math.max(
                0,
                Math.floor((Date.now() - created.getTime()) / 60000)
            );

            const days = Math.floor(minutes / 1440);
            const hours = Math.floor((minutes % 1440) / 60);
            const mins = minutes % 60;

            let text = '';
            if (days) text = `${days}d ${hours}h`;
            else if (hours) text = `${hours}h ${mins}m`;
            else text = `${mins}m`;

            const color = minutes >= 120 ? '#dc2626' : (minutes >= 60 ? '#d97706' : '#2563eb');
            return `<span class="pending-time-pill" style="color: ${color}; font-weight: 600;">⏱ ${text}</span>`;
        }
    },
    
    order_by: 'list_sort_order asc, creation desc',

    // ==========================================
    // APPLY NORMAL FILTERS
    // ==========================================

    apply_default_filters(listview) {
        listview.filter_area.clear();

        const user_settings = this.user_settings || {};
        const allowed_statuses = user_settings.allowed_statuses || [];
        const is_supervisor_or_owner = Boolean(
            user_settings.is_supervisor ||
            user_settings.is_owner ||
            user_settings.is_admin ||
            frappe.session.user === 'Administrator'
        );

        if (allowed_statuses.length > 0) {
            // Ticket Creator (Chandni): Show all NEW tickets across ALL executives
            listview.filter_area.add([
                ['support_ticket', 'status', 'in', allowed_statuses]
            ]);
        } else if (is_supervisor_or_owner) {
            // Supervisor (Komal) & Owners: Show ALL active tickets across entire team
            listview.filter_area.add([
                ['support_ticket', 'status', '!=', 'COMPLETED']
            ]);
        } else {
            // Regular Executive (Puneet): Default to their own assigned active tickets
            // (Executive can clear the executive2 filter anytime in UI to view all tickets)
            listview.filter_area.add([
                ['support_ticket', 'status', '!=', 'COMPLETED'],
                ['support_ticket', 'executive2', '=', frappe.session.user]
            ]);
        }
    },

    // ==========================================
    // ONLOAD
    // ==========================================

    onload(listview) {
        // Enforce AMC + Status sort order (AMC NEW -> AMC FOLLOWUP -> AMC PENDING -> NON-AMC NEW -> NON-AMC FOLLOWUP -> NON-AMC PENDING)
        if (listview.sort_selector) {
            listview.sort_selector.set_value('list_sort_order', 'asc');
        }
        const original_get_args = listview.get_args.bind(listview);
        listview.get_args = function() {
            const args = original_get_args();
            args.order_by = 'list_sort_order asc, creation desc';

            if (listview._followup_filter_date) {
                if (!args.or_filters) {
                    args.or_filters = [];
                }
                args.or_filters.push(['support_ticket', 'status', '!=', 'FOLLOWUP']);
                args.or_filters.push(['support_ticket', 'followup_date', '<=', listview._followup_filter_date]);
            }
            return args;
        };

        // Followup date filter
        setup_followup_date_filter(listview);

        // Pending time filter dropdown and custom hours input
        setup_pending_time_filter(listview);

        // AMC Pending > 10 Mins button
        setup_amc_pending_button(listview);

        // Apply normal filters initially
        frappe.call({
            method: 'hbs_ticket_system.hbs_support_system.doctype.support_ticket.support_ticket.get_support_user_settings',
            callback: (r) => {
                const settings = r.message || {};
                this.user_settings = settings;
                this.new_tickets_only = Boolean(settings.only_new_tickets);

                this.apply_default_filters(listview);
                listview.refresh();
            }
        });
    },

    // ==========================================
    // REFRESH
    // ==========================================

    refresh(listview) {
        setup_followup_date_filter(listview);
        setup_pending_time_filter(listview);
        setup_amc_pending_button(listview);

        setTimeout(() => {
            listview.$result
                .find('.list-row')
                .each(function() {
                    let row = $(this);
                    let name = row.find('.list-row-checkbox').data('name');

                    if (!name) {
                        return;
                    }

                    let doc = listview.data.find(d => d.name === name);

                    // AMC Active = GREEN (#16a34a), AMC Expired = RED (#dc2626)
                    if (doc && doc.amc_status === 'YES') {
                        const is_expired = Boolean(
                            doc.amc_expiry_date &&
                            frappe.datetime.get_diff(doc.amc_expiry_date, frappe.datetime.nowdate()) < 0
                        );
                        const rowColor = is_expired ? '#dc2626' : '#16a34a';

                        row.find('.level-left, .level-right, a, span:not(.pending-time-pill)').each(function() {
                            this.style.setProperty(
                                'color',
                                rowColor,
                                'important'
                            );
                        });
                    }
                });

            // Update pending count badge on the toolbar button
            update_amc_pending_badge(listview);
        }, 300);
    }

};


// ==========================================================
// AMC PENDING > 10 MINS TOOLBAR BUTTON & BADGE
// ==========================================================
function setup_amc_pending_button(listview) {
    const $page = listview.page;
    if (!$page || !$page.inner_toolbar) return;

    let $btn = $page.inner_toolbar.find('.btn-amc-pending-10m');
    if (!$btn.length) {
        $btn = $(`
            <button class="btn btn-default btn-xs btn-amc-pending-10m" style="margin-left: 8px; font-weight: 600; color: #dc2626; border-color: #fca5a5; background: #fff1f2; display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 4px; cursor: pointer;" title="${__('Filter active AMC tickets pending > 10 minutes')}">
                <span>⏱️ AMC Pending > 10m</span>
                <span class="badge amc-pending-count-badge" style="background: #dc2626; color: #fff; font-size: 11px; padding: 2px 6px; border-radius: 10px; display: none;">0</span>
            </button>
        `);
        $page.inner_toolbar.append($btn);

        $btn.on('click', function() {
            const cutoff = moment().subtract(10, 'minutes').format(frappe.defaultDatetimeFormat || 'YYYY-MM-DD HH:mm:ss');

            // Reset pending time selector UI if present
            const $wrapper = $page.inner_toolbar.find('.pending-time-filter-wrapper');
            if ($wrapper.length) {
                $wrapper.find('.pending-time-select').val('');
                $wrapper.find('.pending-time-custom-input').hide().val('');
                $wrapper.find('.pending-filter-count').hide();
            }

            listview.filter_area.clear().then(() => {
                return listview.filter_area.add([
                    ['support_ticket', 'amc_status', '=', 'YES'],
                    ['support_ticket', 'status', '=', 'NEW'],
                    ['support_ticket', 'creation', '<=', cutoff]
                ]);
            });
        });
    }

    update_amc_pending_badge(listview);
}

function update_amc_pending_badge(listview) {
    const $page = listview.page;
    if (!$page || !$page.inner_toolbar) return;
    const $badge = $page.inner_toolbar.find('.amc-pending-count-badge');
    const $btn = $page.inner_toolbar.find('.btn-amc-pending-10m');
    if (!$badge.length) return;

    frappe.call({
        method: 'hbs_ticket_system.hbs_support_system.doctype.support_ticket.support_ticket.get_amc_pending_count',
        callback: function(r) {
            const count = r.message || 0;
            if (count > 0) {
                $badge.text(count).show();
                $btn.css({ 'background': '#fee2e2', 'border-color': '#ef4444' });
            } else {
                $badge.text(0).hide();
                $btn.css({ 'background': '#fff1f2', 'border-color': '#fca5a5' });
            }
        }
    });
}


// ==========================================================
// PENDING TIME FILTER TOOLBAR SELECTOR & CUSTOM INPUT
// ==========================================================
function setup_pending_time_filter(listview) {
    const $page = listview.page;
    if (!$page || !$page.inner_toolbar) return;

    if ($page.inner_toolbar.find('.pending-time-filter-wrapper').length) return;

    const $wrapper = $(`
        <div class="pending-time-filter-wrapper" style="display: inline-flex; align-items: center; margin-left: 8px; gap: 6px;">
            <label style="margin: 0; font-size: 12px; font-weight: 600; color: #475569;">Pending:</label>
            <select class="form-control input-sm pending-time-select" style="width: 145px; height: 28px; font-size: 12px; padding: 2px 6px; cursor: pointer;">
                <option value="">All Pending</option>
                <option value="0.5">> 30 Mins</option>
                <option value="1">> 1 Hour</option>
                <option value="2">> 2 Hours</option>
                <option value="4">> 4 Hours</option>
                <option value="custom">Custom Hours...</option>
            </select>
            <input type="number" step="0.5" min="0" placeholder="Hrs" class="form-control input-sm pending-time-custom-input" style="width: 65px; height: 28px; font-size: 12px; padding: 2px 6px; display: none;" />
            <span class="pending-filter-count badge" style="display: none; background: #fef3c7; color: #92400e; font-size: 11px; padding: 4px 8px; border: 1px solid #fde68a; border-radius: 10px;"></span>
        </div>
    `);

    $page.inner_toolbar.append($wrapper);

    const $select = $wrapper.find('.pending-time-select');
    const $customInput = $wrapper.find('.pending-time-custom-input');
    const $badge = $wrapper.find('.pending-filter-count');

    function apply_filter(hours) {
        if (!hours || isNaN(hours) || hours <= 0) {
            $badge.hide();
            frappe.listview_settings['support_ticket'].apply_default_filters(listview);
            listview.refresh();
            return;
        }

        const formatted_dt = moment().subtract(hours, 'hours').format(frappe.defaultDatetimeFormat || 'YYYY-MM-DD HH:mm:ss');

        const filters = [
            ['support_ticket', 'status', '!=', 'COMPLETED'],
            ['support_ticket', 'creation', '<=', formatted_dt]
        ];

        const user_settings = frappe.listview_settings['support_ticket'].user_settings || {};
        const allowed_statuses = user_settings.allowed_statuses || [];
        const is_supervisor_or_owner = Boolean(
            user_settings.is_supervisor ||
            user_settings.is_owner ||
            user_settings.is_admin ||
            frappe.session.user === 'Administrator'
        );

        if (allowed_statuses.length > 0) {
            filters[0] = ['support_ticket', 'status', 'in', allowed_statuses];
        } else if (!is_supervisor_or_owner && frappe.session.user && frappe.session.user !== 'Guest') {
            filters.push(['support_ticket', 'executive2', '=', frappe.session.user]);
        }

        listview.filter_area.clear().then(() => {
            return listview.filter_area.add(filters);
        }).then(() => {
            const count = listview.data ? listview.data.length : 0;
            const labelStr = (hours >= 1) ? `${hours} hr` : `${Math.round(hours * 60)} min`;
            $badge.text(`${count} pending > ${labelStr}`).show();
        });
    }


    $select.on('change', function () {
        const val = $(this).val();
        if (val === 'custom') {
            $customInput.show().focus();
            const customVal = parseFloat($customInput.val());
            if (customVal > 0) {
                apply_filter(customVal);
            }
        } else {
            $customInput.hide();
            const hrs = parseFloat(val);
            apply_filter(hrs);
        }
    });

    $customInput.on('input change', function () {
        const hrs = parseFloat($(this).val());
        if (hrs > 0) {
            apply_filter(hrs);
        } else if ($(this).val() === '') {
            apply_filter(0);
        }
    });
}


// ==========================================================
// FOLLOW-UP DATE FILTER TOOLBAR INPUT
// ==========================================================
function setup_followup_date_filter(listview) {
    const $page = listview.page;
    if (!$page || !$page.inner_toolbar) return;

    if ($page.inner_toolbar.find('.followup-date-filter-wrapper').length) return;

    const today = frappe.datetime.nowdate();
    if (listview._followup_filter_date === undefined) {
        listview._followup_filter_date = today;
    }

    const currentVal = listview._followup_filter_date || '';

    const $wrapper = $(`
        <div class="followup-date-filter-wrapper" style="display: inline-flex; align-items: center; margin-left: 8px; gap: 6px;">
            <label style="margin: 0; font-size: 12px; font-weight: 600; color: #475569;">Followup Date:</label>
            <input type="date" value="${currentVal}" class="form-control input-sm followup-date-input" style="width: 135px; height: 28px; font-size: 12px; padding: 2px 6px; cursor: pointer;" />
            <button class="btn btn-default btn-xs btn-clear-followup-date" title="Clear/Reset Followup Date filter" style="height: 28px; padding: 2px 8px; font-size: 11px;">${currentVal ? 'All' : 'Today'}</button>
        </div>
    `);

    $page.inner_toolbar.append($wrapper);

    const $dateInput = $wrapper.find('.followup-date-input');
    const $toggleBtn = $wrapper.find('.btn-clear-followup-date');

    $dateInput.on('change', function () {
        const val = $(this).val();
        listview._followup_filter_date = val || null;
        delete listview.last_args;
        $toggleBtn.text(val ? 'All' : 'Today');
        listview.refresh();
    });

    $toggleBtn.on('click', function () {
        if (listview._followup_filter_date) {
            listview._followup_filter_date = null;
            $dateInput.val('');
            $toggleBtn.text('Today');
        } else {
            listview._followup_filter_date = today;
            $dateInput.val(today);
            $toggleBtn.text('All');
        }
        delete listview.last_args;
        listview.refresh();
    });
}



(function () {
    const REFRESH_INTERVAL = 1 * 60 * 1000; // 1 minute

    if (window.support_ticket_list_timer) {
        clearInterval(window.support_ticket_list_timer);
    }

    window.support_ticket_list_timer = setInterval(() => {
        if (
            frappe.get_route()[0] === "List" &&
            frappe.get_route()[1] === "support_ticket"
        ) {
            const list_view = cur_list;
            if (list_view) {
                list_view.refresh();
            }
        }
    }, REFRESH_INTERVAL);
})();