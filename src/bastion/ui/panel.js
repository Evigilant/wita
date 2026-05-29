// ============================================================
// WITA — BASTION PANEL (shell)
// WITABastionPanel: floating ApplicationV2 window, 6 tabs.
// Opened via scene controls chess-rook icon.
// All players can view; GM controls are conditionally rendered.
//
// ── WITA HOOKS (for external module integration) ─────────────
//
// wita.preSetFacilityOrder(slot, newOrder, oldOrder)
//   Return false to cancel. Return { order: "custom" } to override.
//
// wita.postSetFacilityOrder(slot, finalOrder, oldOrder)
//   Fires after order saved. Use for side effects.
//
// wita.facilityAssigned(slot, item)
// wita.facilityCleared(prevSlot)
//
// ── DEBUG API ────────────────────────────────────────────────
//
//   game.settings.get("wita", "bastion")          — raw bastion state
//   game.settings.get("wita", "engineeringCosts") — vendor/costs data
//   game.wita.bastion.triggerTurn()               — manually trigger turn
//
// ─────────────────────────────────────────────────────────────

import { sanitizeHTML, witaSetting }                   from "../../core/utils.js";
import { getBastionState }                              from "../data/state.js";
import * as tabStatus      from "./tabs/status.js";
import * as tabFacilities  from "./tabs/facilities.js";
import * as tabWorkers     from "./tabs/workers.js";
import * as tabFinance     from "./tabs/finance.js";
import * as tabReports     from "./tabs/reports.js";
import * as tabEngineer    from "./tabs/engineer.js";
import { getBastionData,
         WITA_TIER_ICON, WITA_TIER_LABEL }              from "../data/data.js";

// ── Constants ─────────────────────────────────────────────────

const TABS       = ["status","facilities","workers","finance","reports","engineer"];
const TAB_LABELS = { status:"Status", facilities:"Facilities", workers:"Workers",
                     finance:"Finance", reports:"Reports", engineer:"Engineer" };
const PANEL_ID   = "wita-bastion-panel";
const SIDEBAR_ID = "wita-bastion";

const TAB_BUILDERS = {
    status:     p => tabStatus.build(p),
    facilities: p => tabFacilities.build(p),
    workers:    p => tabWorkers.build(p),
    finance:    p => tabFinance.build(p),
    reports:    p => tabReports.build(p),
    engineer:   p => tabEngineer.build(p),
};

const TAB_LISTENERS = {
    status:     (el, p) => tabStatus.bindListeners(el, p),
    facilities: (el, p) => tabFacilities.bindListeners(el, p),
    workers:    (el, p) => tabWorkers.bindListeners(el, p),
    finance:    (el, p) => tabFinance.bindListeners(el, p),
    reports:    (el, p) => tabReports.bindListeners(el, p),
    engineer:   (el, p) => tabEngineer.bindListeners(el, p),
};

// ── WITABastionPanel ──────────────────────────────────────────

export class WITABastionPanel extends foundry.applications.api.ApplicationV2 {

    constructor(options = {}) {
        super(options);
        this._activeTab = "status";
        this._openSlots = new Set();
    }

    static DEFAULT_OPTIONS = {
        id:     PANEL_ID,
        window: { title: "Von Valancius Bastion", resizable: true },
        position: { width: 460, height: 620 },
        classes: ["wita-bastion-panel"],
    };

    // ── Render ──────────────────────────────────────────────────

    async _renderHTML(context, options) {
        if (this._playerMode && this._activeTab === "engineer") this._activeTab = "status";
        const bst            = await getBastionState();
        const threshold      = witaSetting("longRestsPerTurn") ?? 7;
        const restsRemaining = Math.max(0, threshold - (bst.longRestCount ?? 0));
        this._restState      = { bst, threshold, restsRemaining };
        return await this._buildPanel();
    }

    _replaceHTML(result, content, options) {
        const wc = this.element?.querySelector(".window-content");
        if (!wc) return;
        wc.style.cssText = "padding:0;display:flex;flex-direction:column;overflow:hidden;";
        wc.replaceChildren(result);
        this._activateListeners(wc);
        this._switchTab(this._activeTab, wc);
    }

    async _onRender() {}

    // ── Shell ───────────────────────────────────────────────────

    async _buildPanel() {
        const wrap = document.createElement("div");
        wrap.className = "wita-panel-inner";

        const visibleTabs = this._playerMode ? TABS.filter(t => t !== "engineer") : TABS;

        wrap.appendChild(this._buildHeader());
        wrap.appendChild(this._buildTabStrip(visibleTabs));

        const body = document.createElement("div");
        body.className = "wita-panel-body";
        for (const tab of visibleTabs) {
            const pane = document.createElement("div");
            pane.className = "wita-tab-content";
            pane.dataset.tab = tab;
            pane.appendChild(await TAB_BUILDERS[tab](this));
            body.appendChild(pane);
        }
        wrap.appendChild(body);
        return wrap;
    }

