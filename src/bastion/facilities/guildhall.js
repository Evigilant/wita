import { MODULE_ID, GUILDHALL_ITEM_ID } from "../../professions/quests/core/config.js";
import { registerGuildhallSettings }    from "../../professions/quests/settings.js";
import { getQuests }                    from "../../professions/quests/core/quest-data.js";
import { resolveActiveQuests }          from "../../professions/quests/core/resolution.js";
import { WITAQuestBoard }               from "../../professions/quests/ui/quest-board.js";
import { witaSetting }                  from "../../core/utils.js";

export function registerGuildhall() {
    registerGuildhallSettings();
    _registerSeneschalIntercept();
    _registerTurnHook();
    _registerContextMenu();
    _registerPublicAPI();

    console.log("WITA | Guildhall quest management ready");
}

// ── Bastion turn detection ────────────────────────────────────

function _registerTurnHook() {
    const _BOARD_REFRESH_KEYS = new Set(["bastionState", "guildhallQuests", "guildhallConfig"]);
    Hooks.on("updateSetting", (setting) => {
        if (setting.namespace !== "wita") return;
        if (!_BOARD_REFRESH_KEYS.has(setting.key)) return;
        const board = foundry.applications.instances.get("wita-guildhall-board");
        if (board?.rendered) board.render({ force: true });
    });
}

// ── Token right-click context menu ───────────────────────────

function _registerContextMenu() {
    Hooks.on("getTokenContextOptions", (html, options) => {
        const stored = game.settings.get("wita", "questBoardActorId");
        if (!stored) return;
        options.unshift({
            name:      "Open Quest Board",
            icon:      "<i class='fas fa-scroll'></i>",
            condition: li => {
                const tokenId = li?.data?.("tokenId") ?? li?.dataset?.tokenId;
                const tok = canvas.tokens.get(tokenId);
                if (!tok) return false;
                const tActorId = tok.document?.actorId ?? "";
                return stored.includes(tActorId) || stored === tActorId;
            },
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
        if (app.element) app.element.style.display = "none";
        setTimeout(() => { app.close(); WITAQuestBoard.open(); }, 0);
    };

    Hooks.on("renderActorSheetV2",   _closeAndOpen);
    Hooks.on("renderNPCActorSheet",  _closeAndOpen);
    Hooks.on("renderBaseActorSheet", _closeAndOpen);

    Hooks.on("renderActorSheet", (sheet, html) => {
        if (!_isQuestBoardApp(sheet)) return;
        const el = html instanceof HTMLElement ? html : html[0];
        if (!el) return;
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
    if (!game.wita) game.wita = {};
    game.wita.guildhall = {
        openBoard:  () => WITAQuestBoard.open(),
        getQuests,
        resolveNow: () => resolveActiveQuests((witaSetting("bastionState")?.turnNumber ?? 0)),
    };
}
