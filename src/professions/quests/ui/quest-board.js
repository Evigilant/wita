// ============================================================
// WITA Guildhall — quest-board.js
// WITAQuestBoard: main player/GM floating ApplicationV2 window
// ============================================================

import { MODULE_ID, DANGER_LEVELS, REWARD_LEVELS, QUEST_STATUS, OUTCOME_LABELS } from "../core/config.js";
import { getQuests, getQuestById, deleteQuest, dispatchQuest, assignActorToQuest,
         unassignActorFromQuest, getDispatchedActorIds } from "../core/quest-data.js";
import { getCapacity, getGuildhallSlot } from "../core/resolution.js";
import { getBastionData } from "../../../bastion/data/data.js"; // used for worker name lookup
import { sanitizeHTML } from "../../../core/utils.js";
import { WITAQuestDetail } from "./quest-detail.js";
import { WITAQuestCreate } from "./quest-create.js";
import { WITAQuestImport } from "./quest-import.js";

const BOARD_ID = "wita-guildhall-board";

export class WITAQuestBoard extends foundry.applications.api.ApplicationV2 {

    constructor(options = {}) {
        super(options);
        this._search      = "";
        this._dangerFilter = 0;       // 0 = all
        this._sortDir     = "asc";    // "asc" | "desc" — applies to Available column
        this._collapsed   = { Available: false, Active: false, Completed: true };
    }

    static DEFAULT_OPTIONS = {
        id:       BOARD_ID,
        window:   { resizable: true, title: "Quest Board" },
        position: { width: 720, height: 580 },
        classes:  ["wita-guildhall-board"],
    };

    static open() {
        const existing = foundry.applications.instances.get(BOARD_ID);
        if (existing?.rendered) { existing.bringToFront(); return existing; }
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
        wc.style.cssText = "padding:0;display:flex;flex-direction:column;overflow:hidden;height:100%;";
        result.style.cssText = "display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;";
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

        // Guildhall-assigned hirelings count
        const guildhallSlot    = getGuildhallSlot();
        const bastionData      = game.settings.get("wita", "bastion") ?? {};
        const guildhallWorkers = guildhallSlot
            ? (bastionData.workers ?? []).filter(w => (guildhallSlot.workerIds ?? []).includes(w.id))
            : [];
        const guildhallCount = guildhallWorkers.length;

        // Apply search filter across all columns
        const searchTerm = this._search.trim().toLowerCase();
        const matchSearch = q => !searchTerm
            || q.name.toLowerCase().includes(searchTerm)
            || (q.description ?? "").toLowerCase().includes(searchTerm);

        // Available: filter by danger + search, then sort
        let available = quests.filter(q => q.status === QUEST_STATUS.AVAILABLE).filter(matchSearch);
        if (this._dangerFilter) available = available.filter(q => q.dangerLevel === this._dangerFilter);
        available = [...available].sort((a, b) =>
            this._sortDir === "asc" ? a.dangerLevel - b.dangerLevel : b.dangerLevel - a.dangerLevel
        );

        const active = quests.filter(q => q.status === QUEST_STATUS.ACTIVE).filter(matchSearch);
        const completed = quests.filter(q =>
            q.status === QUEST_STATUS.COMPLETED || q.status === QUEST_STATUS.FAILED
        ).filter(matchSearch).slice(-10);

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
                <span title="Hirelings in Guildhall">
                    <i class="fas fa-house-user"></i> ${guildhallCount} in Guildhall
                </span>
                <span title="Hirelings dispatched on quests">
                    <i class="fas fa-users"></i> ${totalOut} / ${capacity.maxHirelingsOut} dispatched
                </span>
                <span title="Active quests">
                    <i class="fas fa-flag"></i> ${activeCount} / ${capacity.maxActiveQuests} quests
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

        // ── Toolbar ───────────────────────────────────────────
        const toolbar = document.createElement("div");
        toolbar.className = "wita-gb-toolbar";
        toolbar.innerHTML = `
            <input type="text" id="wita-gb-search" placeholder="Search quests…"
                value="${sanitizeHTML(this._search)}"
                style="flex:1;min-width:0;border:1px solid var(--color-fieldset-border);
                       border-radius:3px;padding:0.25rem 0.5rem;font-size:0.75rem;font-family:inherit">
            <div style="display:flex;align-items:center;gap:0.4rem;flex-shrink:0">
                <label style="font-size:0.7rem;color:var(--color-form-hint);white-space:nowrap">Danger</label>
                <select id="wita-gb-danger-filter"
                    style="border:1px solid var(--color-fieldset-border);border-radius:3px;
                           padding:0.2rem 0.35rem;font-size:0.72rem">
                    <option value="0" ${this._dangerFilter===0?"selected":""}>All</option>
                    ${[1,2,3,4,5].map(n => `<option value="${n}" ${this._dangerFilter===n?"selected":""}>${n} — ${DANGER_LEVELS[n].label}</option>`).join("")}
                </select>
                <button id="wita-gb-sort-dir" class="wita-gb-btn" title="Sort Available by danger level"
                    style="padding:0.2rem 0.4rem;font-size:0.72rem">
                    <i class="fas fa-sort-amount-${this._sortDir === "asc" ? "up" : "down"}"></i>
                    ${this._sortDir === "asc" ? "ASC" : "DESC"}
                </button>
            </div>
        `;
        frag.appendChild(toolbar);

        // ── Three columns ─────────────────────────────────────
        const cols = document.createElement("div");
        cols.className = "wita-gb-columns";

        cols.appendChild(this._buildColumn("Available", available, isGM, capacity));
        cols.appendChild(this._buildColumn("Active", active, isGM, capacity));
        cols.appendChild(this._buildColumn("Completed", completed, isGM, capacity));

        frag.appendChild(cols);

        const wrap = document.createElement("div");
        wrap.className = "wita-gb-body";
        wrap.appendChild(frag);
        return wrap;
    }

