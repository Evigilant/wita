// ============================================================
// WITA — BASTION SLOTS
// Slot CRUD, productivity, drag-drop, tier gating,
// health mutation, enlargement.
// ============================================================

import { sanitizeHTML, witaSetting }              from "../core/utils.js";
import { getBastionData, saveBastionData,
         makeEmptySlot, _emptySlotFields,
         allSlots, getAllFacilities,
         WITA_HEALTH_STATES, WITA_HEALTH_MOD,
         WITA_SIZE_MOD, WITA_TIER_SIZES }        from "./bastion-data.js";

const DMG_PACK = "wita.wita-items";

// ── Slot queries ──────────────────────────────────────────────

export function findSlot(data, slotId) {
    return allSlots(data).find(s => s.id === slotId) ?? null;
}

function _poolKey(slot) {
    return slot.facilityType === "basic" ? "basicSlots" : "specialSlots";
}

function _replaceSlot(data, updated) {
    const key = _poolKey(updated);
    data[key]  = (data[key] ?? []).map(s => s.id === updated.id ? updated : s);
    return data;
}

// ── Productivity (special facilities only) ────────────────────

export function calcProductivity(slot, allWorkers) {
    if (!slot.facilityUuid)           return 0;
    if (slot.facilityType === "basic") return null;  // basic = no productivity
    if (slot.health === "Destroyed")  return 0;

    const healthMod = WITA_HEALTH_MOD[slot.health]                     ?? 1;
    const sizeMod   = WITA_SIZE_MOD[slot.facilitySize ?? "cramped"]     ?? WITA_SIZE_MOD.cramped;
    const total     = (slot.hirelingSlots ?? 0) + (slot.defenderSlots ?? 0);
    const assigned  = (slot.workerIds ?? [])
        .map(id => allWorkers.find(w => w.id === id))
        .filter(w => w?.status === "Active");

    const fillRatio = total > 0 ? Math.min(assigned.length / total, 1) : 0;

    const avgMorale = assigned.length
        ? assigned.reduce((s, w) => s + (w.morale ?? 50), 0) / assigned.length
        : 50;

    const effectiveMorale = Math.max(avgMorale, sizeMod.moraleFloor);
    const moraleMod = effectiveMorale < 40 ? 0.50
                    : effectiveMorale < 60 ? 0.80
                    : effectiveMorale < 80 ? 0.95 : 1.00;

    const raw    = healthMod * fillRatio * moraleMod;
    const capped = Math.min(raw, sizeMod.productivityCap);
    return Math.round(capped * 100);
}

// ── Health mutation ───────────────────────────────────────────

export function degradeHealth(h) {
    const i = WITA_HEALTH_STATES.indexOf(h);
    return WITA_HEALTH_STATES[Math.min(i + 1, WITA_HEALTH_STATES.length - 1)];
}

export function repairHealth(h) {
    const i = WITA_HEALTH_STATES.indexOf(h);
    return WITA_HEALTH_STATES[Math.max(i - 1, 0)];
}

// ── Tier gating ───────────────────────────────────────────────

export function validateFacilityDrop(data, facilityMeta, { bypassTier = false } = {}) {
    if (!facilityMeta) return null;
    if (bypassTier) return null;
    const allowed = WITA_TIER_SIZES[data.bastionTier ?? 0] ?? [];
    if (!allowed.includes(facilityMeta.size)) {
        const tierNeeded = Object.entries(WITA_TIER_SIZES)
            .find(([, sizes]) => sizes.includes(facilityMeta.size))?.[0] ?? "higher";
        return `"${facilityMeta.name}" requires a ${facilityMeta.size} facility `
             + `(Bastion Tier ${tierNeeded}). Current tier: ${data.bastionTier ?? 0}.`;
    }
    return null;
}

// ── Facility assignment ───────────────────────────────────────

