// Copyright (c) 2026, Hbs and contributors
// For license information, please see license.txt

frappe.ui.form.on("support_team_hierarchy", {
    refresh(frm) {
    }
});

frappe.ui.form.on("support_team_executive", {
    form_render(frm, cdt, cdn) {
        setup_status_multiselect(frm, cdt, cdn);
    }
});

function setup_status_multiselect(frm, cdt, cdn) {
    let row = locals[cdt][cdn];
    let grid_row = frm.fields_dict.executives.grid.get_row(cdn);
    if (!grid_row) return;

    let field = grid_row.toggle_view && grid_row.open_form ? grid_row.open_form.fields_dict.allowed_statuses : null;
    if (field && field.$input) {
        field.$input.attr("placeholder", "e.g. NEW, FOLLOWUP, PENDING");
    }
}