    _buildHeader() {
        const data   = getBastionData();
        const tier   = data.bastionTier ?? 0;
        const header = document.createElement("div");
        header.className = "wita-panel-header";
        header.innerHTML = `
            <span class="wita-tier-badge" title="${WITA_TIER_LABEL[tier]}">${WITA_TIER_ICON[tier]}</span>
            <h2>${sanitizeHTML(witaSetting("bastionName") ?? "Bastion")}</h2>
        `;
        if (this._seneschalActor) {
            const btn = document.createElement("button");
            btn.className = "wita-btn";
            btn.style.cssText = "margin-left:auto;font-size:0.65rem;padding:0.15rem 0.5rem;white-space:nowrap";
            btn.innerHTML = `<i class="fas fa-user"></i> Open Sheet`;
            btn.addEventListener("click", () => {
                const actor = this._seneschalActor;
                if (!actor) return;
                _seneschalBypass.add(actor.id);
                setTimeout(() => _seneschalBypass.delete(actor.id), 2000);
                actor.sheet?.render({ force: true });
            });
            header.appendChild(btn);
        }
        return header;
    }

    _buildTabStrip(tabs = TABS) {
        const strip = document.createElement("nav");
        strip.className = "wita-tabs";
        for (const tab of tabs) {
            const btn = document.createElement("button");
            btn.className   = "wita-tab-btn";
            btn.dataset.tab = tab;
            btn.textContent = TAB_LABELS[tab];
            strip.appendChild(btn);
        }
        return strip;
    }

    // ── Listeners ────────────────────────────────────────────────

    _activateListeners(container) {
        // Tab strip
        container.querySelectorAll(".wita-tab-btn").forEach(btn =>
            btn.addEventListener("click", () => this._switchTab(btn.dataset.tab, container))
        );

        // Delegate to each tab's bindListeners, scoped to its own pane
        for (const tab of TABS) {
            const pane = container.querySelector(`.wita-tab-content[data-tab="${tab}"]`);
            if (pane) TAB_LISTENERS[tab]?.(pane, this);
        }
    }

    _switchTab(tabId, container) {
        if (!TABS.includes(tabId)) return;
        this._activeTab = tabId;
        container.querySelectorAll(".wita-tab-btn").forEach(b =>
            b.classList.toggle("active", b.dataset.tab === tabId)
        );
        container.querySelectorAll(".wita-tab-content").forEach(p =>
            p.classList.toggle("active", p.dataset.tab === tabId)
        );
    }

    // ── Worker dialogs (called from WITAFacilityDetail + workers tab) ──

    async _openWorkerDialog(workerId) {
        return tabWorkers.openWorkerDialog(this, workerId);
    }

    async _openWorkerDialogForSlot(slotId) {
        return tabWorkers.openWorkerDialogForSlot(this, slotId);
    }

    // ── Cost dialog (called from engineer tab) ────────────────────

    async _openCostDialog(itemIdOrKey, isMeta) {
        return tabEngineer.openCostDialog(this, itemIdOrKey, isMeta);
    }
}

// ── Registration ──────────────────────────────────────────────

