// ============================================================
// WITA — MORALE TICKS
// Applies per-turn morale changes to all workers.
// ============================================================

import { allSlots, WITA_MORALE_TICK } from "../data.js";

const MORALE_MIN = 0;
const MORALE_MAX = 100;

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
