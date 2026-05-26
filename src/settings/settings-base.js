// ============================================================
// WITA — SETTINGS BASE
// ApplicationV2-based config sub-window base class.
// No automatic reload — saves settings directly without
// triggering FormApplication's SettingsConfig.reloadConfirm.
//
// Field descriptor shape:
//   { type: "section", label }
//   { type: "info", html }
//   { key, label, type: "String"|"Number", hint?,
//     min?, max?, step?, password? }
// ============================================================

export class WITAConfigBase extends foundry.applications.api.ApplicationV2 {

    static DEFAULT_OPTIONS = {
        classes:  ["sheet", "wita-config-window"],
        window:   { resizable: false },
        position: { width: 480, height: "auto" },
    };

    get fields() { return []; }

    async _renderHTML(context, options) {
        const values = {};
        for (const f of this.fields) {
            if (f.type === "section" || f.type === "info") continue;
            values[f.key] = game.settings.get("wita", f.key);
        }

        const rows = this.fields.map(f => _witaFieldHTML(f, values[f.key])).join("");

        const el = document.createElement("div");
        el.className = "wita-config-body";
        el.innerHTML = `
            <form autocomplete="off" class="wita-config-form">
                <div class="wita-fields">${rows}</div>
                <footer class="sheet-footer flexrow" style="margin-top:0.75rem;gap:0.5rem">
                    <button type="button" class="wita-save-btn">
                        <i class="fas fa-save"></i> Save
                    </button>
                    <button type="button" class="wita-cancel-btn">
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
        `;
        return el;
    }

    _replaceHTML(result, content, options) {
        const wc = this.element?.querySelector(".window-content");
        if (!wc) return;
        wc.replaceChildren(result);
        this._attachListeners(wc);
    }

    async _onRender() {}

    _attachListeners(el) {
        el.querySelector(".wita-cancel-btn")?.addEventListener("click", () => this.close());
        el.querySelector(".wita-save-btn")?.addEventListener("click", () => this._save(el));
    }

    async _save(el) {
        const form = el.querySelector("form");
        if (!form) return;

        for (const f of this.fields) {
            if (f.type === "section" || f.type === "info") continue;
            const input = form.querySelector(`[name="${f.key}"]`);
            if (!input) continue;
            let val = input.type === "checkbox" ? input.checked : input.value;
            if (f.type === "Number") val = Number(val);
            await game.settings.set("wita", f.key, val);
        }

        ui.notifications.info("WITA | Settings saved.");
        this.close();
    }
}

export function _witaFieldHTML(f, value) {
    if (f.type === "section") {
        return `<div class="wita-section-header">${f.label}</div>`;
    }
    if (f.type === "info") {
        return f.html ?? "";
    }

    // Escape value for safe use inside an HTML attribute
    const escAttr = (v) => String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    let input;
    if (f.type === "Number") {
        const min  = f.min  !== undefined ? `min="${f.min}"`   : "";
        const max  = f.max  !== undefined ? `max="${f.max}"`   : "";
        const step = f.step !== undefined ? `step="${f.step}"` : `step="1"`;
        input = `<input type="number" name="${f.key}" value="${escAttr(value ?? 0)}" ${min} ${max} ${step} style="width:80px">`;
    } else if (f.password) {
        input = `<input type="password" name="${f.key}" value="${escAttr(value ?? "")}" style="width:100%">`;
    } else {
        input = `<input type="text" name="${f.key}" value="${escAttr(value ?? "")}" style="width:100%">`;
    }

    const hint = f.hint ? `<p class="notes">${f.hint}</p>` : "";
    return `<div class="form-group">
        <label>${f.label}</label>
        <div class="form-fields">${input}</div>
        ${hint}
    </div>`;
}
