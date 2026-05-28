// ============================================================
// WITA — HIRELING CRUD
// ============================================================

import { sanitizeHTML }                          from "../../core/utils.js";
import { getBastionData, saveBastionData,
         allSlots, WITA_WORKER_STATUSES }        from "../../bastion/data/data.js";

const MORALE_MIN = 0;
const MORALE_MAX = 100;

export function getAllWorkers(data) {
    return data.workers ?? [];
}

export function getWorkersForSlot(data, slotId) {
    const slot = allSlots(data).find(s => s.id === slotId);
    if (!slot) return [];
    return (data.workers ?? []).filter(w => (slot.workerIds ?? []).includes(w.id));
}

export function getUnassignedWorkers(data) {
    const assigned = new Set(allSlots(data).flatMap(s => s.workerIds ?? []));
    return (data.workers ?? []).filter(w => !assigned.has(w.id));
}

export async function createWorker({ name, role, status = "Active", morale = 70, slotId = null } = {}) {
    if (!game.user.isGM) return null;
    const data   = getBastionData();
    const worker = {
        id:     foundry.utils.randomID(10),
        name:   sanitizeHTML(name ?? "Unknown"),
        role:   sanitizeHTML(role ?? ""),
        status: WITA_WORKER_STATUSES.includes(status) ? status : "Active",
        morale: Math.min(Math.max(morale, MORALE_MIN), MORALE_MAX),
        primaryProfession: null,
        professions:       {},
    };
    data.workers = [...(data.workers ?? []), worker];
    if (slotId) {
        _assignWorkerToSlotInData(data, worker.id, slotId);
    }
    await saveBastionData(data);
    return worker.id;
}

export async function updateWorker(workerId, changes) {
    if (!game.user.isGM) return;
    const data = getBastionData();
    const idx  = (data.workers ?? []).findIndex(w => w.id === workerId);
    if (idx === -1) return;
    if (changes.name)           changes.name   = sanitizeHTML(changes.name);
    if (changes.role)           changes.role   = sanitizeHTML(changes.role);
    if (changes.morale !== undefined) {
        changes.morale = Math.min(Math.max(changes.morale, MORALE_MIN), MORALE_MAX);
    }
    data.workers[idx] = foundry.utils.mergeObject(data.workers[idx], changes);
    await saveBastionData(data);
}

export async function deleteWorker(workerId) {
    if (!game.user.isGM) return;
    const data = getBastionData();
    data.workers = (data.workers ?? []).filter(w => w.id !== workerId);
    // Remove from all slot assignments.
    for (const slot of allSlots(data)) {
        slot.workerIds = (slot.workerIds ?? []).filter(id => id !== workerId);
    }
    await saveBastionData(data);
}

export async function assignWorkerToSlot(workerId, targetSlotId) {
    if (!game.user.isGM) return;
    const data = getBastionData();

    // Remove from all current slots first.
    for (const slot of allSlots(data)) {
        slot.workerIds = (slot.workerIds ?? []).filter(id => id !== workerId);
    }

    if (targetSlotId) {
        _assignWorkerToSlotInData(data, workerId, targetSlotId);
    }

    await saveBastionData(data);
}

function _assignWorkerToSlotInData(data, workerId, slotId) {
    const slot  = allSlots(data).find(s => s.id === slotId);
    if (!slot) return;
    const capacity = (slot.hirelingSlots ?? 0) + (slot.defenderSlots ?? 0);
    if ((slot.workerIds ?? []).length >= capacity) {
        ui.notifications.warn(`WITA | "${slot.facilityName ?? "That facility"}" is at full capacity (${capacity}).`);
        return;
    }
    slot.workerIds = [...(slot.workerIds ?? []), workerId];
}
