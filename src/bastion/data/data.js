// ============================================================
// WITA — BASTION DATA
// Constants, world-flag helpers, DMG 2024 facility catalogue,
// and custom facility helpers.
//
// Dependency rule: nothing imports back into this file.
// ============================================================

import { sanitizeHTML } from "../../core/utils.js";

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
    harvest: "Harvest", recruit: "View", empower: "Empower", "": "None",
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
    dmgArcaneStudy00: { name: "Arcane Study",        type: "special", size: "roomy",   level: 5,  order: "craft",    hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "Arcane Focus / Spellcasting Focus",
        roles: ["Cipher-Reader", "Lore-Seeker", "Warp-Analyst", "Bound Psyker"] },
    dmgArchive000000: { name: "Archive",              type: "special", size: "roomy",   level: 13, order: "research", hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None",
        roles: ["Archivist", "Cataloguer", "Records-Keeper", "Registrar"] },
    dmgArmory0000000: { name: "Armory",               type: "special", size: "roomy",   level: 5,  order: "trade",    hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None",
        roles: ["Armorer", "Weapons-Clerk", "Arsenal-Keeper", "Quartermaster"] },
    dmgBarrack000000: { name: "Barrack",              type: "special", size: "roomy",   level: 5,  order: "recruit",  hirelings: 1,  defenders: 12, enlargeable: true,  enlargeHirelings: 0, enlargeDefenders: 25, prereq: "None",
        roles: ["Billet-Master", "Quartermaster", "Orderly", "Duty-Corporal"] },
    dmgBedroom000000: { name: "Bedroom",              type: "basic",   size: "cramped", level: 5,  order: "",         hirelings: 0,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None" },
    dmgCourtyard0000: { name: "Courtyard",            type: "basic",   size: "cramped", level: 5,  order: "",         hirelings: 0,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None" },
    dmgDemiplane0000: { name: "Demiplane",            type: "special", size: "vast",    level: 17, order: "empower",  hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "Arcane Focus / Spellcasting Focus",
        roles: ["Planar Custodian", "Warp-Warden", "Threshold-Keeper", "Void-Tender"] },
    dmgDiningRoom000: { name: "Dining Room",          type: "basic",   size: "cramped", level: 5,  order: "",         hirelings: 0,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None" },
    dmgGamingHall000: { name: "Gaming Hall",          type: "special", size: "vast",    level: 9,  order: "trade",    hirelings: 4,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None",
        roles: ["House Dealer", "Pit Boss", "Croupier", "Floor Security"] },
    dmgGarden0000000: { name: "Garden",               type: "special", size: "roomy",   level: 5,  order: "harvest",  hirelings: 1,  defenders: 0,  enlargeable: true,  enlargeHirelings: 1, enlargeDefenders: 0,  prereq: "None",
        roles: ["Groundskeeper", "Gardener", "Harvester", "Botanist"] },
    dmgGreenhouse000: { name: "Greenhouse",           type: "special", size: "roomy",   level: 9,  order: "harvest",  hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None",
        roles: ["Horticulturalist", "Grower", "Tender", "Botanist"] },
    dmgGuildhall0000: { name: "Guildhall",            type: "special", size: "vast",    level: 17, order: "recruit",  hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "Expertise in a skill",
        roles: ["Quest-Handler", "Recruiter", "Treasurer", "Liaison"] },
    dmgKitchen000000: { name: "Kitchen",              type: "basic",   size: "cramped", level: 5,  order: "",         hirelings: 0,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None" },
    dmgLaboratory000: { name: "Laboratory",           type: "special", size: "roomy",   level: 9,  order: "craft",    hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None*",
        roles: ["Researcher", "Lab-Servitor", "Analytica-Clerk", "Experimenter"] },
    dmgLibrary000000: { name: "Library",              type: "special", size: "roomy",   level: 5,  order: "research", hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None",
        roles: ["Librarian", "Researcher", "Index-Keeper", "Lore-Warden"] },
    dmgMeditationCha: { name: "Meditation Chamber",   type: "special", size: "cramped", level: 13, order: "empower",  hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None",
        roles: ["Contemplative", "Spiritualist", "Confessor-Aide", "Shrine-Tender"] },
    dmgMenagerie0000: { name: "Menagerie",            type: "special", size: "vast",    level: 13, order: "recruit",  hirelings: 2,  defenders: 4,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None",
        roles: ["Beast Handler", "Keeper", "Warden", "Specimen-Warden"] },
    dmgObservatory00: { name: "Observatory",          type: "special", size: "roomy",   level: 13, order: "empower",  hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "Spellcasting Focus",
        roles: ["Astral Observer", "Chart-Keeper", "Lumen-Reader", "Survey-Adept"] },
    dmgParlor0000000: { name: "Parlor",               type: "basic",   size: "cramped", level: 5,  order: "",         hirelings: 0,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None" },
    dmgPub0000000000: { name: "Pub",                  type: "special", size: "roomy",   level: 13, order: "research", hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None",
        roles: ["Tapster", "Host", "Cellar-Master", "Server"] },
    dmgReliquary0000: { name: "Reliquary",            type: "special", size: "cramped", level: 13, order: "harvest",  hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "Holy Symbol / Druidic Focus",
        roles: ["Keeper of Relics", "Custodian", "Shrine-Warden", "Relic-Binder"] },
    dmgSacristy00000: { name: "Sacristy",             type: "special", size: "roomy",   level: 9,  order: "craft",    hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "Holy Symbol / Druidic Focus",
        roles: ["Sacristan", "Altar-Keeper", "Vestment-Keeper", "Celebrant-Aide"] },
    dmgSanctuary0000: { name: "Sanctuary",            type: "special", size: "roomy",   level: 5,  order: "craft",    hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "Holy Symbol / Druidic Focus",
        roles: ["Healer", "Confessor", "Shrine-Tender", "Ward-Keeper"] },
    dmgSanctum000000: { name: "Sanctum",              type: "special", size: "roomy",   level: 17, order: "empower",  hirelings: 4,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "Holy Symbol / Druidic Focus",
        roles: ["High Celebrant", "Sacred Warden", "Keeper", "Devotionist"] },
    dmgScriptorium00: { name: "Scriptorium",          type: "special", size: "roomy",   level: 9,  order: "craft",    hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None*",
        roles: ["Copyist", "Illuminator", "Binder", "Rubrician"] },
    dmgSmithy0000000: { name: "Smithy",               type: "special", size: "roomy",   level: 5,  order: "craft",    hirelings: 2,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None",
        roles: ["Forgewright", "Armorer", "Blade-Artisan", "Apprentice-Smith"] },
    dmgStable0000000: { name: "Stable",               type: "special", size: "roomy",   level: 9,  order: "trade",    hirelings: 1,  defenders: 0,  enlargeable: true,  enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None",
        roles: ["Groom", "Stable-Master", "Farrier", "Wrangler"] },
    dmgStorage000000: { name: "Storage",              type: "basic",   size: "cramped", level: 5,  order: "",         hirelings: 0,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None" },
    dmgStorehouse000: { name: "Storehouse",           type: "special", size: "roomy",   level: 5,  order: "trade",    hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None",
        roles: ["Factor", "Stock-Keeper", "Loader", "Inventory-Clerk"] },
    dmgTeleportation: { name: "Teleportation Circle", type: "special", size: "roomy",   level: 9,  order: "recruit",  hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None",
        roles: ["Circle-Keeper", "Transit-Warden", "Runescribe", "Threshold-Adept"] },
    dmgTheater000000: { name: "Theater",              type: "special", size: "vast",    level: 9,  order: "empower",  hirelings: 4,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None",
        roles: ["Stage-Hand", "Actor", "Director", "Costumer"] },
    dmgTrainingArea0: { name: "Training Area",        type: "special", size: "vast",    level: 9,  order: "empower",  hirelings: 4,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None",
        roles: ["Drill-Instructor", "Combat-Trainer", "Fitness-Marshal", "Ordnance-Instructor"] },
    dmgTrophyRoom000: { name: "Trophy Room",          type: "special", size: "roomy",   level: 9,  order: "research", hirelings: 1,  defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "None",
        roles: ["Curator", "Acquisitions-Agent", "Taxidermist", "Display-Keeper"] },
    dmgWarRoom000000: { name: "War Room",             type: "special", size: "vast",    level: 17, order: "recruit",  hirelings: 10, defenders: 0,  enlargeable: false, enlargeHirelings: 0, enlargeDefenders: 0,  prereq: "Fighting Style or Unarmored Defense",
        roles: ["Tactician", "Intelligence-Officer", "Cartographer", "Strategist"] },
    dmgWorkshop00000: { name: "Workshop",             type: "special", size: "roomy",   level: 5,  order: "craft",    hirelings: 3,  defenders: 0,  enlargeable: true,  enlargeHirelings: 2, enlargeDefenders: 0,  prereq: "None",
        roles: ["Artificer", "Fabricator", "Tinkerer", "Apprentice-Wright"] },
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
 * Returns the roles array for a facility by name, or [] if none defined.
 */
export function getFacilityRoles(facilityName) {
    if (!facilityName) return [];
    const lower = facilityName.toLowerCase();
    for (const cfg of Object.values(WITA_DMG_FACILITIES)) {
        if (cfg.name.toLowerCase() === lower) return cfg.roles ?? [];
    }
    return [];
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

    // Store in wita.wita-items compendium under Bastion/Custom folder
    const pack = game.packs.get("wita.wita-items");
    let folderId = null;
    let wasLocked = false;

    if (pack) {
        // Unlock compendium if locked
        wasLocked = pack.locked;
        if (wasLocked) await pack.configure({ locked: false });

        try {
            // Find or create Bastion folder
            let bastionFolder = pack.folders.find(f => f.name === "Bastion" && !f.folder);
            if (!bastionFolder) {
                bastionFolder = (await Folder.createDocuments(
                    [{ name: "Bastion", type: "Item", color: "#4a3728" }],
                    { pack: "wita.wita-items" }
                ))[0];
            }
            // Find or create Custom subfolder inside Bastion
            let customFolder = pack.folders.find(f => f.name === "Custom" && f.folder?.id === bastionFolder?.id);
            if (!customFolder && bastionFolder) {
                customFolder = (await Folder.createDocuments(
                    [{ name: "Custom", type: "Item", folder: bastionFolder.id, color: "#6b4c3b" }],
                    { pack: "wita.wita-items" }
                ))[0];
            }
            folderId = customFolder?.id ?? bastionFolder?.id ?? null;
        } finally {
            // Re-lock compendium if it was locked before
            if (wasLocked) await pack.configure({ locked: true });
        }
    }

    // Unlock again for item creation, then re-lock
    if (pack && wasLocked) await pack.configure({ locked: false });

    const createOptions = pack ? { pack: "wita.wita-items" } : {};
    if (folderId) itemData.folder = folderId;

    let item;
    try {
        item = (await Item.createDocuments([itemData], createOptions))[0];
    } finally {
        if (pack && wasLocked) await pack.configure({ locked: true });
    }

    if (!item) {
        ui.notifications.error("WITA | Failed to create custom facility item.");
        return null;
    }

    console.log(`WITA | Custom facility "${item.name}" created (${item.id}) in wita.wita-items`);
    return item;
}

/**
 * Deletes a custom facility: clears slots, removes from vendor, deletes item.
 */
export async function deleteCustomFacility(itemId) {
    if (!game.user.isGM) return;

    // Handle both world items and compendium items
    let item = game.items.get(itemId);
    if (!item) {
        // Try compendium
        const pack = game.packs.get("wita.wita-items");
        if (pack) item = await pack.getDocument(itemId).catch(() => null);
    }
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

    // Remove from Engineer stock list and cost record.
    const engData = getEngineeringData();
    engData.stockedFacilities = (engData.stockedFacilities ?? []).filter(id => id !== itemId);
    if (engData.facilities?.[itemId]) delete engData.facilities[itemId];
    await saveEngineeringData(engData);

    // Remove from Engineer vendor.
    const vendor = engData.vendorActorId ? game.actors.get(engData.vendorActorId) : null;
    if (vendor) {
        const vi = vendor.items.find(i => i.flags?.wita?.engineerItemId === itemId);
        if (vi) await vi.delete();
    }

    // Unlock compendium if needed for deletion
    const delPack = item.pack ? game.packs.get(item.pack) : null;
    const delLocked = delPack?.locked ?? false;
    if (delLocked) await delPack.configure({ locked: false });
    try {
        await item.delete();
    } finally {
        if (delLocked) await delPack.configure({ locked: true });
    }
    console.log(`WITA | Custom facility "${item.name}" deleted.`);
}

// ── World flag helpers ────────────────────────────────────────

const BASTION_KEY  = "bastion";
const ENGINEER_KEY = "engineeringCosts";

export function getBastionData() {
    const raw = game.settings.get("wita", "bastion");
    return foundry.utils.mergeObject(
        { bastionTier: 0, basicSlots: [], specialSlots: [], workers: [], defenders: [],
          roomyLicenses: 0, vastLicenses: 0,
          expansionEndTurn: null, pendingLicenses: [] },
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
        buildStartTurn: null, buildTurnsRequired: 0,
    };
}

export function allSlots(data) {
    return [...(data.basicSlots ?? []), ...(data.specialSlots ?? [])];
}

export function occupiedSlots(data) {
    return allSlots(data).filter(s => s.facilityUuid);
}
