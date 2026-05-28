// ============================================================
// WITA — MAIN ENTRY POINT (v0.4.0)
// ============================================================

// ── Core ───────────────────────────────────────────────────────
import "./core/config.js";
import "./core/utils.js";
import { WITAHtml } from "./core/html.js";

// ── Settings (registers all settings on Hooks.once("init")) ───
import "./settings/settings.js";

// ── Crafting ───────────────────────────────────────────────────
import { WITA_POTION_CRAFTING } from "./professions/crafters/potion/data/potion-config.js";
import { WITA_CRAFTING } from "./professions/core/registry.js";
import "./professions/crafters/potion/ui/potion-main.js";

// ── Loot ───────────────────────────────────────────────────────
import { executeLootAndHarvest } from "./loot/loot.js";

// ── Bastion (registers dnd5e.restCompleted hook as side effect)
import "./bastion/data/state.js";

import { registerBastionPanel }         from "./bastion/ui/panel.js";
import { handleEngineerPurchase }       from "./professions/merchants/data/purchase.js";
import { openCustomFacilityDialog }    from "./professions/merchants/ui/dialogs.js";

import { registerGuildhall } from "./guildhall/guildhall-main.js";
import { registerSmithy }   from "./professions/crafters/smithy/ui/smithy-main.js";
import { rollRandomEncounters, registerEncounterChatHook } from "./encounters/encounters.js";


// ── Combat log (registers all combat hooks as side effect) ────
import "./combat/combat-log.js";

// ── Socket ────────────────────────────────────────────────────
import { registerSocket } from "./socket.js";
registerSocket(executeLootAndHarvest);

// ── Public API ────────────────────────────────────────────────
Hooks.once("ready", () => {
    registerBastionPanel();
    game.wita = {
        potion:   WITA_POTION_CRAFTING,
        crafting: WITA_CRAFTING,
        bastion:  globalThis.WITA_BASTION,
        html:     WITAHtml,
    };
    game.wita.bastion.handleEngineerPurchase   = handleEngineerPurchase;
    game.wita.bastion.openCustomFacilityDialog = openCustomFacilityDialog;
    registerGuildhall(); // must run after game.wita is assigned
    registerSmithy();
    registerEncounterChatHook();
    // Expose encounter roller on game.wita
    game.wita.rollEncounters = rollRandomEncounters;

    console.log("WITA | Bastion debug tools available:");
    console.log("  WITA_BASTION.triggerTurn()     — manually trigger a bastion turn");
    console.log("  WITA_BASTION.getRestProgress() — show current rest counter");
    console.log("  WITA_BASTION.resetState()      — reset all bastion state");
    console.log("  WITA_BASTION.getState()        — inspect raw state object");
});
