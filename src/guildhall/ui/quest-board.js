// ============================================================
// WITA Guildhall — quest-board.js
// WITAQuestBoard: main player/GM floating ApplicationV2 window
// ============================================================

import { MODULE_ID, DANGER_LEVELS, REWARD_LEVELS, QUEST_STATUS, OUTCOME_LABELS } from "../core/config.js";
import { getQuests, deleteQuest, dispatchQuest, assignActorToQuest,
         unassignActorFromQuest, getDispatchedActorIds } from "../core/quest-data.js";
import { getCapacity, getGuildhallSlot } from "../core/resolution.js";
import { sanitizeHTML } from "../../core/utils.js";

const BOARD_ID = "wita-guildhall-board";

export class WITAQuestBoard extends foundry.applications.api.ApplicationV2 {

    static DEFAULT_OPTIONS = {
        id:       BOARD_ID,
        window:   { resizable: true, title: "Quest Board" },
        position: { width: 680, height: 560 },
        classes:  ["wita-guildhall-board"],
    };

    static open() {
        const existing = foundry.applications.instances.get(BOARD_ID);
        if (existing?.rendered) { existing.bringToTop(); return existing; }
        return new WITAQuestBoard().render({ force: true });
    }

    async _renderHTML(context, options) {
        const el = document.createElement("div");
        el.className = "wita-gb-inner";
        el.appendChild(await this._buildBoard());
        return el;
    }

    _replaceHTML(result, content, options) {
        const wc = this.element?.querySelector(".window-content");
        if (!wc) return;
        wc.style.cssText = "padding:0;display:flex;flex-direction:column;overflow:hidden;";
        wc.replaceChildren(result);
        this._attachListeners(wc);
    }

    async _onRender(context, options) {}

    async _buildBoard() {
        const quests   = getQuests();
        const capacity = getCapacity();
        const slot     = getGuildhallSlot();
        const isGM     = game.user.isGM;

        const dispatchedIds = getDispatchedActorIds();
        const totalOut      = dispatchedIds.length;
        const activeCount   = quests.filter(q => q.status === QUEST_STATUS.ACTIVE).length;

        const available  = quests.filter(q => q.status === QUEST_STATUS.AVAILABLE);
        const active     = quests.filter(q => q.status === QUEST_STATUS.ACTIVE);
        const completed  = quests.filter(q =>
            q.status === QUEST_STATUS.COMPLETED || q.status === QUEST_STATUS.FAILED
        ).slice(-10); // last 10

        const frag = document.createDocumentFragment();

        // ── Header ────────────────────────────────────────────
        const header = document.createElement("div");
        header.className = "wita-gb-header";
        header.innerHTML = `
            <div class="wita-gb-title">
                <i class="fas fa-scroll"></i>
                ${sanitizeHTML(game.settings.get("wita", "bastionName") ?? "Bastion")} — Quest Board
            </div>
            <div class="wita-gb-capacity">
                <span title="Hirelings dispatched">
                    <i class="fas fa-users"></i> ${totalOut} / ${capacity.maxHirelingsOut}
                </span>
                <span title="Active quests">
                    <i class="fas fa-flag"></i> ${activeCount} / ${capacity.maxActiveQuests}
                </span>
                <button class="wita-gb-btn" id="wita-gb-open-bastion" title="View Guildhall in Bastion Panel">
                    <i class="fas fa-chess-rook"></i> Guildhall
                </button>
            </div>
        `;
        if (isGM) {
            const gmBtns = document.createElement("div");
            gmBtns.className = "wita-gb-gm-bar";
            gmBtns.innerHTML = `
                <button class="wita-gb-btn" id="wita-gb-new-quest"><i class="fas fa-plus"></i> New Quest</button>
                <button class="wita-gb-btn" id="wita-gb-import-fql"
                    ${game.modules.get("forien-quest-log")?.active ? "" : "disabled title='Forien Quest Log not active'"}>
                    <i class="fas fa-file-import"></i> Import FQL
                </button>
                <button class="wita-gb-btn" id="wita-gb-import-cc"
                    ${game.modules.get("campaign-codex")?.active ? "" : "disabled title='Campaign Codex not active'"}>
                    <i class="fas fa-file-import"></i> Import CC
                </button>
            `;
            header.appendChild(gmBtns);
        }
        frag.appendChild(header);

        // ── Three columns ─────────────────────────────────────
        const cols = document.createElement("div");
        cols.className = "wita-gb-columns";

        cols.appendChild(this._buildColumn("Available", available, isGM, capacity));
        cols.appendChild(this._buildColumn("Active", active, isGM, capacity));
        cols.appendChild(this._buildColumn("Completed", completed, isGM, capacity, true));

        frag.appendChild(cols);

        const wrap = document.createElement("div");
        wrap.className = "wita-gb-body";
        wrap.appendChild(frag);
        return wrap;
    }

