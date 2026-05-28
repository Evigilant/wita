// ============================================================
// WITA Smithy — smithy-config.js
// Constants, rarity tables, DC formula
// ============================================================

export const SMITHY_ITEM_ID  = "dmgSmithy0000000";
export const PHB_EQUIPMENT_PACK = "dnd-players-handbook.equipment";

export const GENERIC_ENHANCEMENT_UUIDS = {
    weapon: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgWeapon12or300",
    armor:  "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgArmor12or3000",
    shield: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgShield12or300",
    ammo:   "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgAmmunition12o",
};

export const GENERIC_ITEM_PATTERNS = [
    { pattern: /^Ammunition,?\s*\+/i,  category: "ammo",   label: "Choose Ammunition Type" },
    { pattern: /^Armor,?\s*\+/i,       category: "armor",  label: "Choose Armor Type" },
    { pattern: /^Shield,?\s*\+/i,      category: "shield", label: "Choose Shield Type" },
    { pattern: /^Weapon,?\s*\+/i,      category: "weapon", label: "Choose Weapon Type" },
];

export const EQUIPMENT_TYPE_FILTERS = {
    weapon: ["simpleM", "simpleR", "martialM", "martialR"],
    armor:  ["light", "medium", "heavy"],
    shield: ["shield"],
    ammo:   ["ammo"],
};

export function getGenericCategory(itemName) {
    for (const { pattern, category } of GENERIC_ITEM_PATTERNS) {
        if (pattern.test(itemName)) return category;
    }
    return null;
}

export const DMG_TABLES_PACK    = "dnd-dungeon-masters-guide.tables";
export const DMG_EQUIPMENT_PACK = "dnd-dungeon-masters-guide.equipment";

export const ARMAMENTS_TABLES = {
    common:   "dmgArmamentsComm",
    uncommon: "dmgArmamentsUnco",
    rare:     "dmgArmamentsRare",
    veryrare: "dmgArmamentsVery",
};

export const SIZE_RARITIES = {
    cramped: ["common", "uncommon"],
    roomy:   ["common", "uncommon", "rare"],
    vast:    ["common", "uncommon", "rare", "veryrare"],
};

export const RARITY_LABELS = {
    common:   "Common",
    uncommon: "Uncommon",
    rare:     "Rare",
    veryrare: "Very Rare",
};

export const RARITY_CRAFTING = {
    common:   { days: 5,   cost: 50    },
    uncommon: { days: 10,  cost: 200   },
    rare:     { days: 50,  cost: 2000  },
    veryrare: { days: 125, cost: 20000 },
};

export const DAYS_PER_BASTION_TURN = 7;

export function smithyCraftTurns(rarity, workerCount = 1) {
    const days    = RARITY_CRAFTING[rarity]?.days ?? 10;
    const workers = Math.max(1, workerCount);
    return Math.max(1, Math.ceil(days / workers / DAYS_PER_BASTION_TURN));
}

export const RARITY_DC_BASE = {
    common:   8,
    uncommon: 12,
    rare:     16,
    veryrare: 20,
};

export const SIZE_MAX_WORKERS = {
    cramped: 1,
    roomy:   2,
    vast:    4,
};

export function smithyCraftDC(rarity, quantity, avgMorale = 50) {
    const base      = RARITY_DC_BASE[rarity] ?? 12;
    const qtyMod    = (quantity - 1) * 2;
    const moraleMod = Math.round((50 - avgMorale) / 10);
    return Math.max(5, base + qtyMod + moraleMod);
}

export function parseTableResultUuid(str) {
    const m = str?.match(/@UUID\[([^\]]+)\]/);
    return m ? m[1] : null;
}

export function parseTableResultName(str) {
    if (!str) return "Unknown Item";

    const wrapped = str.match(/^@UUID\[[^\]]+\]\{([^}]+)\}(.*)$/);
    if (wrapped) {
        const name   = wrapped[1].trim();
        const suffix = wrapped[2].trim();
        return suffix ? `${name}${suffix}` : name;
    }

    const inline = str.match(/^(.+?)\s*\(@UUID\[[^\]]+\]\{([^}]+)\}\)(.*)$/);
    if (inline) {
        const base    = inline[1].trim();
        const variant = inline[2].trim();
        const suffix  = inline[3].trim();
        return suffix ? `${base} (${variant})${suffix}` : `${base} (${variant})`;
    }

    const simple = str.match(/\{([^}]+)\}/);
    return simple ? simple[1] : str;
}
