// ============================================================
// WITA Guildhall — quest-import.js
// WITAQuestImport: GM dialog for importing from FQL or Campaign Codex
// ============================================================

import { getQuests } from "../core/quest-data.js";
import { sanitizeHTML, witaCascadePosition } from "../../../core/utils.js";

export class WITAQuestImport extends foundry.applications.api.ApplicationV2 {

    constructor(source, boardInstance, options = {}) {
        super(options);
        this._source = source; // "fql" | "cc"
        this._board  = boardInstance;
    }

    static DEFAULT_OPTIONS = {
        id:       "wita-quest-import",
        window:   { resizable: false, title: "Import Quests" },
        position: { width: 460, height: "auto" },
        classes:  ["wita-guildhall-import"],
    };

    get title() { return `Import from ${this._source === "fql" ? "Forien's Quest Log" : "Campaign Codex"}`; }

    static open(source, board) {
        const existing = foundry.applications.instances.get("wita-quest-import");
        if (existing?.rendered) { existing.close(); }
        const pos = witaCascadePosition("wita-guildhall-board");
        const dlg = new WITAQuestImport(source, board);
        dlg.render({ force: true }).then(() => { if (pos.top !== undefined) dlg.setPosition(pos); });
    }

    async _renderHTML(context, options) {
        const el = document.createElement("div");
        el.className = "wita-qi-body";

        let candidates = [];
        if (this._source === "fql") {
            const { getFQLImportCandidates } = await import("../importers/fql-importer.js");
            candidates = getFQLImportCandidates();
        } else {
            const { getCCImportCandidates } = await import("../importers/cc-importer.js");
            candidates = getCCImportCandidates();
        }

        const existingSourceIds = new Set(
            getQuests().filter(q => q.sourceType === this._source).map(q => q.sourceId)
        );

        if (candidates.length === 0) {
            el.innerHTML = `<div class="wita-qi-empty">No importable quests found.</div>`;
            return el;
        }

        el.innerHTML = `
            <p class="wita-qi-hint">Select quests to import. Already imported quests are greyed out.</p>
            <div class="wita-qi-list">
                ${candidates.map(c => {
                    const imported = existingSourceIds.has(c.uuid ?? c.sourceId);
                    return `
                        <label class="wita-qi-row${imported ? " imported" : ""}">
                            <input type="checkbox" value="${sanitizeHTML(c.uuid ?? c.sourceId)}"
                                data-name="${sanitizeHTML(c.name)}"
                                ${imported ? "disabled" : ""}>
                            <span class="wita-qi-name">${sanitizeHTML(c.name)}</span>
                            <span class="wita-qi-status">${c.status ?? c.boardColumn ?? ""}</span>
                        </label>
                    `;
                }).join("")}
            </div>
            <div class="wita-qi-footer">
                <button class="wita-gb-btn primary" id="wita-qi-import">
                    <i class="fas fa-file-import"></i> Import Selected
                </button>
                <button class="wita-gb-btn" id="wita-qi-cancel">Cancel</button>
            </div>
        `;
        return el;
    }

    _replaceHTML(result, content, options) {
        const wc = this.element?.querySelector(".window-content");
        if (!wc) return;
        wc.style.cssText = "padding:0;overflow:visible;";
        wc.replaceChildren(result);
        this._attachListeners(wc, result);
    }

    async _onRender() {}

    _attachListeners(el, inner) {
        el.querySelector("#wita-qi-cancel")?.addEventListener("click", () => this.close());

        el.querySelector("#wita-qi-import")?.addEventListener("click", async () => {
            const checked = [...el.querySelectorAll(".wita-qi-row input:checked")];
            if (!checked.length) { ui.notifications.warn("No quests selected."); return; }

            let imported = 0;
            if (this._source === "fql") {
                const { getFQLImportCandidates, fqlToQuestPayload } = await import("../importers/fql-importer.js");
                const { createQuest } = await import("../core/quest-data.js");
                const candidates = getFQLImportCandidates();
                for (const cb of checked) {
                    const cand = candidates.find(c => (c.uuid ?? c.sourceId) === cb.value);
                    if (!cand) continue;
                    await createQuest(fqlToQuestPayload(cand));
                    imported++;
                }
            } else {
                const { getCCImportCandidates, ccToQuestPayload } = await import("../importers/cc-importer.js");
                const { createQuest } = await import("../core/quest-data.js");
                const candidates = getCCImportCandidates();
                for (const cb of checked) {
                    const cand = candidates.find(c => (c.uuid ?? c.sourceId) === cb.value);
                    if (!cand) continue;
                    await createQuest(ccToQuestPayload(cand));
                    imported++;
                }
            }

            ui.notifications.info(`WITA | Imported ${imported} quest${imported !== 1 ? "s" : ""}.`);
            this.close();
            await this._board?.render({ force: true });
        });
    }
}