    _buildColumn(title, quests, isGM, capacity, readonly = false) {
        const col = document.createElement("div");
        col.className = "wita-gb-col";

        const hdr = document.createElement("div");
        hdr.className = "wita-gb-col-header";
        hdr.innerHTML = `<span>${title}</span><span class="wita-gb-col-count">${quests.length}</span>`;
        col.appendChild(hdr);

        const list = document.createElement("div");
        list.className = "wita-gb-col-list";

        if (quests.length === 0) {
            list.innerHTML = `<div class="wita-gb-empty">No quests</div>`;
        } else {
            for (const quest of quests) {
                list.appendChild(this._buildQuestCard(quest, isGM, readonly));
            }
        }

        col.appendChild(list);
        return col;
    }

    _buildQuestCard(quest, isGM, readonly) {
        const card = document.createElement("div");
        card.className = `wita-gb-card${quest.status === QUEST_STATUS.FAILED ? " failed" : ""}`;
        card.dataset.questId = quest.id;

        const danger  = DANGER_LEVELS[quest.dangerLevel] ?? DANGER_LEVELS[2];
        const reward  = REWARD_LEVELS[quest.rewardLevel] ?? REWARD_LEVELS[2];
        const skulls  = "💀".repeat(quest.dangerLevel);
        const hirelings = quest.assignedActorIds
            .map(id => game.actors.get(id)?.name ?? "Unknown")
            .join(", ");

        const sourceBadge = quest.sourceType !== "manual"
            ? `<span class="wita-gb-source-badge">${quest.sourceType.toUpperCase()}</span>`
            : "";

        const outcomeBadge = quest.outcome
            ? `<span class="wita-gb-outcome-badge" style="color:${OUTCOME_LABELS[quest.outcome.type]?.colour}">
                ${OUTCOME_LABELS[quest.outcome.type]?.label ?? quest.outcome.type}
               </span>`
            : "";

        card.innerHTML = `
            <div class="wita-gb-card-header">
                <span class="wita-gb-card-title">${sanitizeHTML(quest.name)}</span>
                <span class="wita-gb-card-badges">
                    ${sourceBadge}
                    ${outcomeBadge}
                </span>
            </div>
            <div class="wita-gb-card-meta">
                <span title="${danger.label} danger">${skulls}</span>
                <span class="wita-gb-reward-label">${reward.label} reward</span>
                ${hirelings ? `<span class="wita-gb-hirelings" title="Assigned hirelings">
                    <i class="fas fa-users"></i> ${sanitizeHTML(hirelings)}
                </span>` : ""}
            </div>
            ${quest.assignedActorIds.length > 0 && quest.status === QUEST_STATUS.AVAILABLE ? `
            <div class="wita-gb-card-slots">
                <span class="wita-gb-slots-label">
                    ${quest.assignedActorIds.length} / ${quest.maxSlots} assigned
                </span>
            </div>` : ""}
        `;

        card.addEventListener("click", () => {
            WITAQuestDetail.open(quest.id, this);
        });

        return card;
    }

    _attachListeners(el) {
        // Open bastion panel to guildhall
        el.querySelector("#wita-gb-open-bastion")?.addEventListener("click", () => {
            const panel = foundry.applications.instances.get("wita-bastion-panel");
            if (panel?.rendered) {
                panel.bringToTop();
                panel._switchTab?.("facilities", panel.element);
            } else {
                game.wita?.openPanel?.();
            }
        });

        // GM: new quest
        el.querySelector("#wita-gb-new-quest")?.addEventListener("click", () => {
            WITAQuestCreate.open(this);
        });

        // GM: import from FQL
        el.querySelector("#wita-gb-import-fql")?.addEventListener("click", () => {
            WITAQuestImport.open("fql", this);
        });

        // GM: import from CC
        el.querySelector("#wita-gb-import-cc")?.addEventListener("click", () => {
            WITAQuestImport.open("cc", this);
        });
    }
}

// ── WITAQuestDetail ───────────────────────────────────────────

export class WITAQuestDetail extends foundry.applications.api.ApplicationV2 {

    constructor(questId, boardInstance, options = {}) {
        super(options);
        this._questId = questId;
        this._board   = boardInstance;
    }

    static DEFAULT_OPTIONS = {
        window:   { resizable: false },
        position: { width: 440, height: "auto" },
        classes:  ["wita-guildhall-detail"],
    };

    get title() {
        return getQuests().find(q => q.id === this._questId)?.name ?? "Quest";
    }

    static open(questId, board) {
        const appId  = `wita-quest-detail-${questId}`;
        const existing = foundry.applications.instances.get(appId);
        if (existing?.rendered) { existing.bringToTop(); return; }
        new WITAQuestDetail(questId, board, { id: appId }).render({ force: true });
    }

