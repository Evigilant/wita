// ============================================================
// WITA Encounters — encounters.js
// Random encounter roller + CC quest journal creation
// + automatic WITA guildhall quest import
// ============================================================

import { sanitizeHTML } from "../core/utils.js";
import { createQuest }  from "../guildhall/core/quest-data.js";
import { CC_URGENCY_TO_DANGER } from "../guildhall/core/config.js";

const ENCOUNTER_JOURNAL_ID = "OO7exflPfqtdrqYW";
const ENCOUNTER_PAGE_NAME  = "Quest Ideas";

// ── Parse quest list from journal ─────────────────────────────

export async function loadEncounterQuests() {
    const journal = game.journal.get(ENCOUNTER_JOURNAL_ID);
    if (!journal) {
        ui.notifications.error("WITA | Random encounter journal not found.");
        return [];
    }
    const page = journal.pages.find(p => p.name === ENCOUNTER_PAGE_NAME);
    if (!page) {
        ui.notifications.error(`WITA | Page "${ENCOUNTER_PAGE_NAME}" not found in encounter journal.`);
        return [];
    }

    // Parse <li> entries from the HTML content
    const div = document.createElement("div");
    div.innerHTML = page.text?.content ?? "";
    const items = [...div.querySelectorAll("li")].map(li => li.textContent.trim()).filter(Boolean);
    return items;
}

// ── Roll encounters ───────────────────────────────────────────

export async function rollRandomEncounters() {
    if (!game.user.isGM) { ui.notifications.warn("GM only."); return; }

    const quests = await loadEncounterQuests();
    if (!quests.length) return;

    // Roll 1d4 for number of encounters
    const countRoll = await new Roll("1d4").evaluate();
    const count     = countRoll.total;

    await countRoll.toMessage({
        speaker: { alias: "Random Encounters" },
        flavor:  `Rolling for today's random encounters — ${count} encounter${count > 1 ? "s" : ""}`,
        whisper: ChatMessage.getWhisperRecipients("GM"),
    });

    // Roll one encounter per count
    for (let i = 0; i < count; i++) {
        const roll = await new Roll(`1d${quests.length}`).evaluate();
        const idx  = roll.total - 1;
        const text = quests[idx];

        await _postEncounterMessage(roll.total, text, quests.length);
    }
}

// ── Post encounter chat message ───────────────────────────────

async function _postEncounterMessage(rollResult, questText, total) {
    // Encode quest text for use in button data attribute
    const encoded = encodeURIComponent(questText);

    const content = `
        <div class="wita-encounter-msg" style="font-family:var(--font-primary,Signika);padding:0.4rem">
            <div style="font-size:0.65rem;color:var(--color-form-hint);margin-bottom:0.25rem">
                <i class="fas fa-dice"></i> Roll ${rollResult} / ${total}
            </div>
            <p style="margin:0 0 0.5rem;font-size:0.82rem;line-height:1.5">${sanitizeHTML(questText)}</p>
            <button class="wita-btn wita-encounter-convert-btn"
                    data-quest-text="${sanitizeHTML(encodeURIComponent(questText))}"
                    style="font-size:0.7rem;padding:0.2rem 0.6rem;border:1px solid var(--color-highlights);
                           color:var(--color-highlights);background:transparent;border-radius:3px;cursor:pointer">
                <i class="fas fa-plus"></i> Add to Quest Board
            </button>
        </div>
    `;

    await ChatMessage.create({
        content,
        whisper: ChatMessage.getWhisperRecipients("GM"),
        speaker: { alias: "Random Encounter" },
    });
}

// ── Convert encounter to quest ────────────────────────────────

export async function convertEncounterToQuest(questText) {
    if (!game.user.isGM) return;

    // Show conversion dialog
    await WITAEncounterConvertDialog.open(questText);
}

// ── Conversion dialog ─────────────────────────────────────────

class WITAEncounterConvertDialog extends foundry.applications.api.ApplicationV2 {

    constructor(questText, options = {}) {
        super(options);
        this._questText = questText;
    }

    static DEFAULT_OPTIONS = {
        id:       "wita-encounter-convert",
        window:   { resizable: false, title: "Add to Quest Board" },
        position: { width: 440, height: "auto" },
        classes:  ["wita-encounter-convert"],
    };

    static async open(questText) {
        const existing = foundry.applications.instances.get("wita-encounter-convert");
        if (existing?.rendered) existing.close();
        await new WITAEncounterConvertDialog(questText).render({ force: true });
    }

