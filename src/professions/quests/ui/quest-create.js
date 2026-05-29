// ============================================================
// WITA Guildhall — quest-create.js
// WITAQuestCreate: GM dialog for creating a new quest
// ============================================================

import { DANGER_LEVELS, REWARD_LEVELS } from "../core/config.js";
import { witaCascadePosition } from "../../../core/utils.js";

export class WITAQuestCreate extends foundry.applications.api.ApplicationV2 {

    constructor(boardInstance, options = {}) {
        super(options);
        this._board = boardInstance;
    }

    static DEFAULT_OPTIONS = {
        id:       "wita-quest-create",
        window:   { resizable: false, title: "New Quest" },
        position: { width: 400, height: "auto" },
        classes:  ["wita-guildhall-create"],
    };

    static open(board) {
        const existing = foundry.applications.instances.get("wita-quest-create");
        if (existing?.rendered) { existing.bringToFront(); return; }
        const pos = witaCascadePosition("wita-guildhall-board");
        const dlg = new WITAQuestCreate(board);
        dlg.render({ force: true }).then(() => { if (pos.top !== undefined) dlg.setPosition(pos); });
    }

    async _renderHTML(context, options) {
        const el = document.createElement("div");
        el.className = "wita-qc-body";
        el.innerHTML = `
            <div class="wita-qc-field">
                <label>Name</label>
                <input type="text" id="wita-qc-name" placeholder="Quest name">
            </div>
            <div class="wita-qc-field">
                <label>Description</label>
                <textarea id="wita-qc-desc" rows="4" placeholder="Quest description..."></textarea>
            </div>
            <div class="wita-qc-row">
                <div class="wita-qc-field">
                    <label>Danger Level</label>
                    <select id="wita-qc-danger">
                        ${[1,2,3,4,5].map(n => `<option value="${n}" ${n===2?"selected":""}>${DANGER_LEVELS[n].label}</option>`).join("")}
                    </select>
                </div>
                <div class="wita-qc-field">
                    <label>Reward Level</label>
                    <select id="wita-qc-reward">
                        ${[1,2,3,4,5].map(n => `<option value="${n}" ${n===2?"selected":""}>${REWARD_LEVELS[n].label}</option>`).join("")}
                    </select>
                </div>
            </div>
            <div class="wita-qc-field">
                <label>Gold Reward (GP)</label>
                <input type="number" id="wita-qc-gold" value="0" min="0">
            </div>
            <div class="wita-qc-footer">
                <button class="wita-gb-btn primary" id="wita-qc-save">
                    <i class="fas fa-save"></i> Create Quest
                </button>
                <button class="wita-gb-btn" id="wita-qc-cancel">Cancel</button>
            </div>
        `;
        return el;
    }

    _replaceHTML(result, content, options) {
        const wc = this.element?.querySelector(".window-content");
        if (!wc) return;
        wc.style.cssText = "padding:0;overflow:visible;";
        wc.replaceChildren(result);
        this._attachListeners(wc);
    }

    async _onRender() {}

    _attachListeners(el) {
        el.querySelector("#wita-qc-save")?.addEventListener("click", async () => {
            const name = el.querySelector("#wita-qc-name")?.value.trim();
            if (!name) { ui.notifications.warn("WITA | Quest name is required."); return; }
            const { createQuest } = await import("../core/quest-data.js");
            await createQuest({
                name,
                description:  el.querySelector("#wita-qc-desc")?.value.trim(),
                dangerLevel:  parseInt(el.querySelector("#wita-qc-danger")?.value),
                rewardLevel:  parseInt(el.querySelector("#wita-qc-reward")?.value),
                rewardGold:   parseInt(el.querySelector("#wita-qc-gold")?.value) || 0,
            });
            this.close();
            await this._board?.render({ force: true });
        });

        el.querySelector("#wita-qc-cancel")?.addEventListener("click", () => this.close());
    }
}