    async _renderHTML(context, options) {
        const el = document.createElement("div");
        el.className = "wita-qd-body";
        el.innerHTML = await this._buildContent();
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

    async _buildContent() {
        const quest  = getQuests().find(q => q.id === this._questId);
        if (!quest) return `<div class="wita-qd-empty">Quest not found.</div>`;

        const isGM      = game.user.isGM;
        const isActive  = quest.status === QUEST_STATUS.ACTIVE;
        const isAvail   = quest.status === QUEST_STATUS.AVAILABLE;
        const isDone    = quest.status === QUEST_STATUS.COMPLETED || quest.status === QUEST_STATUS.FAILED;
        const danger    = DANGER_LEVELS[quest.dangerLevel] ?? DANGER_LEVELS[2];
        const reward    = REWARD_LEVELS[quest.rewardLevel] ?? REWARD_LEVELS[2];
        const capacity  = getCapacity();
        const dispatched = getDispatchedActorIds();

        // Hireling rows
        const assignedActors = quest.assignedActorIds.map(id => game.actors.get(id)).filter(Boolean);
        const assignedRows = assignedActors.map(a => `
            <div class="wita-qd-hireling-row">
                <img src="${a.img}" class="wita-qd-hireling-img">
                <span class="wita-qd-hireling-name">${sanitizeHTML(a.name)}</span>
                <span class="wita-qd-hireling-type">${a.type === "npc" ? `CR ${a.system?.details?.cr ?? "?"}` : `Lv ${a.system?.details?.level ?? "?"}`}</span>
                ${isGM && isAvail ? `<button class="wita-detail-micro-btn danger wita-qd-unassign" data-actor-id="${a.id}">✕</button>` : ""}
            </div>
        `).join("");

        // Outcome section if resolved
        const outcomeSection = quest.outcome ? (() => {
            const info = OUTCOME_LABELS[quest.outcome.type];
            const modStr = `${quest.outcome.baseDie ?? "??"} + ${quest.outcome.modifiers?.countMod ?? 0} (count) + ${quest.outcome.modifiers?.moraleMod ?? 0} (morale) + ${quest.outcome.modifiers?.powerMod ?? 0} (power) = ${quest.outcome.total} vs DC ${quest.outcome.dc}`;
            return `
                <div class="wita-qd-section-label">Outcome</div>
                <div class="wita-qd-outcome" style="color:${info?.colour}">
                    <i class="fas ${info?.icon}"></i> ${info?.label}
                </div>
                <div class="wita-qd-roll-detail">${modStr}</div>
                ${quest.outcome.hirelingResults?.map(r => `
                    <div class="wita-qd-hireling-result">
                        <strong>${sanitizeHTML(r.actorName)}</strong>: ${r.label} (rolled ${r.roll})
                        ${r.restWeeks ? `— ${r.restWeeks}w rest` : ""}
                    </div>
                `).join("") ?? ""}
            `;
        })() : "";

        return `
            <div class="wita-qd-top-row">
                <div>
                    <div class="wita-qd-danger" style="color:${danger.colour}">
                        ${"💀".repeat(quest.dangerLevel)} ${danger.label} Danger
                    </div>
                    <div class="wita-qd-reward">
                        <i class="fas fa-coins"></i> ${reward.label} Reward
                        ${quest.rewardGold ? `· ${quest.rewardGold} GP` : ""}
                    </div>
                    <div class="wita-qd-source">
                        Source: ${quest.sourceType.toUpperCase()}
                        ${quest.sourceType !== "manual" ? `<a class="wita-qd-source-link" data-source-id="${sanitizeHTML(quest.sourceId ?? "")}">Open</a>` : ""}
                    </div>
                </div>
                ${isGM && !isDone ? `
                <div class="wita-qd-gm-meta">
                    <label>Danger
                        <select id="wita-qd-danger-sel">
                            ${[1,2,3,4,5].map(n => `<option value="${n}" ${quest.dangerLevel===n?"selected":""}>${DANGER_LEVELS[n].label}</option>`).join("")}
                        </select>
                    </label>
                    <label>Reward
                        <select id="wita-qd-reward-sel">
                            ${[1,2,3,4,5].map(n => `<option value="${n}" ${quest.rewardLevel===n?"selected":""}>${REWARD_LEVELS[n].label}</option>`).join("")}
                        </select>
                    </label>
                </div>` : ""}
            </div>

            ${quest.description ? `
            <div class="wita-qd-section-label">Description</div>
            <div class="wita-qd-desc">${quest.description}</div>` : ""}

            <div class="wita-qd-section-label">
                Hirelings (${assignedActors.length}/${quest.maxSlots})
            </div>
            <div class="wita-qd-hirelings">
                ${assignedRows || `<div class="wita-qd-empty-hirelings">No hirelings assigned.</div>`}
            </div>

            ${isGM && isAvail && assignedActors.length < quest.maxSlots && dispatched.length < capacity.maxHirelingsOut ? `
            <div class="wita-qd-assign-row">
                <select id="wita-qd-actor-sel">
                    <option value="">— Assign a hireling —</option>
                    ${game.actors
                        .filter(a => (a.type === "npc" || a.type === "character") && !dispatched.includes(a.id) && !quest.assignedActorIds.includes(a.id))
                        .map(a => { const r = a.type === "npc" ? `CR ${a.system?.details?.cr ?? "?"}` : `Lv ${a.system?.details?.level ?? "?"}`; return `<option value="${a.id}">${sanitizeHTML(a.name)} (${r})</option>`; })
                        .join("")}
                </select>
                <button class="wita-detail-micro-btn" id="wita-qd-assign-btn">Assign</button>
            </div>` : ""}

            ${outcomeSection}

            ${quest.rewardNarrative?.length > 0 ? `
            <div class="wita-qd-section-label">Narrative Rewards</div>
            <ul class="wita-qd-rewards">
                ${quest.rewardNarrative.map(r => `<li>${sanitizeHTML(r.name)}</li>`).join("")}
            </ul>` : ""}

            ${isGM ? `
            <div class="wita-qd-footer">
                ${isAvail && assignedActors.length > 0 ? `<button class="wita-gb-btn primary" id="wita-qd-dispatch">
                    <i class="fas fa-paper-plane"></i> Dispatch
                </button>` : ""}
                ${isActive ? `<div class="wita-qd-active-note">
                    <i class="fas fa-hourglass-half"></i> Resolves at next bastion turn
                </div>` : ""}
                <button class="wita-detail-micro-btn danger" id="wita-qd-delete" style="margin-left:auto">
                    Delete Quest
                </button>
            </div>` : ""}
        `;
    }

    _attachListeners(el) {
        const questId = this._questId;
        const board   = this._board;
        const refresh = async () => {
            await this.render({ force: true });
            await board?.render({ force: true });
        };

        // Assign hireling
        el.querySelector("#wita-qd-assign-btn")?.addEventListener("click", async () => {
            const sel = el.querySelector("#wita-qd-actor-sel");
            if (!sel?.value) return;
            try {
                await assignActorToQuest(questId, sel.value);
                await refresh();
            } catch(e) {
                ui.notifications.warn(`WITA | ${e.message}`);
            }
        });

        // Unassign hireling
        el.querySelectorAll(".wita-qd-unassign").forEach(btn => {
            btn.addEventListener("click", async () => {
                await unassignActorFromQuest(questId, btn.dataset.actorId);
                await refresh();
            });
        });

        // Dispatch quest
        el.querySelector("#wita-qd-dispatch")?.addEventListener("click", async () => {
            const turnNumber = game.settings.get("wita", "bastionTurnNumber") ?? 0;
            await dispatchQuest(questId, turnNumber);
            ui.notifications.info("Quest dispatched — resolves at next bastion turn.");
            await refresh();
        });

        // Danger/reward selects
        el.querySelector("#wita-qd-danger-sel")?.addEventListener("change", async (e) => {
            const { updateQuest } = await import("../core/quest-data.js");
            await updateQuest(questId, { dangerLevel: parseInt(e.target.value) });
            await refresh();
        });
        el.querySelector("#wita-qd-reward-sel")?.addEventListener("change", async (e) => {
            const { updateQuest } = await import("../core/quest-data.js");
            await updateQuest(questId, { rewardLevel: parseInt(e.target.value) });
            await refresh();
        });

        // Source link
        el.querySelector(".wita-qd-source-link")?.addEventListener("click", async (e) => {
            const sourceId = e.target.dataset.sourceId;
            if (!sourceId) return;
            const journalId = sourceId.includes("::") ? sourceId.split("::")[0] : sourceId;
            game.journal.get(journalId)?.sheet.render({ force: true });
        });

        // Delete
        el.querySelector("#wita-qd-delete")?.addEventListener("click", async () => {
            const confirmed = await foundry.applications.api.DialogV2.confirm({
                window: { title: "Delete Quest" },
                content: "<p>Permanently delete this quest?</p>",
            }).catch(() => false);
            if (!confirmed) return;
            await deleteQuest(questId);
            this.close();
            await board?.render({ force: true });
        });
    }
}

// ── WITAQuestCreate ───────────────────────────────────────────

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
        if (existing?.rendered) { existing.bringToTop(); return; }
        new WITAQuestCreate(board).render({ force: true });
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

// ── WITAQuestImport ───────────────────────────────────────────

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
        new WITAQuestImport(source, board).render({ force: true });
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
