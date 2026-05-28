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

        const hdr = document.createElement("div");
        hdr.className = "wita-gb-col-header";
        hdr.innerHTML = `<span>${title}</span><span class="wita-gb-col-count">${quests.length}</span>`;
        col.appendChild(hdr);

        const list = document.createElement("div");
        list.className = "wita-gb-col-list";
        list.style.cssText = "overflow-y:auto;flex:1;";

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
        if (targetStatus && isGM) {
            list.addEventListener("dragover", e => { e.preventDefault(); list.classList.add("drag-over"); });
            list.addEventListener("dragleave", () => list.classList.remove("drag-over"));
            list.addEventListener("drop", async e => {
                e.preventDefault();
                list.classList.remove("drag-over");
                try {
                    const { questId } = JSON.parse(e.dataTransfer.getData("text/plain"));
                    if (!questId) return;
                    const { updateQuest } = await import("../core/quest-data.js");
                    const quest = (await import("../core/quest-data.js")).getQuestById(questId);
                    if (!quest || quest.status === targetStatus) return;
                    await updateQuest(questId, { status: targetStatus });
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
