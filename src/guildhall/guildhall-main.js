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
    // Primary resolution is called directly from runBastionTurn via game.wita.guildhall.resolveNow()
    // This hook refreshes the quest board UI when bastionState changes
    Hooks.on("updateSetting", (setting) => {
        if (setting.namespace !== "wita") return;
        if (setting.key !== "bastionState") return;
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
        const stored = game.settings.get("wita", "questBoardActorId");
        if (!stored) return;
        const tActorId = token.document?.actorId ?? "";
        if (!stored.includes(tActorId) && stored !== tActorId) return;
        options.unshift({
            name:     "Open Quest Board",
            icon:     "<i class='fas fa-scroll'></i>",
            callback: () => WITAQuestBoard.open(),
        });
    });
}

// ── NPC sheet intercept ───────────────────────────────────────

function _isQuestBoardActor(actor) {
    if (!actor) return false;
    const stored = game.settings.get("wita", "questBoardActorId");
    if (!stored) return false;
    const id   = actor.id   ?? "";
    const uuid = actor.uuid ?? "";
    return stored === id || stored === uuid
        || uuid.includes(stored) || stored.includes(id);
}

function _isQuestBoardApp(app) {
    return _isQuestBoardActor(app.document ?? app.actor);
}

function _registerSeneschalIntercept() {
    // Cannot use libWrapper here — bastion-panel.js already registers "wita" on
    // NPCActorSheet.prototype.render and libWrapper rejects duplicate package registrations.
    // Use render hooks instead — same as the Seneschal fallback path.

    const _closeAndOpen = (app) => {
        if (!_isQuestBoardApp(app)) return;
        // Hide immediately to prevent flash, then close and open quest board
        if (app.element) app.element.style.display = "none";
        setTimeout(() => { app.close(); WITAQuestBoard.open(); }, 0);
    };

    Hooks.on("renderActorSheetV2",   _closeAndOpen);
    Hooks.on("renderNPCActorSheet",  _closeAndOpen);
    Hooks.on("renderBaseActorSheet", _closeAndOpen);

    // Also hook the Seneschal's existing libWrapper intercept via wita.preSetFacilityOrder
    // won't help here — instead piggyback on the Seneschal's renderActorSheet hook check
    Hooks.on("renderActorSheet", (sheet, html) => {
        if (!_isQuestBoardApp(sheet)) return;
        const el = html instanceof HTMLElement ? html : html[0];
        if (!el) return;
        // Inject quest board button into sheet header
        if (el.querySelector("#wita-open-quest-board-btn")) return;
        const header = el.closest(".app")?.querySelector(".window-header") ??
                       el.querySelector(".window-header");
        if (!header) return;
        const btn = document.createElement("button");
        btn.id        = "wita-open-quest-board-btn";
        btn.type      = "button";
        btn.className = "header-control fa-solid fa-scroll";
        btn.setAttribute("data-tooltip", "Open Quest Board");
        btn.style.cssText = "border:none;background:none;cursor:pointer;font-size:1rem;color:var(--color-highlights)";
        btn.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); WITAQuestBoard.open(); });
        const ellipsis = header.querySelector(".fa-ellipsis-vertical");
        if (ellipsis) ellipsis.before(btn);
        else header.appendChild(btn);
    });
}

// ── Public API ────────────────────────────────────────────────

function _registerPublicAPI() {
    // Set directly — registerGuildhall() is already called inside Hooks.once("ready")
    if (!game.wita) game.wita = {};
    game.wita.guildhall = {
        openBoard:  () => WITAQuestBoard.open(),
        getQuests,
        resolveNow: () => resolveActiveQuests((witaSetting("bastionState")?.turnNumber ?? 0)),
    };
}