export function registerBastionPanel() {
    CONFIG.ui[SIDEBAR_ID] = WITABastionPanel;

    const _witaOpenPanel = () => {
        const existing = foundry.applications.instances.get(PANEL_ID);
        if (existing?.rendered) { existing.bringToFront(); return; }
        const panel = new WITABastionPanel();
        panel._playerMode = !game.user.isGM;
        panel.render({ force: true });
    };

    const _witaInjectButton = () => {
        if (document.querySelector("#wita-bastion-btn")) return;
        const toolsMenu = document.querySelector("#scene-controls-tools");
        if (!toolsMenu) return;

        const li  = document.createElement("li");
        li.id = "wita-bastion-btn";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "control ui-control tool icon button fa-solid fa-chess-rook";
        btn.setAttribute("data-action",   "tool");
        btn.setAttribute("data-tool",     "wita-bastion");
        btn.setAttribute("aria-label",    "Von Valancius Bastion");
        btn.setAttribute("aria-pressed",  "false");
        btn.setAttribute("data-tooltip",  "Von Valancius Bastion");
        btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); _witaOpenPanel(); });
        li.appendChild(btn);
        toolsMenu.appendChild(li);
    };

    Hooks.on("renderSceneControls", _witaInjectButton);

    // Auto-refresh when data changes
    Hooks.on("updateWorld",   () => { const p = foundry.applications.instances.get(PANEL_ID); if (p?.rendered) p.render({ force: true }); });
    Hooks.on("updateSetting", s  => { if (s.namespace !== "wita") return; const p = foundry.applications.instances.get(PANEL_ID); if (p?.rendered) p.render({ force: true }); });
    Hooks.on("createItem",    i  => { if (i.getFlag?.("wita","customFacility")) { const p = foundry.applications.instances.get(PANEL_ID); if (p?.rendered) p.render({ force: true }); }});
    Hooks.on("deleteItem",    i  => { if (i.getFlag?.("wita","customFacility")) { const p = foundry.applications.instances.get(PANEL_ID); if (p?.rendered) p.render({ force: true }); }});

    // ── Seneschal intercept ────────────────────────────────────────

    // Actor IDs temporarily allowed to open their sheet (from the "Open Sheet" button).
    // Cleared after a short timeout so the intercept resumes for future interactions.
    const _seneschalBypass = new Set();

    const _isSeneschal = (actor) => {
        const seneschalId = witaSetting("seneschalActorId");
        if (!seneschalId || !actor) return false;
        const uuid = actor?.uuid ?? "";
        const id   = actor?.id ?? "";
        return seneschalId === uuid || seneschalId === id
            || uuid.includes(seneschalId) || seneschalId.includes(id);
    };

    const _isSeneschalApp = (app) => _isSeneschal(app.document ?? app.actor);

    if (game.modules.get("lib-wrapper")?.active) {
        try {
            libWrapper.register("wita", "foundry.appv1.sheets.ActorSheet.prototype.render", function(wrapped, ...args) {
                const options = args[1] ?? args[0] ?? {};
                if (options?._witaBastionBypass) return wrapped(...args);
                if (_isSeneschalApp(this)) { _witaOpenPlayerPanel(this.document ?? this.actor); return this; }
                return wrapped(...args);
            }, "MIXED");
        } catch(e) { /* ActorSheet may not exist in pure V2 environments */ }

        try {
            libWrapper.register("wita", "dnd5e.applications.actor.NPCActorSheet.prototype.render", function(wrapped, ...args) {
                const options = (typeof args[0] === "object") ? args[0] : (args[1] ?? {});
                if (options?._witaBastionBypass) return wrapped(...args);
                if (_isSeneschalApp(this)) { _witaOpenPlayerPanel(this.document ?? this.actor); return Promise.resolve(); }
                return wrapped(...args);
            }, "MIXED");
        } catch(e) { console.warn("WITA | Could not wrap NPCActorSheet.render:", e); }
    }

    // Always register render hooks as a safety net — preRenderApplication cancellation is
    // unreliable in v14 ApplicationV2, and libWrapper may target a stale class path.
    const _seneschalClose = (app) => {
        if (app.id === PANEL_ID) return;
        const actor = app.document ?? app.actor;
        if (_seneschalBypass.has(actor?.id)) return;
        if (!_isSeneschalApp(app)) return;
        if (app.element) app.element.style.display = "none";
        setTimeout(() => app.close(), 0);
        _witaOpenPlayerPanel(actor);
    };
    Hooks.on("renderActorSheetV2",   _seneschalClose);
    Hooks.on("renderNPCActorSheet",  _seneschalClose);
    Hooks.on("renderBaseActorSheet", _seneschalClose);

    Hooks.on("preRenderApplication", (app, options) => {
        if (options?._witaBastionBypass) return true;
        const actor = app.document ?? app.actor;
        if (_seneschalBypass.has(actor?.id)) return true;
        if (app.id === PANEL_ID) return true;
        if (!_isSeneschalApp(app)) return true;
        _witaOpenPlayerPanel(actor);
        return false;
    });

    Hooks.on("getTokenContextOptions", (token, options) => {
        const seneschalId = witaSetting("seneschalActorId");
        if (!seneschalId) return;
        const tokenActorId   = token.document?.actorId ?? "";
        const tokenActorUuid = token.document?.actor?.uuid ?? "";
        const matches = seneschalId === tokenActorId || seneschalId === tokenActorUuid
                     || tokenActorUuid.includes(seneschalId) || seneschalId.includes(tokenActorId);
        if (!matches) return;
        options.unshift({
            name: "Open Bastion",
            icon: "<i class='fas fa-chess-rook'></i>",
            callback: () => _witaOpenPlayerPanel(token.document?.actor ?? null),
        });
    });
}

function _witaOpenPlayerPanel(seneschalActor = null) {
    const existing = foundry.applications.instances.get(PANEL_ID);
    if (existing?.rendered) { existing.bringToFront(); return; }
    const panel = new WITABastionPanel();
    panel._playerMode     = !game.user.isGM;
    panel._seneschalActor = seneschalActor;
    panel.render({ force: true });
}
