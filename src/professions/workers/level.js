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
import { allSlots } from "../../bastion/data/data.js";
import { WITABaseProfession } from "../core/base-level.js";

export class WITAWorkerProfession extends WITABaseProfession {
    constructor(professionKey) {
        super();
        this._key       = professionKey;
        this._config    = WITA_WORKER_PROFESSIONS[professionKey] ?? null;
        this.levelTable = this._config?.levelTable ?? [];
        this.label      = this._config?.label ?? professionKey;
        this.icon       = this._config?.icon ?? "";
    }

    _profData(worker) {
        return (worker.professions ?? {})[this._key] ?? { xp: 0, level: 1 };
    }

    getLevel(worker) { return this._levelForXP(this._profData(worker).xp); }
    getBonus(worker) { return this.levelTable.find(r => r.level === this.getLevel(worker))?.bonus ?? 0; }
    getTitle(worker) { return this.levelTable.find(r => r.level === this.getLevel(worker))?.title ?? ""; }
    getState(worker) { return this._getState(this._profData(worker).xp); }

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

        const slots        = allSlots(bastionData);
        const workerSlot   = slots.find(s => (s.workerIds ?? []).includes(worker.id));
        const facilityProf = workerSlot ? getProfessionForFacility(workerSlot.facilityName) : null;

        let earnedXP    = baseXP;
        const isPrimary = worker.primaryProfession === this._key;
        if (facilityProf !== this._key) {
            if (isPrimary) {
                return { leveled: false, oldLevel: this.getLevel(worker), newLevel: this.getLevel(worker) };
            }
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
            this._postLevelUpChat(worker.name, newLevel, { whisperGM: true, speakerAlias: "Bastion" });
        }

        return { leveled, oldLevel, newLevel };
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
        turnPatrol:     20,
        crisisSurvival: 60,
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
