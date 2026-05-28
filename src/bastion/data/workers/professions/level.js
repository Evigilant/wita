// ============================================================
// WITA — WORKER PROFESSION LEVELING
// XP/level tracking stored on worker objects (not actor flags).
// Callers must save bastion data after calling awardXP().
// ============================================================

import {
    WITA_WORKER_PROFESSIONS, WITA_DEFENDER_RANKS,
    CROSS_TRAIN_THRESHOLD, CROSS_TRAIN_RATE,
    getProfessionForFacility,
} from "./config.js";
import { allSlots } from "../../data.js";

export class WITAWorkerProfession {
    constructor(professionKey) {
        this._key    = professionKey;
        this._config = WITA_WORKER_PROFESSIONS[professionKey] ?? null;
    }

    _profData(worker) {
        return (worker.professions ?? {})[this._key] ?? { xp: 0, level: 1 };
    }

    _levelForXP(xp) {
        const table = this._config?.levelTable ?? [];
        let lvl = 1;
        for (const row of table) {
            if (xp >= row.xp) lvl = row.level;
        }
        return lvl;
    }

    getLevel(worker)  { return this._levelForXP(this._profData(worker).xp); }
    getBonus(worker)  { return this._config?.levelTable.find(r => r.level === this.getLevel(worker))?.bonus ?? 0; }
    getTitle(worker)  { return this._config?.levelTable.find(r => r.level === this.getLevel(worker))?.title ?? ""; }

    getState(worker) {
        const { xp }  = this._profData(worker);
        const level   = this._levelForXP(xp);
        const table   = this._config?.levelTable ?? [];
        const row     = table.find(r => r.level === level);
        const nextRow = table.find(r => r.level === level + 1);
        const curBase = row?.xp ?? 0;
        const next    = nextRow?.xp ?? null;
        const curXP   = xp - curBase;
        const span    = next !== null ? next - curBase : 1;
        const pct     = next !== null ? Math.min(100, Math.round((curXP / span) * 100)) : 100;
        return {
            level, xp, bonus: row?.bonus ?? 0, title: row?.title ?? "",
            next, curXP, span, pct,
        };
    }

    /**
     * Award XP to a worker for a given event.
     * Applies cross-training reduction if the facility doesn't match their primary profession.
     *
     * @param {object} worker       - worker object (mutated)
     * @param {string} eventKey     - key from config.xpTable
     * @param {object} bastionData  - full bastion data (used to look up assigned facility)
     * @returns {{ leveled: boolean, oldLevel: number, newLevel: number }}
     */
    awardXP(worker, eventKey, bastionData) {
        if (!this._config) return { leveled: false, oldLevel: 1, newLevel: 1 };

        const baseXP = this._config.xpTable[eventKey] ?? 0;
        if (!baseXP) return { leveled: false, oldLevel: 1, newLevel: 1 };

        // Determine assigned facility
        const slots        = allSlots(bastionData);
        const workerSlot   = slots.find(s => (s.workerIds ?? []).includes(worker.id));
        const facilityProf = workerSlot ? getProfessionForFacility(workerSlot.facilityName) : null;

        // Cross-training rate calculation
        let earnedXP = baseXP;
        const isPrimary = worker.primaryProfession === this._key;
        if (facilityProf !== this._key) {
            // Not the right facility for this profession
            if (isPrimary) {
                // Primary assigned to wrong facility → no XP this turn
                return { leveled: false, oldLevel: this.getLevel(worker), newLevel: this.getLevel(worker) };
            }
            // Cross-training: reduced XP until level 2
            if (this.getLevel(worker) < CROSS_TRAIN_THRESHOLD) {
                earnedXP = Math.floor(baseXP * CROSS_TRAIN_RATE);
            }
        }

        const professions = worker.professions ?? {};
        const current     = professions[this._key] ?? { xp: 0, level: 1 };
        const oldLevel    = this._levelForXP(current.xp);
        const newXP       = current.xp + earnedXP;
        const newLevel    = this._levelForXP(newXP);

        worker.professions = {
            ...professions,
            [this._key]: { xp: newXP, level: newLevel },
        };

        const leveled = newLevel > oldLevel;
        if (leveled) {
            WITAWorkerProfession._postLevelUpChat(worker, oldLevel, newLevel, this._config);
        }

        return { leveled, oldLevel, newLevel };
    }

    static _postLevelUpChat(worker, oldLevel, newLevel, config) {
        const row = config.levelTable.find(r => r.level === newLevel);
        ChatMessage.create({
            content: `
                <div style="font-family:var(--font-primary,Signika);padding:0.5rem">
                    <h3 style="margin:0 0 0.4rem;color:var(--color-level-success)">
                        ⬆ ${config.label} Level Up!
                    </h3>
                    <p style="margin:0 0 0.25rem"><strong>${worker.name}</strong> is now a
                        <em>${row?.title ?? `Level ${newLevel}`}</em>
                        (${config.label} Lv ${newLevel}).
                    </p>
                    <p style="font-size:0.75rem;color:var(--color-form-hint);margin:0">
                        <i class="${config.icon}"></i> +${row?.bonus ?? 0} bonus to relevant rolls.
                    </p>
                </div>
            `,
            whisper: ChatMessage.getWhisperRecipients("GM"),
            speaker: { alias: "Bastion" },
        });
    }
}

/**
 * Award guardXP to a defender and handle rank promotion.
 * Mutates defender. Caller saves bastion data.
 *
 * @param {object} defender  - defender object
 * @param {string} eventKey  - "turnPatrol" | "crisisSurvival"
 * @returns {{ promoted: boolean, oldRank: string, newRank: string }}
 */
export function awardDefenderXP(defender, eventKey) {
    const XP_TABLE = {
        turnPatrol:    20,
        crisisSurvival:60,
    };
    const xpGain = XP_TABLE[eventKey] ?? 0;
    if (!xpGain) return { promoted: false, oldRank: defender.rank ?? "recruit", newRank: defender.rank ?? "recruit" };

    defender.guardXP  = (defender.guardXP ?? 0) + xpGain;
    const oldRank     = defender.rank ?? "recruit";
    let   newRank     = "recruit";

    for (const row of WITA_DEFENDER_RANKS) {
        if (defender.guardXP >= row.xp) newRank = row.rank;
    }

    const promoted = newRank !== oldRank;
    defender.rank  = newRank;

    if (promoted) {
        const rankRow = WITA_DEFENDER_RANKS.find(r => r.rank === newRank);
        ChatMessage.create({
            content: `
                <div style="font-family:var(--font-primary,Signika);padding:0.5rem">
                    <h3 style="margin:0 0 0.4rem;color:var(--color-level-success)">⬆ Defender Promoted!</h3>
                    <p style="margin:0"><strong>${defender.name}</strong> is now a
                        <em>${rankRow?.label ?? newRank}</em>.
                    </p>
                </div>
            `,
            whisper: ChatMessage.getWhisperRecipients("GM"),
            speaker: { alias: "Bastion" },
        });
    }

    return { promoted, oldRank, newRank };
}