export async function assignFacilityToSlot(slotId, uuid) {
    if (!game.user.isGM) return;

    const item = await fromUuid(uuid);
    if (!item) { ui.notifications.warn("WITA | Could not load item from UUID."); return; }

    const itemId  = item.id ?? item._id;
    const data    = getBastionData();
    const allFac  = getAllFacilities();
    const cat     = allFac[itemId] ?? {};

    // Tier gating.
    const tierErr = validateFacilityDrop(data, cat.size ? cat : null, { bypassTier: game.user.isGM });
    if (tierErr) { ui.notifications.warn(`WITA | ${tierErr}`); return; }

    const slot = findSlot(data, slotId);
    if (!slot) return;

    // Read live system fields; fall back to catalogue.
    const liveSize  = item.system?.size?.value ?? item.system?.size ?? null;
    const liveOrder = item.system?.order?.value ?? item.system?.order ?? null;
    const liveLevel = item.system?.level?.value ?? item.system?.level ?? null;
    const liveH     = item.system?.hirelings?.max ?? null;
    const liveD     = item.system?.defenders?.max ?? null;

    // All facilities start at Cramped regardless of their catalogue size.
    // The catalogue size is stored as facilityBaseSize for enlargement reference.
    const catalogueSize = liveSize ?? cat.size ?? "cramped";

    slot.facilityUuid     = uuid;
    slot.facilityItemId   = itemId;
    slot.facilityName     = sanitizeHTML(item.name);
    slot.facilityImg      = item.img ?? "icons/svg/castle.svg";
    slot.facilitySize     = "cramped";
    slot.facilityBaseSize = catalogueSize;  // remember catalogue size for enlargement eligibility
    slot.facilityOrder    = liveOrder ?? cat.order   ?? "";
    slot.facilityLevelReq = liveLevel ?? cat.level   ?? null;
    slot.facilityPrereq   = cat.prereq ?? null;
    slot.hirelingSlots    = liveH     ?? cat.hirelings ?? 0;
    slot.defenderSlots    = liveD     ?? cat.defenders ?? 0;
    // Preserve health, workerIds, built on reassignment.

    _replaceSlot(data, slot);
    await saveBastionData(data);
    console.log(`WITA | "${item.name}" → slot ${slotId} (${slot.facilitySize})`);
    // Hook: fires when a facility is assigned to a slot
    Hooks.callAll("wita.facilityAssigned", slot, item);
}

export async function clearSlot(slotId) {
    if (!game.user.isGM) return;
    const data = getBastionData();
    const slot = findSlot(data, slotId);
    if (!slot) return;
    const prevSlot = foundry.utils.deepClone(slot);
    Object.assign(slot, _emptySlotFields());
    _replaceSlot(data, slot);
    await saveBastionData(data);
    // Hook: fires when a facility slot is cleared
    Hooks.callAll("wita.facilityCleared", prevSlot);
}

// ── Enlargement (Roomy → Vast) ────────────────────────────────

/**
 * Enlarges a facility slot from Roomy to Vast.
 * Updates size, hirelingSlots, defenderSlots per catalogue rules.
 */
