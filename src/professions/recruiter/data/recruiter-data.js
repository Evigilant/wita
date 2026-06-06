// ============================================================
// WITA — RECRUITER DATA
// Candidate generation logic, name/bio generation.
// ============================================================

import { witaRoll }                        from "../../../core/utils.js";
import { WITA_WORKER_PROFESSIONS,
         PROFESSION_PROGRESSION }          from "../../workers/config.js";
import { WEEKLY_WAGES }                    from "../../../bastion/data/finance.js";
import {
    RARITY_THRESHOLDS, XP_DISTRIBUTION_BANDS,
    FACILITY_DOMINANT_PROF, NAME_TABLES, BIO_TABLES,
} from "./recruiter-config.js";

// ── Helpers ────────────────────────────────────────────────────

function _pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function _rarityForRoll(roll) {
    // Thresholds are ordered highest-first; return first where roll >= min.
    return RARITY_THRESHOLDS.find(t => roll >= t.min) ?? RARITY_THRESHOLDS[RARITY_THRESHOLDS.length - 1];
}

function _distributionForRoll(roll) {
    return (XP_DISTRIBUTION_BANDS.find(b => roll <= b.max) ?? XP_DISTRIBUTION_BANDS.at(-1)).primary;
}

function _levelForXP(xp) {
    return [...PROFESSION_PROGRESSION].reverse().find(r => xp >= r.xp)?.level ?? 1;
}

function _hireCostForTier(rarityTier) {
    const level      = _levelForXP(rarityTier.xpPrimary);
    const weeklyWage = WEEKLY_WAGES[level] ?? 1.4;
    return Math.round(weeklyWage * (rarityTier.hirecostWeeks ?? 5));
}

// ── Name / bio ─────────────────────────────────────────────────

export function generateName(profession) {
    const table = NAME_TABLES[profession] ?? NAME_TABLES.default;
    const first = _pick(table.first);
    const last  = _pick(table.last);
    if (table.format) {
        const suffix = _pick(table.numSuffix ?? ["I"]);
        return table.format(first, last, suffix);
    }
    return `${first} ${last}`;
}

export function generateBio(profession) {
    const table = BIO_TABLES[profession] ?? BIO_TABLES.default;
    return [_pick(table.origin), _pick(table.service), _pick(table.trait)].join(" ");
}

// ── XP builder ────────────────────────────────────────────────

function _buildProfessionXP(primaryProf, totalXP, primaryPct, allProfKeys) {
    const primaryXP   = Math.round(totalXP * primaryPct);
    const secondaryXP = Math.max(0, totalXP - primaryXP);
    const professions = {};

    if (primaryXP > 0) professions[primaryProf] = { xp: primaryXP, level: 1 };

    // Distribute remainder to 2 random secondaries (excluding primary and recruiter)
    const pool = allProfKeys.filter(k => k !== primaryProf && k !== "recruiter");
    if (secondaryXP > 0 && pool.length >= 2) {
        const idxA = Math.floor(Math.random() * pool.length);
        const secA = pool.splice(idxA, 1)[0];
        const secB = pool[Math.floor(Math.random() * pool.length)];
        const half = Math.floor(secondaryXP / 2);
        if (half > 0) {
            professions[secA] = { xp: half, level: 1 };
            if (secB && secB !== secA) professions[secB] = { xp: half, level: 1 };
        }
    }

    return professions;
}

// ── Single candidate builder ───────────────────────────────────

function _generateCandidate(primaryProf, matchesFacility, modifier, allProfKeys, r6Raw) {
    const r100Raw    = witaRoll(100);
    const r100Total  = Math.min(100, r100Raw + modifier);
    const rarityTier = _rarityForRoll(r100Total);

    const r20Raw     = witaRoll(20);
    const r20Total   = r20Raw + modifier;
    const primaryPct = _distributionForRoll(r20Total);

    return {
        id:               foundry.utils.randomID(10),
        name:             generateName(primaryProf),
        bio:              generateBio(primaryProf),
        primaryProfession: primaryProf,
        rarity:           rarityTier.rarity,
        professions:      _buildProfessionXP(primaryProf, rarityTier.xpPrimary, primaryPct, [...allProfKeys]),
        morale:           70,
        matchesFacility,
        rollResults:      { r6: r6Raw, r100: r100Raw, r20: r20Raw },
        hireCost:         _hireCostForTier(rarityTier),
        recruiterXPKey:   rarityTier.recruiterXPKey,
    };
}

// ── Main entry point ───────────────────────────────────────────

/**
 * Generate a pool of NPC candidates for a facility slot.
 * @param {object} slot            — bastion slot object (facilityName, workerIds, etc.)
 * @param {object} recruiterWorker — worker object with primaryProfession = "recruiter"
 * @returns {{ candidates, rollSummary }}
 */
export function generateCandidates(slot, recruiterWorker) {
    const profData    = (recruiterWorker?.professions ?? {}).recruiter ?? { xp: 0, level: 1 };
    const level       = profData.level ?? 1;
    const modifier    = level - 1;
    const allProfKeys = Object.keys(WITA_WORKER_PROFESSIONS).filter(k => k !== "recruiter");

    // Dominant profession for this facility type
    const facilityLower = (slot.facilityName ?? "").toLowerCase();
    let dominantProf = null;
    for (const [key, prof] of Object.entries(FACILITY_DOMINANT_PROF)) {
        if (facilityLower.includes(key)) { dominantProf = prof; break; }
    }

    // 1d6 + modifier → how many of 4 candidates match the facility profession
    const r6Raw      = witaRoll(6);
    const r6Total    = r6Raw + modifier;
    const matchCount = Math.min(4, Math.max(0, r6Total));

    // Crit: raw die >= (7 - level) → +1 bonus candidate
    const isCrit     = r6Raw >= (7 - level);
    const totalCount = isCrit ? 5 : 4;

    const candidates = [];

    for (let i = 0; i < 4; i++) {
        const matchesFacility = !!dominantProf && i < matchCount;
        const primaryProf = matchesFacility
            ? dominantProf
            : allProfKeys[Math.floor(Math.random() * allProfKeys.length)];
        candidates.push(_generateCandidate(primaryProf, matchesFacility, modifier, allProfKeys, r6Raw));
    }

    // Crit bonus candidate — dominant profession if known, otherwise random
    if (isCrit) {
        const primaryProf = dominantProf ?? allProfKeys[Math.floor(Math.random() * allProfKeys.length)];
        candidates.push(_generateCandidate(primaryProf, !!dominantProf, modifier, allProfKeys, r6Raw));
    }

    return {
        candidates,
        rollSummary: { r6Raw, r6Total, matchCount, isCrit, totalCount, modifier, level },
    };
}