    _buildColumn(title, quests, isGM, capacity, readonly = false) {
        const col = document.createElement("div");
        col.className = "wita-gb-col";
        const isCollapsed = this._collapsed[title] ?? false;

        const hdr = document.createElement("div");
        hdr.className = "wita-gb-col-header";
        hdr.style.cssText = "cursor:pointer;user-select:none;";
        hdr.dataset.colTitle = title;
        hdr.innerHTML = `
            <span>${title}</span>
            <span style="display:flex;align-items:center;gap:0.4rem">
                <span class="wita-gb-col-count">${quests.length}</span>
                <i class="fas fa-chevron-${isCollapsed ? "down" : "up"}"
                   style="font-size:0.6rem;opacity:0.6"></i>
            </span>
        `;
        col.appendChild(hdr);

        const list = document.createElement("div");
        list.className = "wita-gb-col-list";
        list.style.cssText = `overflow-y:auto;flex:1;${isCollapsed ? "display:none;" : ""}`;

        if (quests.length === 0) {
            list.innerHTML = `<div class="wita-gb-empty">No quests</div>`;
        } else {
            for (const quest of quests) {
                list.appendChild(this._buildQuestCard(quest, isGM, readonly));
            }
        }

        // Drop zone — accept quests dragged from other columns
        const statusMap = { "Available": "available", "Active": "active", "Completed": "completed" };
        const targetStatus = statusMap[title];
        // Players can drag Available→Active; GMs can drag between any columns
        const allowDrop = targetStatus && (isGM || targetStatus === "active");
        if (allowDrop) {
            list.addEventListener("dragover", e => { e.preventDefault(); list.classList.add("drag-over"); });
            list.addEventListener("dragleave", () => list.classList.remove("drag-over"));
            list.addEventListener("drop", async e => {
                e.preventDefault();
                list.classList.remove("drag-over");
                try {
                    const { questId } = JSON.parse(e.dataTransfer.getData("text/plain"));
                    if (!questId) return;
                    const { updateQuest, getQuestById } = await import("../core/quest-data.js");
                    const quest = getQuestById(questId);
                    if (!quest || quest.status === targetStatus) return;
                    // Players may only move Available→Active (dispatch requires hirelings)
                    if (!isGM && !(quest.status === "available" && targetStatus === "active")) return;
                    if (!isGM && quest.assignedActorIds.length === 0) {
                        ui.notifications.warn("WITA | Assign hirelings before dispatching a quest.");
                        return;
                    }
                    const turnNumber = game.settings.get("wita", "bastionState")?.turnNumber ?? 0;
                    const changes = { status: targetStatus };
                    if (targetStatus === "active") changes.turnAssigned = turnNumber;
                    await updateQuest(questId, changes);
                    const board = foundry.applications.instances.get("wita-guildhall-board");
                    if (board?.rendered) board.render({ force: true });
                } catch(err) { console.warn("WITA | Quest drop failed:", err); }
            });
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

        card.dataset.searchText = `${quest.name} ${quest.description ?? ""}`.toLowerCase();
        card.setAttribute("draggable", "true");
        card.addEventListener("dragstart", (e) => {
            e.dataTransfer.setData("text/plain", JSON.stringify({ questId: quest.id }));
            e.dataTransfer.effectAllowed = "move";
        });
        card.addEventListener("click", (e) => {
            if (e.defaultPrevented) return;
            WITAQuestDetail.open(quest.id, this);
        });

        return card;
    }

    _attachListeners(el) {
        // Search — filter in-place to preserve focus
        el.querySelector("#wita-gb-search")?.addEventListener("input", (e) => {
            this._search = e.target.value;
            const term = this._search.trim().toLowerCase();
            el.querySelectorAll(".wita-gb-col").forEach(col => {
                let visible = 0;
                col.querySelectorAll(".wita-gb-card").forEach(card => {
                    const match = !term || card.dataset.searchText?.includes(term);
                    card.style.display = match ? "" : "none";
                    if (match) visible++;
                });
                const badge = col.querySelector(".wita-gb-col-count");
                if (badge) badge.textContent = visible;
            });
        });

        // Danger filter
        el.querySelector("#wita-gb-danger-filter")?.addEventListener("change", (e) => {
            this._dangerFilter = parseInt(e.target.value) || 0;
            this.render({ force: true });
        });

        // Sort direction toggle
        el.querySelector("#wita-gb-sort-dir")?.addEventListener("click", () => {
            this._sortDir = this._sortDir === "asc" ? "desc" : "asc";
            this.render({ force: true });
        });

        // Column collapse toggles
        el.querySelectorAll(".wita-gb-col-header[data-col-title]").forEach(hdr => {
            hdr.addEventListener("click", () => {
                const title = hdr.dataset.colTitle;
                this._collapsed[title] = !this._collapsed[title];
                this.render({ force: true });
            });
        });

        // Open bastion panel to guildhall
        el.querySelector("#wita-gb-open-bastion")?.addEventListener("click", async () => {
            let panel = foundry.applications.instances.get("wita-bastion-panel");
            if (!panel?.rendered) {
                // Open the bastion panel — import dynamically to avoid circular deps
                const { WITABastionPanel } = await import("../../bastion/ui/panel.js");
                panel = new WITABastionPanel();
                await panel.render({ force: true });
                // Wait a tick for DOM to be ready
                await new Promise(r => setTimeout(r, 100));
            } else {
                panel.bringToFront();
            }
            // Switch to facilities tab using window-content as container
            const wc = panel.element?.querySelector(".window-content");
            if (wc) panel._switchTab?.("facilities", wc);
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