export async function enlargeSlot(slotId, { bypassLicenseCheck = false } = {}) {
    if (!game.user.isGM) return;
    const data   = getBastionData();
    const slot   = findSlot(data, slotId);
    if (!slot?.facilityUuid) return;

    const sizes = ["cramped", "roomy", "vast"];
    const idx   = sizes.indexOf(slot.facilitySize);

    if (idx >= sizes.length - 1) {
        ui.notifications.warn("WITA | This facility is already Vast.");
        return;
    }

    const newSize = sizes[idx + 1];

    // Check size license availability (skip for GM override)
    if (!bypassLicenseCheck) {
        const limits = getSizeLimits(data);
        if (newSize === "roomy" && limits.availRoomy <= 0) {
            ui.notifications.warn(`WITA | No Roomy slots available (${limits.usedRoomy}/${limits.maxRoomy} used). Purchase a Roomy Slot License or increase tier limits.`);
            return;
        }
        if (newSize === "vast" && limits.availVast <= 0) {
            ui.notifications.warn(`WITA | No Vast slots available (${limits.usedVast}/${limits.maxVast} used). Purchase a Vast Slot License or increase tier limits.`);
            return;
        }
    }

    const allFac  = getAllFacilities();
    const cat     = allFac[slot.facilityItemId] ?? {};

    slot.facilitySize = newSize;

    // Apply enlargement bonuses only on the final step (roomy → vast)
    if (newSize === "vast") {
        slot.hirelingSlots = (slot.hirelingSlots ?? 0) + (cat.enlargeHirelings ?? 0);
        slot.defenderSlots = cat.enlargeDefenders > 0
            ? cat.enlargeDefenders
            : slot.defenderSlots;
    }

    _replaceSlot(data, slot);
    await saveBastionData(data);
    ui.notifications.info(`WITA | ${slot.facilityName} enlarged to ${newSize}.`);
}

export async function shrinkSlot(slotId) {
    if (!game.user.isGM) return;
    const data = getBastionData();
    const slot = findSlot(data, slotId);
    if (!slot?.facilityUuid) return;

    const sizes = ["cramped", "roomy", "vast"];
    const idx   = sizes.indexOf(slot.facilitySize);
    if (idx <= 0) {
        ui.notifications.warn("WITA | This facility is already Cramped.");
        return;
    }

    const allFac = getAllFacilities();
    const cat    = allFac[slot.facilityItemId] ?? {};

    slot.facilitySize = sizes[idx - 1];

    // Reverse enlargement bonuses when shrinking from vast → roomy
    if (slot.facilitySize === "roomy") {
        slot.hirelingSlots = Math.max(0, (slot.hirelingSlots ?? 0) - (cat.enlargeHirelings ?? 0));
        if (cat.enlargeDefenders > 0) slot.defenderSlots = cat.defenders ?? 0;
    }

    _replaceSlot(data, slot);
    await saveBastionData(data);
    ui.notifications.info(`WITA | ${slot.facilityName} shrunk to ${slot.facilitySize}.`);
}

// ── Slot capacity editing ─────────────────────────────────────

export async function adjustSlotCapacity(slotId, field, delta) {
    if (!game.user.isGM) return;
    if (field !== "hirelingSlots" && field !== "defenderSlots") return;
    const data = getBastionData();
    const slot = findSlot(data, slotId);
    if (!slot) return;
    slot[field] = Math.max(0, (slot[field] ?? 0) + delta);
    _replaceSlot(data, slot);
    await saveBastionData(data);
}

export async function setSlotHealth(slotId, health) {
    if (!game.user.isGM) return;
    if (!WITA_HEALTH_STATES.includes(health)) return;
    const data = getBastionData();
    const slot = findSlot(data, slotId);
    if (!slot) return;
    slot.health = health;
    if (health === "Destroyed") slot.workerIds = [];
    _replaceSlot(data, slot);
    await saveBastionData(data);
}

// ── Slot pool management ──────────────────────────────────────

export async function addSlot(facilityType) {
    if (!game.user.isGM) return;
    const data = getBastionData();
    const key  = facilityType === "basic" ? "basicSlots" : "specialSlots";
    data[key]  = [...(data[key] ?? []), makeEmptySlot(facilityType)];
    await saveBastionData(data);
}

export async function removeLastEmptySlot(facilityType) {
    if (!game.user.isGM) return;
    const data  = getBastionData();
    const key   = facilityType === "basic" ? "basicSlots" : "specialSlots";
    const slots = [...(data[key] ?? [])];
    for (let i = slots.length - 1; i >= 0; i--) {
        if (!slots[i].facilityUuid) { slots.splice(i, 1); break; }
    }
    data[key] = slots;
    await saveBastionData(data);
}

// ── Bastion tier ──────────────────────────────────────────────

// ── Size license helpers ──────────────────────────────────────

