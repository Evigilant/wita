// ============================================================
// WITA — CANDIDATES DIALOG
// WITACandidatesDialog: shows recruit pool for a facility slot.
// GM can hire (creates actor + worker) or dismiss each candidate.
// ============================================================

import { sanitizeHTML, witaCascadePosition, witaSetting } from "../../../core/utils.js";
import { WITA_WORKER_PROFESSIONS }                        from "../../workers/config.js";
import { RARITY_LABELS, RARITY_COLOURS }                  from "../data/recruiter-config.js";
import { getBastionData, saveBastionData }                 from "../../../bastion/data/data.js";
import { createWorker, updateWorker, assignWorkerToSlot }  from "../../workers/hireling.js";
import { WITAWorkerProfession }                            from "../../workers/level.js";
import { witaSaveSettingAsGM }                             from "../../../socket.js";
import { getFinancialSummary, deductBankFunds }            from "../../../bastion/data/finance.js";

export class WITACandidatesDialog extends foundry.applications.api.ApplicationV2 {

    constructor(slotId, options = {}) {
        super(options);
        this._slotId = slotId;
    }

    static DEFAULT_OPTIONS = {
        window:   { resizable: true, title: "Recruit Candidates" },
        position: { width: 540, height: "auto" },
        classes:  ["wita-candidates-dialog"],
    };

    static open(slotId) {
        const appId   = `wita-candidates-dialog-${slotId}`;
        const existing = foundry.applications.instances.get(appId);
        if (existing?.rendered) { existing.bringToFront(); return; }
        const pos = witaCascadePosition("wita-bastion-panel");
        const dlg = new WITACandidatesDialog(slotId, { id: appId });
        dlg.render({ force: true });
        if (pos.top !== undefined) dlg.setPosition(pos);
    }

    // ── Helpers ───────────────────────────────────────────────

    _getEntry() {
        try {
            const all = game.settings.get("wita", "bastionRecruitCandidates") ?? {};
            return all[this._slotId] ?? null;
        } catch { return null; }
    }

    // ── Render ────────────────────────────────────────────────

    async _renderHTML(_context, _options) {

        const entry    = this._getEntry();
        const fin      = getFinancialSummary();
        const balance  = fin?.bankBalance ?? 0;
        const currency = fin?.currency    ?? "GP";

        const el = document.createElement("div");
        el.className = "wita-candidates-body";

        if (!entry?.candidates?.length) {
            el.innerHTML = `<div class="wita-empty" style="padding:1rem">No candidates available for this facility.</div>`;
            return el;
        }

        el.innerHTML = `
            <div style="padding:0.5rem 0.75rem 0.25rem;border-bottom:1px solid var(--color-fieldset-border)">
                <div style="font-size:0.75rem;font-weight:700">${sanitizeHTML(entry.facilityName)}</div>
                <div style="font-size:0.65rem;color:var(--color-form-hint);margin-top:0.15rem">
                    Recruiter Level ${sanitizeHTML(String(entry.recruiterLevel))} ·
                    ${entry.candidates.length} candidate${entry.candidates.length !== 1 ? "s" : ""} ·
                    Bank: <strong>${balance.toLocaleString()} ${sanitizeHTML(currency)}</strong>
                </div>
            </div>
            <div class="wita-candidate-list" style="padding:0.4rem 0.5rem;display:flex;flex-direction:column;gap:0.5rem">
                ${entry.candidates.map(c => _renderCandidateCard(c, balance, currency)).join("")}
            </div>
        `;

        return el;
    }

    _replaceHTML(result, _content, _options) {
        const wc = this.element?.querySelector(".window-content");
        if (!wc) return;
        wc.style.cssText = "padding:0;overflow-y:auto;max-height:70vh;";
        wc.replaceChildren(result);
        this._attachListeners(wc);
    }

    async _onRender() {}

    // ── Listeners ─────────────────────────────────────────────

    _attachListeners(el) {
        el.querySelectorAll(".wita-hire-btn").forEach(btn => {
            btn.addEventListener("click", () => this._hire(btn.dataset.candidateId));
        });
        el.querySelectorAll(".wita-dismiss-btn").forEach(btn => {
            btn.addEventListener("click", () => this._dismiss(btn.dataset.candidateId));
        });
    }

