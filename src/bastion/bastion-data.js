// ============================================================
// WITA — BASTION DATA
// Constants, world-flag helpers, DMG 2024 facility catalogue,
// and custom facility helpers.
//
// Dependency rule: nothing imports back into this file.
// ============================================================

import { sanitizeHTML } from "../core/utils.js";

// ── Health ────────────────────────────────────────────────────

export const WITA_HEALTH_STATES = ["Pristine", "Good", "Damaged", "Ruined", "Destroyed"];

export const WITA_HEALTH_MOD = {
    Pristine:  1.00,
    Good:      0.85,
    Damaged:   0.60,
    Ruined:    0.25,
    Destroyed: 0.00,
};

export const WITA_HEALTH_ICON = {
    Pristine:  "🟢",
    Good:      "🟡",
    Damaged:   "🟠",
    Ruined:    "🔴",
    Destroyed: "💀",
};

// ── Bastion tier ──────────────────────────────────────────────

export const WITA_TIER_SIZES = {
    0: [],
    1: ["cramped"],
    2: ["cramped", "roomy"],
    3: ["cramped", "roomy", "vast"],
};

export const WITA_TIER_LABEL = {
    0: "Unbuilt",
    1: "Tier I — Cramped",
    2: "Tier II — Roomy",
    3: "Tier III — Vast",
};

export const WITA_TIER_ICON = { 0: "🏚", 1: "🪨", 2: "🏠", 3: "🏰" };

// ── Facility size ─────────────────────────────────────────────

export const WITA_SIZE_MOD = {
    cramped: { productivityCap: 1.00, moraleFloor: 0  },
    roomy:   { productivityCap: 1.25, moraleFloor: 10 },
    vast:    { productivityCap: 1.50, moraleFloor: 20 },
};

export const WITA_SIZE_ICON  = { cramped: "🪨", roomy: "🏠", vast: "🏰" };
export const WITA_SIZE_LABEL = { cramped: "Cramped", roomy: "Roomy", vast: "Vast" };
export const WITA_SIZES      = ["cramped", "roomy", "vast"];

// ── Orders ────────────────────────────────────────────────────

export const WITA_ORDER_ICON = {
    craft:    "⚒",  trade:    "💰",  research: "📜",
    harvest:  "🌿", recruit:  "⚔️",  empower:  "✨",  "": "—",
};

export const WITA_ORDER_LABEL = {
    craft: "Craft", trade: "Trade", research: "Research",
    harvest: "Harvest", recruit: "Recruit", empower: "Empower", "": "None",
};

export const WITA_ORDERS = ["", "craft", "trade", "research", "harvest", "recruit", "empower"];

// ── Workers / morale ──────────────────────────────────────────

export const WITA_WORKER_STATUSES = ["Active", "Injured", "Absent", "Fled"];

export const WITA_MORALE_COLOUR = (m) =>
    m >= 80 ? "#4caf50" : m >= 60 ? "#8bc34a" : m >= 40 ? "#ff9800"
  : m >= 20 ? "#f44336" : "#7b0000";

export const WITA_MORALE_LABEL = (m) =>
    m >= 80 ? "High" : m >= 60 ? "Good" : m >= 40 ? "Low"
  : m >= 20 ? "Poor" : "Broken";

export const WITA_MORALE_TICK = {
    hasKitchen:        +5,
    noKitchen:         -8,
    hasBarracks:       +3,
    noBarracks:        -5,
    crisisFacility:    -15,
    setbackFacility:   -8,
    facilityDestroyed: -20,
};

// ── DMG 2024 Facility Catalogue ───────────────────────────────
// Source: dnd-dungeon-masters-guide.bastions LevelDB.
// enlargeable:      Roomy→Vast is defined in DMG text.
// enlargeHirelings: additional hirelings on enlargement.
// enlargeDefenders: max defenders after enlargement.