export function getSizeLimits(data) {
    const tier        = data.bastionTier ?? 0;
    let roomyLimits, vastLimits;
    try { roomyLimits = JSON.parse(witaSetting("tierRoomyLimits") ?? '{"1":1,"2":2,"3":4}'); } catch { roomyLimits = {1:1,2:2,3:4}; }
    try { vastLimits  = JSON.parse(witaSetting("tierVastLimits")  ?? '{"1":0,"2":1,"3":2}'); } catch { vastLimits  = {1:0,2:1,3:2}; }
    const baseRoomy   = roomyLimits[tier] ?? roomyLimits[String(tier)] ?? 0;
    const baseVast    = vastLimits[tier]  ?? vastLimits[String(tier)]  ?? 0;
    const allSlots    = [...(data.basicSlots ?? []), ...(data.specialSlots ?? [])];
    const usedRoomy   = allSlots.filter(s => s.facilitySize === "roomy").length;
    const usedVast    = allSlots.filter(s => s.facilitySize === "vast").length;
    const maxRoomy    = baseRoomy + (data.roomyLicenses ?? 0);
    const maxVast     = baseVast  + (data.vastLicenses  ?? 0);
    return { maxRoomy, maxVast, usedRoomy, usedVast,
             availRoomy: maxRoomy - usedRoomy,
             availVast:  maxVast  - usedVast };
}

export async function setBastionTier(tier) {
    if (!game.user.isGM) return;
    const data = getBastionData();
    data.bastionTier = Math.max(0, Math.min(3, tier));
    await saveBastionData(data);
}

// ── Event damage (called from runBastionTurn) ─────────────────

export function applyEventDamage(data, facilityResults, eventCategory) {
    if (!["Crisis", "Setback"].includes(eventCategory)) return data;

    const slots = allSlots(data).filter(s => s.facilityUuid && s.facilityType === "special");
    if (!slots.length) return data;

    const worst = (facilityResults ?? [])
        .filter(r => r.maxRoll)
        .sort((a, b) => (a.roll / a.maxRoll) - (b.roll / b.maxRoll))[0];
    if (!worst) return data;

    const slot = slots.find(s =>
        s.facilityName?.toLowerCase() === (worst.name ?? "").toLowerCase()
    );
    if (!slot) return data;

    slot.health = degradeHealth(slot.health);
    if (slot.health === "Destroyed") slot.workerIds = [];

    _replaceSlot(data, slot);
    return data;
}

// ── RAW Attack mechanic ───────────────────────────────────────

/**
 * Resolves a Crisis event using the RAW Attack mechanic:
 * Roll 6d6; each 1 = one defender dies.
 * If 0 defenders remain, a random special facility takes damage.
 * Returns { defenderDeaths, facilityDamaged } for chat reporting.
 */
export function resolveAttack(data) {
    const dice  = Array.from({ length: 6 }, () => Math.ceil(Math.random() * 6));
    const deaths = dice.filter(d => d === 1).length;

    const defenders = [...(data.defenders ?? [])].filter(d => d.alive);
    let   facilityDamaged = null;

    if (defenders.length === 0) {
        // No defenders — random special facility takes damage instead.
        const occupied = allSlots(data).filter(s => s.facilityUuid && s.facilityType === "special");
        if (occupied.length) {
            const target = occupied[Math.floor(Math.random() * occupied.length)];
            target.health = degradeHealth(target.health);
            if (target.health === "Destroyed") target.workerIds = [];
            _replaceSlot(data, target);
            facilityDamaged = target.facilityName;
        }
    } else {
        // Kill up to `deaths` defenders (starting from end of roster).
        let remaining = deaths;
        for (let i = data.defenders.length - 1; i >= 0 && remaining > 0; i--) {
            if (data.defenders[i].alive) {
                data.defenders[i].alive = false;
                remaining--;
            }
        }
    }

    return { dice, deaths: Math.min(deaths, defenders.length), facilityDamaged };
}
