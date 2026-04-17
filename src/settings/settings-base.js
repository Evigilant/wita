// ============================================================
// WITA — SETTINGS BASE
// Shared base class for all WITA config sub-windows.
// Provides field-descriptor-driven form rendering and
// save/cancel handling.
//
// Field descriptor shape:
//   { type: "section", label }
//   { type: "info", html }
//   { key, label, type: "String"|"Number", hint?,
//     min?, max?, step?, password? }
// ============================================================

// TODO(v14): migrate to ApplicationV2
export class WITAConfigBase extends FormApplication {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["sheet", "wita-config-window"],
            width: 480,
            height: "auto",
            closeOnSubmit: true,
            submitOnChange: false,
            resizable: false,
        });
    }

    get fields() { return []; }

    async getData() {
        const data = { fields: this.fields, values: {} };
        for (const f of this.fields) {
            if (f.type === "section" || f.type === "info") continue;
            data.values[f.key] = game.settings.get("wita", f.key);
        }
        return data;
    }

    async _renderInner(data) {
        const rows = data.fields
            .map(f => _witaFieldHTML(f, data.values[f.key]))
            .join("");

        const html = $(`
            <form autocomplete="off" class="wita-config-form">
                <div class="wita-fields">${rows}</div>
                <footer class="sheet-footer flexrow" style="margin-top:0.75rem;gap:0.5rem">
                    <button type="submit">
                        <i class="fas fa-save"></i> Save
                    </button>
                    <button type="button" class="wita-cancel">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                </footer>
            </form>
            <style>
                .wita-config-form { padding: 0.75rem; }
                .wita-fields .form-group { margin-bottom: 0.55rem; }
                .wita-fields .form-group label { font-size: 13px; font-weight: 500; }
                .wita-fields .notes {
                    font-size: 11px;
                    color: var(--color-text-light-6);
                    margin: 2px 0 0;
                    line-height: 1.4;
                }
                .wita-section-header {
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    color: var(--color-text-light-6);
                    border-bottom: 1px solid var(--color-border-light-2);
                    padding-bottom: 3px;
                    margin: 0.85rem 0 0.4rem;
                }
                .wita-section-header:first-child { margin-top: 0; }
            </style>
        `);

        // TODO(v14): activateListeners receives HTMLElement in v14, not jQuery
        html.find(".wita-cancel").on("click", () => this.close());
        return html;
    }

    async _updateObject(event, formData) {
        for (const f of this.fields) {
            if (f.type === "section" || f.type === "info") continue;
            if (!(f.key in formData)) continue;
            let val = formData[f.key];
            if (f.type === "Number") val = Number(val);
            await game.settings.set("wita", f.key, val);
        }
        ui.notifications.info("WITA | Settings saved.");
    }
}

export function _witaFieldHTML(f, value) {
    if (f.type === "section") {
        return `<div class="wita-section-header">${f.label}</div>`;
    }
    if (f.type === "info") {
        return f.html ?? "";
    }

    let input;
    if (f.type === "Number") {
        const min  = f.min  !== undefined ? `min="${f.min}"`   : "";
        const max  = f.max  !== undefined ? `max="${f.max}"`   : "";
        const step = f.step !== undefined ? `step="${f.step}"` : `step="1"`;
        input = `<input type="number" name="${f.key}" value="${value ?? 0}" ${min} ${max} ${step} style="width:80px">`;
    } else if (f.password) {
        input = `<input type="password" name="${f.key}" value="${value ?? ""}" style="width:100%">`;
    } else {
        input = `<input type="text" name="${f.key}" value="${value ?? ""}" style="width:100%">`;
    }

    const hint = f.hint ? `<p class="notes">${f.hint}</p>` : "";
    return `<div class="form-group">
        <label>${f.label}</label>
        <div class="form-fields">${input}</div>
        ${hint}
    </div>`;
}