export const WITA_DMG_FACILITIES = {
    dmgArcaneStudy00: { name: "Arcane Study",        type: "special", size: "roomy",   level: 5,  order: "craft",    hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "Arcane Focus / Spellcasting Focus" },
    dmgArchive000000: { name: "Archive",              type: "special", size: "roomy",   level: 13, order: "research", hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None" },
    dmgArmory0000000: { name: "Armory",               type: "special", size: "roomy",   level: 5,  order: "trade",    hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None" },
    dmgBarrack000000: { name: "Barrack",              type: "special", size: "roomy",   level: 5,  order: "recruit",  hirelings: 1,  defenders: 12, enlargeable: true,  enlargeHirelings: 0, enlargeDefenders: 25, prereq: "None" },
    dmgBedroom000000: { name: "Bedroom",              type: "basic",   size: "cramped", level: 5,  order: "",         hirelings: 0,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None" },
    dmgCourtyard0000: { name: "Courtyard",            type: "basic",   size: "cramped", level: 5,  order: "",         hirelings: 0,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None" },
    dmgDemiplane0000: { name: "Demiplane",            type: "special", size: "vast",    level: 17, order: "empower",  hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "Arcane Focus / Spellcasting Focus" },
    dmgDiningRoom000: { name: "Dining Room",          type: "basic",   size: "cramped", level: 5,  order: "",         hirelings: 0,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None" },
    dmgGamingHall000: { name: "Gaming Hall",          type: "special", size: "vast",    level: 9,  order: "trade",    hirelings: 4,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None" },
    dmgGarden0000000: { name: "Garden",               type: "special", size: "roomy",   level: 5,  order: "harvest",  hirelings: 1,  defenders: 0,  enlargeable: true,  enlargeHirelings: 1, enlargeDefenders: 0,  prereq: "None" },
    dmgGreenhouse000: { name: "Greenhouse",           type: "special", size: "roomy",   level: 9,  order: "harvest",  hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None" },
    dmgGuildhall0000: { name: "Guildhall",            type: "special", size: "vast",    level: 17, order: "recruit",  hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "Expertise in a skill" },
    dmgKitchen000000: { name: "Kitchen",              type: "basic",   size: "cramped", level: 5,  order: "",         hirelings: 0,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None" },
    dmgLaboratory000: { name: "Laboratory",           type: "special", size: "roomy",   level: 9,  order: "craft",    hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None*" },
    dmgLibrary000000: { name: "Library",              type: "special", size: "roomy",   level: 5,  order: "research", hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None" },
    dmgMeditationCha: { name: "Meditation Chamber",   type: "special", size: "cramped", level: 13, order: "empower",  hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None" },
    dmgMenagerie0000: { name: "Menagerie",            type: "special", size: "vast",    level: 13, order: "recruit",  hirelings: 2,  defenders: 4,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None" },
    dmgObservatory00: { name: "Observatory",          type: "special", size: "roomy",   level: 13, order: "empower",  hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "Spellcasting Focus" },
    dmgParlor0000000: { name: "Parlor",               type: "basic",   size: "cramped", level: 5,  order: "",         hirelings: 0,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None" },
    dmgPub0000000000: { name: "Pub",                  type: "special", size: "roomy",   level: 13, order: "research", hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None" },
    dmgReliquary0000: { name: "Reliquary",            type: "special", size: "cramped", level: 13, order: "harvest",  hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "Holy Symbol / Druidic Focus" },
    dmgSacristy00000: { name: "Sacristy",             type: "special", size: "roomy",   level: 9,  order: "craft",    hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "Holy Symbol / Druidic Focus" },
    dmgSanctuary0000: { name: "Sanctuary",            type: "special", size: "roomy",   level: 5,  order: "craft",    hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "Holy Symbol / Druidic Focus" },
    dmgSanctum000000: { name: "Sanctum",              type: "special", size: "roomy",   level: 17, order: "empower",  hirelings: 4,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "Holy Symbol / Druidic Focus" },
    dmgScriptorium00: { name: "Scriptorium",          type: "special", size: "roomy",   level: 9,  order: "craft",    hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None*" },
    dmgSmithy0000000: { name: "Smithy",               type: "special", size: "roomy",   level: 5,  order: "craft",    hirelings: 2,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None" },
    dmgStable0000000: { name: "Stable",               type: "special", size: "roomy",   level: 9,  order: "trade",    hirelings: 1,  defenders: 0,  enlargeable: true,  enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None" },
    dmgStorage000000: { name: "Storage",              type: "basic",   size: "cramped", level: 5,  order: "",         hirelings: 0,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None" },
    dmgStorehouse000: { name: "Storehouse",           type: "special", size: "roomy",   level: 5,  order: "trade",    hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None" },
    dmgTeleportation: { name: "Teleportation Circle", type: "special", size: "roomy",   level: 9,  order: "recruit",  hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None" },
    dmgTheater000000: { name: "Theater",              type: "special", size: "vast",    level: 9,  order: "empower",  hirelings: 4,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None" },
    dmgTrainingArea0: { name: "Training Area",        type: "special", size: "vast",    level: 9,  order: "empower",  hirelings: 4,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None" },
    dmgTrophyRoom000: { name: "Trophy Room",          type: "special", size: "roomy",   level: 9,  order: "research", hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None" },
    dmgWarRoom000000: { name: "War Room",             type: "special", size: "vast",    level: 17, order: "recruit",  hirelings: 10, defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "Fighting Style or Unarmored Defense" },
    dmgWorkshop00000: { name: "Workshop",             type: "special", size: "roomy",   level: 5,  order: "craft",    hirelings: 3,  defenders: 0,  enlargeable: true,  enlargeHirelings: 2, enlargeDefenders: 0,  prereq: "None" },
};

// ── Custom facility helpers ───────────────────────────────────

export const WITA_CUSTOM_FACILITY_FLAG = "customFacility";

/**
 * Returns all world items flagged as WITA custom facilities,
 * keyed by item ID, in the same shape as WITA_DMG_FACILITIES entries.
 */
export function getCustomFacilities() {
    const result = {};
    for (const item of game.items) {
        const flagData = item.getFlag?.("wita", WITA_CUSTOM_FACILITY_FLAG);
        if (!flagData) continue;
        result[item.id] = {
            name:             sanitizeHTML(item.name),
            type:             flagData.type             ?? "special",
            size:             flagData.size             ?? "cramped",
            level:            flagData.level            ?? 5,
            order:            flagData.order            ?? "",
            hirelings:        flagData.hirelings        ?? 0,
            defenders:        flagData.defenders        ?? 0,
            enlargeable:      flagData.enlargeable      ?? false,
            enlargeHirelings: flagData.enlargeHirelings ?? 0,
            enlargeDefenders: flagData.enlargeDefenders ?? 0,
            prereq:           flagData.prereq           ?? "None",
            description:      flagData.description      ?? "",
            custom:           true,
            itemId:           item.id,
        };
    }
    return result;
}

/**
 * Returns merged DMG + custom facility catalogue.
 * Custom facilities are keyed by world item ID.
 */
export function getAllFacilities() {
    return { ...WITA_DMG_FACILITIES, ...getCustomFacilities() };
}

/**
 * Creates a new world Item for a custom facility, auto-adds to vendor.
 */
export async function createCustomFacility(opts) {
    if (!game.user.isGM) return null;

    const flagData = {
        type:             opts.type             ?? "special",
        subtype:          sanitizeHTML(opts.subtype ?? ""),
        size:             opts.size             ?? "cramped",
        level:            Math.max(1, Math.min(20, opts.level ?? 5)),
        order:            opts.order            ?? "",
        hirelings:        Math.max(0, opts.hirelings ?? 0),
        defenders:        Math.max(0, opts.defenders ?? 0),
        prereq:           sanitizeHTML(opts.prereq ?? "None"),
        enlargeable:      opts.enlargeable      ?? false,
        enlargeHirelings: Math.max(0, opts.enlargeHirelings ?? 0),
        enlargeDefenders: Math.max(0, opts.enlargeDefenders ?? 0),
        description:      sanitizeHTML(opts.description ?? ""),
    };

    const itemData = {
        name: sanitizeHTML(opts.name ?? "Custom Facility"),
        type: "facility",
        img:  opts.img ?? "icons/svg/castle.svg",
        system: {
            description: { value: `<p>${flagData.description}</p>`, chat: "" },
            type:        { value: flagData.type, subtype: flagData.subtype },
            size:        flagData.size,
            level:       flagData.level,
            order:       flagData.order,
            hirelings:   { value: [], max: flagData.hirelings || null },
            defenders:   { value: [], max: flagData.defenders || null },
            free:        false,
            progress:    { value: 0, max: null, order: "" },
        },
        flags: { wita: { [WITA_CUSTOM_FACILITY_FLAG]: flagData } },
    };

    const item = (await Item.createDocuments([itemData]))[0];
    if (!item) {
        ui.notifications.error("WITA | Failed to create custom facility item.");
        return null;
    }

    console.log(`WITA | Custom facility "${item.name}" created (${item.id})`);
    return item;
}

/**
 * Deletes a custom facility: clears slots, removes from vendor, deletes item.
 */
export async function deleteCustomFacility(itemId) {
    if (!game.user.isGM) return;

    const item = game.items.get(itemId);
    if (!item) return;

    // Clear any slots using this facility.
    const data = getBastionData();
    let changed = false;
    for (const pool of ["basicSlots", "specialSlots"]) {
        for (const slot of (data[pool] ?? [])) {
            if (slot.facilityItemId === itemId) {
                Object.assign(slot, _emptySlotFields());
                changed = true;
            }
        }
    }
    if (changed) await saveBastionData(data);

    // Remove from Engineer vendor.
    const engData = getEngineeringData();
    const vendor  = engData.vendorActorId ? game.actors.get(engData.vendorActorId) : null;
    if (vendor) {
        const vi = vendor.items.find(i => i.flags?.wita?.engineerItemId === itemId);
        if (vi) await vi.delete();
    }

    // Remove cost record.
    if (engData.facilities?.[itemId]) {
        delete engData.facilities[itemId];
        await saveEngineeringData(engData);
    }

    await item.delete();
    console.log(`WITA | Custom facility "${item.name}" deleted.`);
}

// ── World flag helpers ────────────────────────────────────────

const BASTION_KEY  = "bastion";
const ENGINEER_KEY = "engineeringCosts";

export function getBastionData() {
    const raw = game.settings.get("wita", "bastion");
    return foundry.utils.mergeObject(
        { bastionTier: 0, basicSlots: [], specialSlots: [], workers: [], defenders: [],
          roomyLicenses: 0, vastLicenses: 0 },
        raw ?? {},
        { inplace: false }
    );
}

export async function saveBastionData(data) {
    await game.settings.set("wita", "bastion", data);
}

export function getEngineeringData() {
    const raw = game.settings.get("wita", "engineeringCosts");
    return foundry.utils.mergeObject(
        { vendorActorId: null, facilities: {}, metaItems: {}, stockedFacilities: [], stockedMetaItems: [] },
        raw ?? {},
        { inplace: false }
    );
}

export async function saveEngineeringData(data) {
    await game.settings.set("wita", "engineeringCosts", data);
}

// ── Slot helpers ──────────────────────────────────────────────

export function makeEmptySlot(facilityType) {
    return { id: `slot-${foundry.utils.randomID(8)}`, facilityType, ..._emptySlotFields() };
}

export function _emptySlotFields() {
    return {
        facilityUuid: null, facilityItemId: null, facilityName: null,
        facilityImg: null, facilitySize: null, facilityBaseSize: null,
        facilityOrder: null, facilityLevelReq: null, facilityPrereq: null,
        health: "Pristine", hirelingSlots: 0, defenderSlots: 0,
        workerIds: [], currentOrder: "", built: false,
    };
}

export function allSlots(data) {
    return [...(data.basicSlots ?? []), ...(data.specialSlots ?? [])];
}

export function occupiedSlots(data) {
    return allSlots(data).filter(s => s.facilityUuid);
}
