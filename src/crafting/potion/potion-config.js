// ============================================================
// WITA — POTION CRAFTING CONFIG
// Level/EXP/gate data + the singleton WITA_POTION_CRAFTING instance.
// Ingredient/recipe metadata stays in potion-data.js.
// ============================================================
import { WITACraftingLevel } from "../crafting-level.js";

export const WITA_POTION_MAKING_LEVELS = [
    { level:1,  exp:0,    bonus:0 },
    { level:2,  exp:150,  bonus:1 },
    { level:3,  exp:450,  bonus:2 },
    { level:4,  exp:900,  bonus:3 },
    { level:5,  exp:1500, bonus:4 },
    { level:6,  exp:2250, bonus:5 },
    { level:7,  exp:3150, bonus:6 },
    { level:8,  exp:4200, bonus:7 },
    { level:9,  exp:5400, bonus:8 },
    { level:10, exp:6750, bonus:9 },
];

export const WITA_POTION_EXP_TABLE = {
    identify: { common:5,  uncommon:10, rare:20 },
    gather:   { common:2,  uncommon:8,  rare:12,  veryRare:20, legendary:40 },
    produced: { common:80, uncommon:200, rare:750, veryRare:2000 },
    recipe:   { common:60, uncommon:150, rare:500, veryRare:1500 },
};

// Players below the required level can still brew but take −5 to the roll.
// On failure when under level: 1d2 — 1=ingredients lost, 2=ingredients returned.
export const WITA_RARITY_LEVEL_GATES = {
    common:   1,
    uncommon: 3,
    rare:     6,
    veryRare: 9,
};

export const WITA_POTION_CRAFTING_RULES = {
    common:   { dc:8,  workHours:8,   baseCost:25,   productValue:50   },
    uncommon: { dc:12, workHours:24,  baseCost:100,  productValue:200  },
    rare:     { dc:15, workHours:80,  baseCost:500,  productValue:1000 },
    veryRare: { dc:18, workHours:240, baseCost:1000, productValue:2000 },
};

export const WITA_POTION_CRAFTING = new WITACraftingLevel({
    prefix:     "craft",
    label:      "Craft Level",
    levelTable: WITA_POTION_MAKING_LEVELS,
    expTable:   WITA_POTION_EXP_TABLE,
    levelGates: WITA_RARITY_LEVEL_GATES,
});
