// ============================================================
// WITA Guildhall — quest-detail.js
// WITAQuestDetail: floating detail/edit panel for a single quest
// ============================================================

import { DANGER_LEVELS, REWARD_LEVELS, QUEST_STATUS, OUTCOME_LABELS } from "../core/config.js";
import { getQuests, getQuestById, deleteQuest, dispatchQuest,
         assignActorToQuest, unassignActorFromQuest, getDispatchedActorIds } from "../core/quest-data.js";
import { getCapacity, getGuildhallSlot } from "../core/resolution.js";
import { sanitizeHTML } from "../../core/utils.js";

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
        if (existing?.rendered) { existing.bringToFront(); return; }
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
            ${isGM && !isDone ? `
            <div class="wita-qd-name-row">
                <input type="text" id="wita-qd-name-input"
                    value="${sanitizeHTML(quest.name)}"
                    placeholder="Quest name"
                    style="width:100%;font-size:0.88rem;font-weight:600;background:transparent;
                           border:none;border-bottom:1px solid var(--color-fieldset-border);
                           color:var(--color-form-label);padding:0.1rem 0;margin-bottom:0.4rem;
                           font-family:inherit">
            </div>` : `
            <div class="wita-qd-name-static">${sanitizeHTML(quest.name)}</div>`}
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
                    ${(() => {
                        // Build eligible set from Guildhall slot workers
                        const gSlot = getGuildhallSlot();
                        const gData = game.settings.get("wita", "bastion") ?? {};
                        const gWorkers = gSlot
                            ? (gData.workers ?? []).filter(w => (gSlot.workerIds ?? []).includes(w.id))
                            : [];

                        const eligibleIds = new Set();
                        for (const w of gWorkers) {
                            if (w.actorId) {
                                eligibleIds.add(w.actorId);
                            } else {
                                // Name fallback — prefer character type for PCs like Selune
                                const matches = game.actors.filter(a => a.name === w.name);
                                const match = matches.find(a => a.type === "character")
                                           ?? matches.find(a => a.type === "npc")
                                           ?? matches[0];
                                if (match) eligibleIds.add(match.id);
                            }
                        }

                        return game.actors
                            .filter(a => {
                                if (dispatched.includes(a.id)) return false;
                                if (quest.assignedActorIds.includes(a.id)) return false;
                                if (a.type !== "npc" && a.type !== "character") return false;
                                if (eligibleIds.size === 0) return true;
                                return eligibleIds.has(a.id);
                            })
                            .map(a => {
                                const r = a.type === "npc"
                                    ? `CR ${a.system?.details?.cr ?? "?"}`
                                    : `Lv ${a.system?.details?.level ?? "?"}`;
                                return `<option value="${a.id}">${sanitizeHTML(a.name)} (${r})</option>`;
                            })
                            .join("");
                    })()}
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
            const turnNumber = (game.settings.get("wita", "bastionState")?.turnNumber ?? 0);
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

        // Name edit
        el.querySelector("#wita-qd-name-input")?.addEventListener("change", async (e) => {
            const newName = e.target.value.trim();
            if (!newName) { e.target.value = getQuestById(questId)?.name ?? ""; return; }
            const { updateQuest } = await import("../core/quest-data.js");
            await updateQuest(questId, { name: newName });
            await board?.render({ force: true });
        });

        // Source link
        el.querySelector(".wita-qd-source-link")?.addEventListener("click", async (e) => {
            const sourceId = e.target.dataset.sourceId;
            if (!sourceId) return;
            // CC quests: "journalId::questId" — open the parent journal
            // FQL quests: full UUID like "JournalEntry.xxxxx" — extract short ID
            const rawId = sourceId.includes("::") ? sourceId.split("::")[0] : sourceId;
            // Strip UUID prefix if present (e.g. "JournalEntry.abc123" → "abc123")
            const shortId = rawId.includes(".") ? rawId.split(".").pop() : rawId;
            const journal = game.journal.get(shortId);
            if (journal) {
                journal.sheet.render({ force: true });
            } else {
                // Try fromUuid as fallback
                const doc = await fromUuid(rawId).catch(() => null);
                doc?.sheet?.render({ force: true });
            }
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
