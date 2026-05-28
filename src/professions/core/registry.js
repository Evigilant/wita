// ============================================================
// WITA — PROFESSION REGISTRY
// Thin aggregator of all crafting system instances.
// Never contains data — only imports and re-exports instances.
// Add new crafting types here with one import + one key.
// ============================================================
import { WITA_POTION_CRAFTING } from "../crafters/potion/data/potion-config.js";
// Future: import { WITA_SMITHING } from "../crafters/smithy/data/smithy-config.js";

export const WITA_CRAFTING = {
    potion: WITA_POTION_CRAFTING,
    // smithing: WITA_SMITHING,  // future — one line
};