    // ── Hire ──────────────────────────────────────────────────

    async _hire(candidateId) {
        if (!game.user.isGM) return;
        const entry = this._getEntry();
        if (!entry) return;
        const candidate = (entry.candidates ?? []).find(c => c.id === candidateId);
        if (!candidate) return;

        // Disable buttons to prevent double-fire while async operations run
        this.element?.querySelectorAll(".wita-hire-btn,.wita-dismiss-btn")
            .forEach(b => b.setAttribute("disabled", ""));

        try {
            // Create NPC actor
            let actor = null;
            try {
                actor = await Actor.create({
                    name:   candidate.name,
                    type:   "npc",
                    img:    "icons/svg/mystery-man.svg",
                    system: { details: { biography: { value: candidate.bio } } },
                    flags:  { wita: { recruitedTurn: witaSetting("bastionState")?.turnNumber ?? 0 } },
                });
            } catch (e) {
                console.warn("WITA | Could not create candidate actor:", e);
                ui.notifications.warn("WITA | Actor creation failed — hireling added without actor link.");
            }

            // Create worker record
            const profLabel = WITA_WORKER_PROFESSIONS[candidate.primaryProfession]?.label
                           ?? candidate.primaryProfession;
            const newId = await createWorker({ name: candidate.name, role: profLabel, morale: candidate.morale });
            if (!newId) {
                actor?.delete?.();
                ui.notifications.error("WITA | Failed to create worker record.");
                return;
            }

            // Set profession data and actor link
            await updateWorker(newId, {
                primaryProfession: candidate.primaryProfession,
                professions:       candidate.professions,
                actorId:           actor?.id ?? null,
            });

            // Assign to the recruiting facility slot
            await assignWorkerToSlot(newId, this._slotId);

            // Deduct hire cost from bank
            const fin = getFinancialSummary();
            if (fin && candidate.hireCost > 0) {
                const result = await deductBankFunds(candidate.hireCost);
                if (!result.success) {
                    ui.notifications.warn(
                        `WITA | Low funds — ${candidate.hireCost} ${fin.currency ?? "GP"} hire cost ` +
                        `(shortfall: ${result.shortfall} ${fin.currency ?? "GP"}).`
                    );
                }
            }

            // Award recruiter XP directly (bypass facility-match check in awardXP)
            if (entry.recruiterWorkerId && candidate.recruiterXPKey) {
                const freshData       = getBastionData();
                const recruiterWorker = (freshData.workers ?? []).find(w => w.id === entry.recruiterWorkerId);
                if (recruiterWorker) {
                    _awardRecruiterXP(recruiterWorker, candidate.recruiterXPKey);
                    await saveBastionData(freshData);
                }
            }

            // Remove hired candidate from the pool
            await this._removeCandidate(candidateId);

            ui.notifications.info(`WITA | ${sanitizeHTML(candidate.name)} hired.`);
            const panel = foundry.applications.instances.get("wita-bastion-panel");
            if (panel?.rendered) panel.render({ force: true });
            await this.render({ force: true });

        } catch (e) {
            console.error("WITA | Hire failed:", e);
            ui.notifications.error("WITA | Hire failed — see console for details.");
            this.element?.querySelectorAll(".wita-hire-btn,.wita-dismiss-btn")
                .forEach(b => b.removeAttribute("disabled"));
        }
    }

    // ── Dismiss ───────────────────────────────────────────────

    async _dismiss(candidateId) {
        if (!game.user.isGM) return;
        await this._removeCandidate(candidateId);
        await this.render({ force: true });
    }

    // ── Candidate pool helpers ────────────────────────────────

    async _removeCandidate(candidateId) {
        let all = {};
        try { all = game.settings.get("wita", "bastionRecruitCandidates") ?? {}; } catch { return; }
        const entry = all[this._slotId];
        if (!entry) return;
        entry.candidates = (entry.candidates ?? []).filter(c => c.id !== candidateId);
        if (!entry.candidates.length) delete all[this._slotId];
        await witaSaveSettingAsGM("bastionRecruitCandidates", all);
    }
}

