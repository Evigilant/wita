// ============================================================
// WITA Guildhall — guildhall-main.js
// Imported by wita/src/main.js inside Hooks.once("ready")
// Registers all guildhall hooks, intercepts, and public API
// ============================================================

import { MODULE_ID, GUILDHALL_ITEM_ID } from "./core/config.js";
import { registerGuildhallSettings }    from "./guildhall-settings.js";
import { getQuests }                    from "./core/quest-data.js";
import { resolveActiveQuests }          from "./core/resolution.js";
import { WITAQuestBoard }               from "./ui/quest-board.js";
import { witaSetting }                  from "../core/utils.js";

export function registerGuildhall() {
    registerGuildhallSettings();
    _registerSeneschalIntercept();
    _registerTurnHook();
    _registerOrderIntercept();
    _registerContextMenu();
    _registerPublicAPI();

    console.log("WITA | Guildhall quest management ready");
}

// ── Bastion turn detection ────────────────────────────────────

function _registerTurnHook() {
    let _lastTurn = null;

    Hooks.on("updateSetting", async (setting) => {
        if (setting.namespace !== "wita") return;
        if (setting.key !== "bastionTurnNumber") return;
        if (!game.user.isGM) return;

        const newTurn = witaSetting("bastionTurnNumber") ?? 0;
        if (_lastTurn === null) { _lastTurn = newTurn; return; }
        if (newTurn <= _lastTurn) { _lastTurn = newTurn; return; }

        _lastTurn = newTurn;
        await resolveActiveQuests(newTurn);

        // Refresh quest board if open
        const board = foundry.applications.instances.get("wita-guildhall-board");
        if (board?.rendered) board.render({ force: true });
    });
}

// ── Guildhall "Recruit" order intercept ───────────────────────

function _registerOrderIntercept() {
    Hooks.on("wita.preSetFacilityOrder", (slot, newOrder) => {
        if (slot.facilityItemId !== GUILDHALL_ITEM_ID) return;
        if (newOrder !== "recruit") return;
        WITAQuestBoard.open();
        return false; // cancel default WITA order save
    });
}

// ── Token right-click context menu ───────────────────────────

function _registerContextMenu() {
    Hooks.on("getTokenContextOptions", (token, options) => {
        const actorId = game.settings.get("wita", "questBoardActorId");
        if (!actorId || token.document?.actorId !== actorId) return;
        options.unshift({
            name:     "Open Quest Board",
            icon:     "<i class='fas fa-scroll'></i>",
            callback: () => WITAQuestBoard.open(),
        });
    });
}

// ── NPC sheet intercept ───────────────────────────────────────

function _registerSeneschalIntercept() {
    // Inject header button into the quest board NPC's sheet
    Hooks.on("renderActorSheet", (sheet, html) => {
        const actorId = game.settings.get("wita", "questBoardActorId");
        if (!actorId) return;
        const actor = sheet.document ?? sheet.actor;
        if (actor?.id !== actorId) return;
        if (sheet._witaQuestBoardBypass) return;

        const el = html instanceof HTMLElement ? html : html[0];
        if (!el || el.querySelector("#wita-open-quest-board-btn")) return;

        const header = el.closest(".app")?.querySelector(".window-header") ??
                       el.querySelector(".window-header");
        if (!header) return;

        const btn = document.createElement("button");
        btn.id        = "wita-open-quest-board-btn";
        btn.type      = "button";
        btn.className = "header-control fa-solid fa-scroll";
        btn.setAttribute("data-tooltip", "Open Quest Board");
        btn.style.cssText = "border:none;background:none;cursor:pointer;font-size:1rem;color:var(--color-highlights)";
        btn.addEventListener("click", e => {
            e.preventDefault(); e.stopPropagation();
            WITAQuestBoard.open();
        });

        const ellipsis = header.querySelector(".fa-ellipsis-vertical");
        if (ellipsis) ellipsis.before(btn);
        else header.appendChild(btn);
    });

    // Intercept sheet open to redirect to Quest Board — use libWrapper
    // Only registers if the questBoardActorId setting is set
    try {
        libWrapper.register("wita", "dnd5e.applications.actor.NPCActorSheet.prototype.render",
            function(wrapped, force, options = {}) {
                const actorId = game.settings.get("wita", "questBoardActorId");
                if (!actorId || this.document?.id !== actorId) return wrapped(force, options);
                if (options._witaQuestBoardBypass) return wrapped(force, options);
                WITAQuestBoard.open();
                // Suppress sheet render — player sees quest board instead
            }, "MIXED"
        );
    } catch(e) {
        console.warn("WITA | Guildhall: libWrapper registration failed —", e.message);
    }
}

// ── Public API ────────────────────────────────────────────────

function _registerPublicAPI() {
    // Extend game.wita with guildhall API — called after game.wita is set up in main.js
    Hooks.once("ready", () => {
        if (!game.wita) return;
        game.wita.guildhall = {
            openBoard:  () => WITAQuestBoard.open(),
            getQuests,
            resolveNow: () => resolveActiveQuests(witaSetting("bastionTurnNumber") ?? 0),
        };
    });
}