    async _renderHTML(context, options) {
        // Generate a short default name from first ~6 words
        const words     = this._questText.replace(/[^a-zA-Z0-9 ]/g, "").split(" ").filter(Boolean);
        const shortName = words.slice(0, 6).join(" ");

        const el = document.createElement("div");
        el.className = "wita-ec-body";
        el.innerHTML = `
            <div class="wita-ec-field">
                <label>Quest Name</label>
                <input type="text" id="wita-ec-name" value="${sanitizeHTML(shortName)}" placeholder="Quest name">
            </div>
            <div class="wita-ec-field">
                <label>Description</label>
                <textarea id="wita-ec-desc" rows="4">${sanitizeHTML(this._questText)}</textarea>
            </div>
            <div class="wita-ec-row">
                <div class="wita-ec-field">
                    <label>Danger Level</label>
                    <select id="wita-ec-danger">
                        <option value="1">1 — Trivial</option>
                        <option value="2" selected>2 — Low</option>
                        <option value="3">3 — Moderate</option>
                        <option value="4">4 — Dangerous</option>
                        <option value="5">5 — Deadly</option>
                    </select>
                </div>
                <div class="wita-ec-field">
                    <label>Reward Level</label>
                    <select id="wita-ec-reward">
                        <option value="1">1 — Minor</option>
                        <option value="2" selected>2 — Modest</option>
                        <option value="3">3 — Moderate</option>
                        <option value="4">4 — Major</option>
                        <option value="5">5 — Legendary</option>
                    </select>
                </div>
            </div>
            <div class="wita-ec-footer">
                <button class="wita-gb-btn primary" id="wita-ec-confirm">
                    <i class="fas fa-plus"></i> Add to Quest Board
                </button>
                <button class="wita-gb-btn" id="wita-ec-cancel">Cancel</button>
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
        el.querySelector("#wita-ec-cancel")?.addEventListener("click", () => this.close());
        el.querySelector("#wita-ec-confirm")?.addEventListener("click", () => this._confirm(el));
    }

    async _confirm(el) {
        const name        = el.querySelector("#wita-ec-name")?.value.trim();
        const description = el.querySelector("#wita-ec-desc")?.value.trim();
        const dangerLevel = parseInt(el.querySelector("#wita-ec-danger")?.value) || 2;
        const rewardLevel = parseInt(el.querySelector("#wita-ec-reward")?.value) || 2;

        if (!name) { ui.notifications.warn("WITA | Quest name is required."); return; }

        // Map danger level back to CC urgency
        const urgencyMap = { 1: "low", 2: "medium", 3: "medium", 4: "high", 5: "urgent" };
        const urgency    = urgencyMap[dangerLevel] ?? "medium";

        // 1. Create CC journal entry
        const questId    = foundry.utils.randomID();
        const journalEntry = await JournalEntry.create({
            name,
            flags: {
                "campaign-codex": {
                    type: "quest",
                    data: {
                        description: "",
                        notes:       "",
                        quests: [{
                            id:                  questId,
                            title:               name,
                            description,
                            inactive:            false,
                            completed:           false,
                            failed:              false,
                            visible:             true,
                            pinned:              false,
                            hideRewards:         false,
                            notifyPlayers:       false,
                            messageOnCompleted:  false,
                            urgency,
                            boardColumn:         "active",
                            questGiverUuid:      "",
                            relatedUuids:        [],
                            dependencies:        [],
                            unlocks:             [],
                            checkIns:            [],
                            linkedMacros:        [],
                            rewardXP:            0,
                            rewardCurrency:      0,
                            rewardReputation:    0,
                            rewardClaimed:       false,
                            updatedAt:           Date.now(),
                            objectives:          [],
                            inventory:           [],
                        }],
                    },
                },
            },
        });

        // 2. Automatically create WITA guildhall quest
        await createQuest({
            name,
            description,
            sourceType:     "cc",
            sourceId:       `${journalEntry.id}::${questId}`,
            dangerLevel,
            rewardLevel,
            rewardNarrative: [],
            rewardItems:     [],
            rewardGold:      0,
        });

        ui.notifications.info(`WITA | "${name}" added to Quest Board.`);

        // Refresh quest board if open
        const board = foundry.applications.instances.get("wita-guildhall-board");
        if (board?.rendered) board.render({ force: true });

        this.close();
    }
}

// ── Chat message button handler ───────────────────────────────
// Called from the renderChatMessageHTML hook

export function registerEncounterChatHook() {
    Hooks.on("renderChatMessageHTML", (message, html) => {
        const btn = html.querySelector?.(".wita-encounter-convert-btn");
        if (!btn) return;
        btn.addEventListener("click", async () => {
            if (!game.user.isGM) return;
            const encoded  = btn.dataset.questText;
            const questText = decodeURIComponent(encoded);
            await convertEncounterToQuest(questText);
        });
    });
}
