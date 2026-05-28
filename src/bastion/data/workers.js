// ============================================================
// WITA — BASTION WORKERS & DEFENDERS
// Hireling CRUD, defender roster, morale ticks,
// turn-end morale application.
// ============================================================

import { sanitizeHTML }                from "../../core/utils.js";
import { getBastionData, saveBastionData,
         allSlots, WITA_WORKER_STATUSES,
         WITA_MORALE_TICK }            from "./data.js";

const MORALE_MIN = 0;
const MORALE_MAX = 100;

// ── Hireling queries ──────────────────────────────────────────

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

// ── Hireling CRUD ─────────────────────────────────────────────

export async function createWorker({ name, role, status = "Active", morale = 70, slotId = null } = {}) {
    if (!game.user.isGM) return null;
    const data   = getBastionData();
    const worker = {
        id:     foundry.utils.randomID(10),
        name:   sanitizeHTML(name ?? "Unknown"),
        role:   sanitizeHTML(role ?? ""),
        status: WITA_WORKER_STATUSES.includes(status) ? status : "Active",
        morale: Math.min(Math.max(morale, MORALE_MIN), MORALE_MAX),
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

// ── Defender roster ───────────────────────────────────────────

export async function addDefender(name) {
    if (!game.user.isGM) return;
    const data = getBastionData();
    data.defenders = [...(data.defenders ?? []), {
        id:    foundry.utils.randomID(8),
        name:  sanitizeHTML(name ?? `Defender ${(data.defenders?.length ?? 0) + 1}`),
        alive: true,
    }];
    await saveBastionData(data);
}

export async function removeDefender(defenderId) {
    if (!game.user.isGM) return;
    const data = getBastionData();
    data.defenders = (data.defenders ?? []).filter(d => d.id !== defenderId);
    await saveBastionData(data);
}

export async function setDefenderAlive(defenderId, alive) {
    if (!game.user.isGM) return;
    const data = getBastionData();
    const d    = (data.defenders ?? []).find(d => d.id === defenderId);
    if (d) { d.alive = alive; await saveBastionData(data); }
}

export function liveDefenderCount(data) {
    return (data.defenders ?? []).filter(d => d.alive).length;
}

// ── Morale ticks (called from runBastionTurn) ─────────────────

/**
 * Applies per-turn morale changes to all workers.
 * Uses WITA_MORALE_TICK deltas based on:
 *   - Kitchen / Barracks infrastructure presence
 *   - Event category (Crisis → worst facility workers get extra hit)
 *   - Whether worker's assigned facility was Destroyed
 *
 * @param {object}   data            - full bastion data (mutated, must be saved by caller)
 * @param {object}   event           - from rollBastionEvent()
 * @param {object[]} facilityResults - from processFacilities()
 */
export function applyMoraleTick(data, event, facilityResults) {
    const slots   = allSlots(data);
    const workers = data.workers ?? [];

    // Infrastructure checks — exact DMG facility names.
    const hasKitchen  = slots.some(s =>
        s.facilityName?.match(/^kitchen$/i) && s.health !== "Destroyed"
    );
    const hasBarracks = slots.some(s =>
        s.facilityName?.match(/^barrack$|^bedroom$/i) && s.health !== "Destroyed"
    );

    const globalDelta = (hasKitchen  ? WITA_MORALE_TICK.hasKitchen  : WITA_MORALE_TICK.noKitchen)
                      + (hasBarracks ? WITA_MORALE_TICK.hasBarracks : WITA_MORALE_TICK.noBarracks);

    // Determine which slot took the worst hit this turn.
    const categoryName = event?.categoryName ?? "";
    const isCrisis     = categoryName === "Crisis";
    const isSetback    = categoryName === "Setback";
    let   damagedSlotId = null;

    if (isCrisis || isSetback) {
        const worst = (facilityResults ?? [])
            .filter(r => r.maxRoll)
            .sort((a, b) => (a.roll / a.maxRoll) - (b.roll / b.maxRoll))[0];
        if (worst) {
            const match = slots.find(s =>
                s.facilityName?.toLowerCase() === (worst.name ?? "").toLowerCase()
            );
            damagedSlotId = match?.id ?? null;
        }
    }

    for (const worker of workers) {
        let delta = globalDelta;

        if (damagedSlotId) {
            const inDamaged = slots.find(s => s.id === damagedSlotId)
                ?.workerIds?.includes(worker.id);
            if (inDamaged) {
                delta += isCrisis ? WITA_MORALE_TICK.crisisFacility
                                  : WITA_MORALE_TICK.setbackFacility;
            }
        }

        const workerSlot = slots.find(s => (s.workerIds ?? []).includes(worker.id));
        if (workerSlot?.health === "Destroyed") {
            delta += WITA_MORALE_TICK.facilityDestroyed;
        }

        worker.morale = Math.min(Math.max((worker.morale ?? 50) + delta, MORALE_MIN), MORALE_MAX);

        if (worker.morale === 0 && worker.status === "Active") {
            worker.status = "Fled";
            console.log(`WITA | Worker "${worker.name}" fled (morale = 0).`);
        }
    }

    data.workers = workers;
    return data;
}
