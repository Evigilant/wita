// ============================================================
// WITA Guildhall — quest-data.js
// Quest storage via world flags
// ============================================================

import { MODULE_ID } from "./config.js"; // MODULE_ID = "wita"

const FLAG_KEY = "guildhallQuests";
const SETTINGS_KEY = "guildhallConfig";

// ── Quest CRUD ────────────────────────────────────────────────

export function getQuests() {
    return game.settings.get(MODULE_ID, FLAG_KEY) ?? [];
}

export async function saveQuests(quests) {
    if (game.user.isGM) return game.settings.set(MODULE_ID, FLAG_KEY, quests);
    return globalThis.WITA?.socket?.executeAsGM("witaSetSetting", FLAG_KEY, quests);
}

export async function createQuest(data) {
    const quests = getQuests();
    const quest = {
        id:               foundry.utils.randomID(),
        name:             data.name ?? "Unnamed Quest",
        description:      data.description ?? "",
        sourceType:       data.sourceType ?? "manual",   // "manual" | "fql" | "cc"
        sourceId:         data.sourceId ?? null,          // journal UUID or "journalId::questId"
        dangerLevel:      data.dangerLevel ?? 2,
        rewardLevel:      data.rewardLevel ?? 2,
        rewardNarrative:  data.rewardNarrative ?? [],     // [{ name, img }] — shown in chat
        rewardItems:      data.rewardItems ?? [],          // [{ uuid, qty }] — Item Piles delivery
        rewardGold:       data.rewardGold ?? 0,
        maxSlots:         4,
        assignedActorIds: [],                              // world actor IDs
        status:           "available",
        turnAssigned:     null,
        outcome:          null,
        createdAt:        Date.now(),
    };
    quests.push(quest);
    await saveQuests(quests);
    return quest;
}

export async function updateQuest(id, changes) {
    const quests = getQuests();
    const idx = quests.findIndex(q => q.id === id);
    if (idx < 0) return null;
    quests[idx] = foundry.utils.mergeObject(quests[idx], changes, { inplace: false });
    await saveQuests(quests);
    return quests[idx];
}

export async function deleteQuest(id) {
    const quests = getQuests().filter(q => q.id !== id);
    await saveQuests(quests);
}

export function getQuestById(id) {
    return getQuests().find(q => q.id === id) ?? null;
}

// ── Settings ──────────────────────────────────────────────────

export function getGuildhallSettings() {
    return game.settings.get(MODULE_ID, SETTINGS_KEY) ?? {};
}

export async function saveGuildhallSettings(data) {
    const current = getGuildhallSettings();
    const merged = { ...current, ...data };
    if (game.user.isGM) return game.settings.set(MODULE_ID, SETTINGS_KEY, merged);
    return globalThis.WITA?.socket?.executeAsGM("witaSetSetting", SETTINGS_KEY, merged);
}

// ── Capacity helpers ──────────────────────────────────────────

export function getGuildhallCapacity() {
    import("./config.js").then(({ GUILDHALL_ITEM_ID, GUILDHALL_CAPACITY }) => {});
    // Inline to avoid circular — resolved in resolution.js and board
}

// ── Hireling helpers ──────────────────────────────────────────

/** All actor IDs currently assigned to any active quest */
export function getDispatchedActorIds() {
    return getQuests()
        .filter(q => q.status === "active")
        .flatMap(q => q.assignedActorIds);
}

/** Assign an actor to a quest — validates slot count and not already dispatched */
export async function assignActorToQuest(questId, actorId) {
    const quest = getQuestById(questId);
    if (!quest) throw new Error(`Quest ${questId} not found`);
    if (quest.assignedActorIds.length >= quest.maxSlots)
        throw new Error("Quest is full (max 4 hirelings)");
    if (getDispatchedActorIds().includes(actorId))
        throw new Error("This hireling is already on a quest");
    if (quest.assignedActorIds.includes(actorId))
        throw new Error("Already assigned to this quest");
    return updateQuest(questId, {
        assignedActorIds: [...quest.assignedActorIds, actorId],
    });
}

export async function unassignActorFromQuest(questId, actorId) {
    const quest = getQuestById(questId);
    if (!quest) return;
    return updateQuest(questId, {
        assignedActorIds: quest.assignedActorIds.filter(id => id !== actorId),
    });
}

/** Dispatch a quest — marks it active and records the turn number */
export async function dispatchQuest(questId, turnNumber) {
    const quest = getQuestById(questId);
    if (!quest) throw new Error(`Quest ${questId} not found`);
    if (quest.assignedActorIds.length === 0)
        throw new Error("Cannot dispatch a quest with no hirelings assigned");
    return updateQuest(questId, {
        status:       "active",
        turnAssigned: turnNumber,
    });
}
