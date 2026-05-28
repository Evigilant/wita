// ============================================================
// WITA Guildhall — fql-importer.js
// Import quests from Forien's Quest Log
// ============================================================

import { CC_URGENCY_TO_DANGER } from "../core/config.js";

const FQL_MODULE  = "forien-quest-log";
const FQL_FOLDER  = "_fql_quests";
const IMPORTABLE  = new Set(["active", "available"]);

/** Returns all FQL quests eligible for import (active + available) */
export function getFQLImportCandidates() {
    if (!game.modules.get(FQL_MODULE)?.active) return [];

    const folder = game.folders.find(f => f.name === FQL_FOLDER);
    if (!folder) return [];

    return game.journal
        .filter(j => j.folder?.id === folder.id)
        .map(j => {
            const data = j.flags?.[FQL_MODULE]?.json;
            if (!data) return null;
            if (!IMPORTABLE.has(data.status)) return null;
            return {
                journalId:   j.id,
                uuid:        j.uuid,
                name:        data.name ?? j.name,
                description: data.description ?? "",
                status:      data.status,
                giver:       data.giverData?.name ?? null,
                giverImg:    data.giverData?.img ?? null,
                tasks:       (data.tasks ?? []).map(t => t.name),
                rewards:     data.rewards ?? [],
            };
        })
        .filter(Boolean);
}

/** Convert a FQL candidate into a quest creation payload */
export function fqlToQuestPayload(candidate) {
    // FQL rewards are mostly Abstract (narrative) — map to rewardNarrative
    // Item-type rewards (type === "Item") could be mapped to rewardItems if uuid present
    const rewardNarrative = [];
    const rewardItems     = [];
    let   rewardGold      = 0;

    for (const r of candidate.rewards ?? []) {
        if (r.type === "Item" && r.data?.uuid) {
            rewardItems.push({ uuid: r.data.uuid, qty: 1 });
        } else if (r.type === "Currency" && r.data?.currency) {
            rewardGold += Number(r.data.currency) || 0;
        } else if (r.data?.name) {
            rewardNarrative.push({ name: r.data.name, img: r.data.img ?? null });
        }
    }

    // Build description: FQL description + task list as context
    let description = candidate.description ?? "";
    if (candidate.tasks?.length > 0) {
        const taskList = candidate.tasks.map(t => `• ${t}`).join("\n");
        description += description ? `\n\n**Objectives:**\n${taskList}` : taskList;
    }

    return {
        name:            candidate.name,
        description,
        sourceType:      "fql",
        sourceId:        candidate.uuid,
        dangerLevel:     2,   // default — GM adjusts after import
        rewardLevel:     2,   // default — GM adjusts after import
        rewardNarrative,
        rewardItems,
        rewardGold,
    };
}
