// ============================================================
// WITA Guildhall — cc-importer.js
// Import quests from Campaign Codex
// ============================================================

import { CC_URGENCY_TO_DANGER } from "../core/config.js";

const CC_MODULE = "campaign-codex";

/**
 * CC quests are embedded arrays inside journal entry flags:
 * journal.flags["campaign-codex"].data.quests[]
 * Each quest has: id, title, description, urgency, boardColumn,
 * objectives[], rewardCurrency, rewardXP, rewardReputation
 */
export function getCCImportCandidates() {
    if (!game.modules.get(CC_MODULE)?.active) return [];

    const candidates = [];

    for (const journal of game.journal) {
        const ccFlags = journal.flags?.[CC_MODULE];
        if (!ccFlags) continue;
        const quests = ccFlags.data?.quests ?? [];
        if (!quests.length) continue;

        for (const quest of quests) {
            // Only import active/available quests — skip completed/failed
            if (quest.completed || quest.failed) continue;
            // boardColumn: "active" | "available" | "completed" etc
            const col = quest.boardColumn ?? "active";
            if (col === "completed" || col === "failed") continue;

            candidates.push({
                journalId:  journal.id,
                questId:    quest.id,
                sourceId:   `${journal.id}::${quest.id}`,
                name:       quest.title ?? "Unnamed Quest",
                description: quest.description ?? "",
                urgency:    quest.urgency ?? "medium",
                boardColumn: col,
                objectives: flattenObjectives(quest.objectives ?? []),
                rewardCurrency:    quest.rewardCurrency ?? 0,
                rewardXP:          quest.rewardXP ?? 0,
                rewardReputation:  quest.rewardReputation ?? 0,
            });
        }
    }

    return candidates;
}

/** Flatten nested CC objectives into a flat string list */
function flattenObjectives(objectives, depth = 0) {
    const result = [];
    for (const obj of objectives) {
        const prefix = "  ".repeat(depth) + "•";
        result.push(`${prefix} ${obj.text}`);
        if (obj.objectives?.length) {
            result.push(...flattenObjectives(obj.objectives, depth + 1));
        }
    }
    return result;
}

/** Convert a CC candidate into a quest creation payload */
export function ccToQuestPayload(candidate) {
    const dangerLevel = CC_URGENCY_TO_DANGER[candidate.urgency] ?? 2;

    let description = candidate.description ?? "";
    if (candidate.objectives?.length > 0) {
        const objText = candidate.objectives.join("\n");
        description += description ? `\n\n**Objectives:**\n${objText}` : objText;
    }

    // CC rewards are mostly narrative (XP, reputation) — map to rewardNarrative
    const rewardNarrative = [];
    if (candidate.rewardXP > 0)
        rewardNarrative.push({ name: `${candidate.rewardXP} XP`, img: "icons/svg/aura.svg" });
    if (candidate.rewardReputation > 0)
        rewardNarrative.push({ name: `+${candidate.rewardReputation} Reputation`, img: "icons/svg/ice-aura.svg" });

    return {
        name:            candidate.name,
        description,
        sourceType:      "cc",
        sourceId:        candidate.sourceId,
        dangerLevel,
        rewardLevel:     2,   // default — GM adjusts after import
        rewardNarrative,
        rewardItems:     [],
        rewardGold:      candidate.rewardCurrency ?? 0,
    };
}