// ── Award recruiter XP (bypasses facility-match check) ─────────

function _awardRecruiterXP(recruiterWorker, xpKey) {
    const xpGain = WITA_WORKER_PROFESSIONS.recruiter?.xpTable?.[xpKey] ?? 0;
    if (!xpGain) return;

    const profs    = recruiterWorker.professions ?? {};
    const current  = profs.recruiter ?? { xp: 0, level: 1 };
    const profInst = new WITAWorkerProfession("recruiter");
    const oldLevel = profInst._levelForXP(current.xp);
    const newXP    = current.xp + xpGain;
    const newLevel = profInst._levelForXP(newXP);

    recruiterWorker.professions = {
        ...profs,
        recruiter: { xp: newXP, level: newLevel },
    };

    if (newLevel > oldLevel) {
        profInst._postLevelUpChat(recruiterWorker.name, newLevel, { whisperGM: true, speakerAlias: "Bastion" });
    }
}

// ── Candidate card renderer ───────────────────────────────────

function _renderCandidateCard(c, balance, currency) {
    const rarityLabel  = sanitizeHTML(RARITY_LABELS[c.rarity] ?? c.rarity);
    const rarityColour = RARITY_COLOURS[c.rarity] ?? "var(--color-text-primary)";
    const profLabel    = sanitizeHTML(WITA_WORKER_PROFESSIONS[c.primaryProfession]?.label ?? c.primaryProfession);
    const canAfford    = balance >= c.hireCost;

    const professionList = Object.entries(c.professions ?? {})
        .map(([k, v]) => `${sanitizeHTML(WITA_WORKER_PROFESSIONS[k]?.label ?? k)} (${v.xp}xp)`)
        .join(", ");

    return `
        <div class="wita-candidate-card"
             style="border:1px solid var(--color-fieldset-border);border-radius:4px;padding:0.5rem 0.65rem;background:var(--color-bg-form)">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem">
                <div>
                    <div style="font-weight:700;font-size:0.85rem">${sanitizeHTML(c.name)}</div>
                    <div style="font-size:0.7rem;color:var(--color-form-hint);margin-top:0.1rem">
                        ${profLabel}
                        ${c.matchesFacility
                            ? `<span style="color:var(--color-level-success);margin-left:0.35rem">&#10003; facility match</span>`
                            : ""}
                    </div>
                </div>
                <div style="text-align:right;flex-shrink:0">
                    <div style="font-size:0.72rem;font-weight:700;color:${rarityColour}">${rarityLabel}</div>
                    <div style="font-size:0.65rem;color:${canAfford ? "var(--color-level-success)" : "var(--color-level-error)"}">
                        ${c.hireCost} ${sanitizeHTML(currency)}
                    </div>
                </div>
            </div>
            <div style="font-size:0.67rem;color:var(--color-form-hint);margin:0.3rem 0;font-style:italic;line-height:1.35">
                ${sanitizeHTML(c.bio)}
            </div>
            ${professionList
                ? `<div style="font-size:0.63rem;color:var(--color-form-hint);margin-bottom:0.35rem">XP: ${professionList}</div>`
                : ""}
            <div style="display:flex;gap:0.4rem">
                <button class="wita-hire-btn wita-btn" data-candidate-id="${sanitizeHTML(c.id)}"
                    style="flex:1;font-size:0.72rem;${!canAfford ? "border-color:var(--color-level-warning);" : ""}"
                    ${!game.user.isGM ? "disabled" : ""}>
                    <i class="fas fa-user-plus"></i> Hire${!canAfford ? " (low funds)" : ""}
                </button>
                <button class="wita-dismiss-btn wita-btn" data-candidate-id="${sanitizeHTML(c.id)}"
                    style="font-size:0.72rem"
                    ${!game.user.isGM ? "disabled" : ""}>
                    <i class="fas fa-times"></i> Dismiss
                </button>
            </div>
        </div>
    `;
}
