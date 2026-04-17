// ============================================================
// WITA — MAIN ENTRY POINT (v1.1.0)
// Single ES module imported by module.json "esmodules".
// All imports register their own Hooks as side effects.
// ============================================================

// ── Core ───────────────────────────────────────────────────────
import "./core/config.js";
import "./core/utils.js";
import { WITAHtml } from "./core/html.js";

// ── Settings (registers all settings on Hooks.once("init")) ───
import "./settings/settings.js";

// ── Crafting ───────────────────────────────────────────────────
import { WITA_POTION_CRAFTING } from "./crafting/potion/potion-config.js";
import { WITA_CRAFTING } from "./crafting/crafting-registry.js";
import "./crafting/potion/potion-main.js";

// ── Loot ───────────────────────────────────────────────────────
import { executeLootAndHarvest } from "./loot/loot.js";

// ── Bastion (registers dnd5e.restCompleted hook as side effect)
import "./bastion/bastion-state.js";

// ── Combat log (registers all combat hooks as side effect) ────
import "./combat/combat-log.js";

// ── Socket ────────────────────────────────────────────────────
import { registerSocket } from "./socket.js";
registerSocket(executeLootAndHarvest);

// ── Public API ────────────────────────────────────────────────
Hooks.once("ready", () => {
    game.wita = {
        potion:   WITA_POTION_CRAFTING,
        crafting: WITA_CRAFTING,
        bastion:  globalThis.WITA_BASTION,
        html:     WITAHtml,
    };

    console.log("WITA | Bastion debug tools available:");
    console.log("  WITA_BASTION.triggerTurn()     — manually trigger a bastion turn");
    console.log("  WITA_BASTION.getRestProgress() — show current rest counter");
    console.log("  WITA_BASTION.resetState()      — reset all bastion state");
    console.log("  WITA_BASTION.getState()        — inspect raw state object");
});
