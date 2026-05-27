// ============================================================
// WITA — BASTION PANEL
// WITABastionPanel: floating Application window, 6 tabs.
// Opened via a button in the scene controls (left sidebar).
// All players can view; GM controls are conditionally rendered.
//
// ── WITA HOOKS (for external module integration) ─────────────
//
// wita.preSetFacilityOrder(slot, newOrder, oldOrder)
//   Fires before a facility order is saved.
//   Return false to cancel. Return { order: "custom" } to override.
//   Use case: guildhall intercepts "recruit" to open quest UI instead.
//
// wita.postSetFacilityOrder(slot, finalOrder, oldOrder)
//   Fires after order is saved. Use for side effects (open quest UI, etc).
//   Use case: guildhall opens mission assignment panel on "recruit".
//
// wita.facilityAssigned(slot, item)
//   Fires when a facility item is placed in a slot.
//   Use case: guildhall module registers a slot as a quest hub.
//
// wita.facilityCleared(prevSlot)
//   Fires when a facility is removed from a slot.
//   Use case: guildhall tears down quest hub for that slot.
//
// ── USAGE EXAMPLE ────────────────────────────────────────────
//
//   Hooks.on("wita.preSetFacilityOrder", (slot, newOrder, oldOrder) => {
//     if (slot.facilityItemId !== "myGuildhallItemId") return; // not our facility
//     if (newOrder !== "recruit") return;                       // not our order
//     MyGuildhallModule.openMissionPanel(slot);
//     return false; // cancel default save — we'll handle it
//   });
//
// ── ACCESSING BASTION DATA ────────────────────────────────────
//
//   game.settings.get("wita", "bastion")       — raw bastion state
//   game.wita.bastion.getState()               — same via debug API
//   game.settings.get("wita", "engineeringCosts") — vendor/costs data
//
// ─────────────────────────────────────────────────────────────

import { sanitizeHTML, witaSetting }              from "../core/utils.js";
import { getBastionData, saveBastionData,
         getEngineeringData, saveEngineeringData, getAllFacilities,
         WITA_HEALTH_STATES, WITA_HEALTH_ICON,
         WITA_SIZE_ICON, WITA_SIZE_LABEL,
         WITA_ORDER_ICON, WITA_ORDER_LABEL,
         WITA_TIER_ICON, WITA_TIER_LABEL,
         WITA_WORKER_STATUSES,
         WITA_MORALE_COLOUR, WITA_MORALE_LABEL,
         WITA_DMG_FACILITIES,
         allSlots, occupiedSlots,
         _emptySlotFields,
         deleteCustomFacility }                   from "./bastion-data.js";
import { calcProductivity, findSlot,
         assignFacilityToSlot, clearSlot,
         enlargeSlot, shrinkSlot, setSlotHealth,
         adjustSlotCapacity, addSlot,
         getSizeLimits,
         removeLastEmptySlot, setBastionTier }    from "./bastion-slots.js";
import { getAllWorkers, getUnassignedWorkers,
         liveDefenderCount,
         createWorker, updateWorker, deleteWorker,
         assignWorkerToSlot, addDefender,
         removeDefender, setDefenderAlive }       from "./bastion-workers.js";
import { getBastionState, saveBastionState }        from "./bastion-state.js";
import { getFinancialSummary }                    from "./bastion-finance.js";
import { getFacilityCost, setFacilityCost,
         getMetaCost, setMetaCost,
         createEngineerVendor, syncVendorPrices,
         openCustomFacilityDialog,
         addCustomFacilityToVendor,
         _addFacilityToStock,
         _removeFacilityFromStock,
         seedBastionMetaItems }                 from "./bastion-engineer.js";

// ── Constants ─────────────────────────────────────────────────

const TABS       = ["status","facilities","workers","finance","reports","engineer"];
const TAB_LABELS = { status:"Status", facilities:"Facilities", workers:"Workers",
                     finance:"Finance", reports:"Reports", engineer:"Engineer" };
const PANEL_ID   = "wita-bastion-panel";
const SIDEBAR_ID = "wita-bastion";

// ── WITAFacilityDetail ───────────────────────────────────────

class WITAFacilityDetail extends foundry.applications.api.ApplicationV2 {

    constructor(slot, allWorkers, restState, panelInstance, options = {}) {
        super(options);
        this._slot          = slot;
        this._allWorkers    = allWorkers;
        this._restState     = restState;
        this._panel         = panelInstance;
    }

    static DEFAULT_OPTIONS = {
        window:   { resizable: false },
        position: { width: 400, height: "auto" },
        classes:  ["wita-facility-detail"],
    };

    get title() {
        return sanitizeHTML(this._slot?.facilityName ?? "Facility");
    }

    async _renderHTML(context, options) {
        // Build fully-populated content — Foundry injects via _replaceHTML,
        // which lets it measure real content for resize handle setup.
        const inner = document.createElement("div");
        inner.className = "wita-fd-body";

        const slot      = this._slot;
        const allFac    = getAllFacilities();
        const meta      = allFac[slot.facilityItemId] ?? {};
        const validOrder = meta.order ?? "";
        const restsLeft  = this._restState?.restsRemaining ?? 0;
        const limits     = getSizeLimits(getBastionData());
        const enlargeable = slot.facilitySize !== "vast"   && (slot.facilitySize !== "roomy" || limits.availRoomy > 0 || slot.facilitySize === "cramped");
        const shrinkable  = slot.facilitySize !== "cramped";
        const hIcon       = WITA_HEALTH_ICON[slot.health] ?? "❓";
        const sIcon       = slot.facilitySize ? WITA_SIZE_ICON[slot.facilitySize] : "";

        // Load and enrich description
        let description = "";
        if (slot.facilityUuid) {
            try {
                const item = await fromUuid(slot.facilityUuid);
                const raw  = item?.system?.description?.value ?? "";
                const embedMatch = raw.match(/@Embed\[([^\]]+)\]/);
                if (embedMatch) {
                    try {
                        const embedDoc = await fromUuid(embedMatch[1].split(" ")[0]);
                        const pageText = embedDoc?.text?.content ?? embedDoc?.content ?? "";
                        if (pageText) {
                            description = await TextEditor.enrichHTML(pageText, {
                                async: true, relativeTo: embedDoc, secrets: game.user.isGM,
                            });
                        }
                    } catch { /* embed target not found */ }
                }
                if (!description && raw) {
                    description = await TextEditor.enrichHTML(raw, {
                        async: true, relativeTo: item, secrets: game.user.isGM,
                    });
                    description = description
                        .replace(/@\w+\[[^\]]*\]\{[^}]*\}/g, "")
                        .replace(/@\w+\[[^\]]*\]/g, "")
                        .trim();
                }
            } catch { /* no description */ }
        }

        const orderOptions = validOrder
            ? [["", "— None —"], [validOrder, `${WITA_ORDER_ICON[validOrder] ?? ""} ${WITA_ORDER_LABEL[validOrder] ?? validOrder}`]]
            : [];
        const timeLabel = slot.facilityOrder && validOrder
            ? (restsLeft === 0 ? `<span style="color:var(--color-level-success)">✓ Ready this turn</span>`
                               : `<span style="color:var(--color-form-hint)">~${restsLeft} day${restsLeft !== 1 ? "s" : ""}</span>`)
            : "";

        // Hirelings for this slot
        const slotWorkers = (getBastionData().workers ?? []).filter(w =>
            (slot.workerIds ?? []).includes(w.id)
        );

        inner.innerHTML = `
            <div class="wita-fd-top">
                <div class="wita-fd-img-col">
                    <img src="${sanitizeHTML(slot.facilityImg ?? "icons/svg/castle.svg")}" class="wita-fd-img">
                    <div class="wita-fd-stat">${sIcon} ${WITA_SIZE_LABEL[slot.facilitySize] ?? ""}</div>
                    <div class="wita-fd-stat">${hIcon} ${slot.health ?? ""}</div>
                    ${slot.facilityLevelReq ? `<div class="wita-fd-stat">Lv ${slot.facilityLevelReq}+</div>` : ""}
                    ${meta.prereq && meta.prereq !== "None" ? `<div class="wita-fd-stat" title="${sanitizeHTML(meta.prereq)}">Req ⚠</div>` : ""}
                </div>
                <div class="wita-fd-controls-col">
                    ${orderOptions.length ? `
                    <div class="wita-fd-field">
                        <label>Order ${timeLabel}</label>
                        <select id="wita-fd-order">
                            ${orderOptions.map(([val, lbl]) =>
                                `<option value="${val}" ${(slot.facilityOrder ?? "") === val ? "selected" : ""}>${lbl}</option>`
                            ).join("")}
                        </select>
                    </div>` : ""}
                    ${game.user.isGM ? `
                    <div class="wita-fd-field">
                        <label>Health</label>
                        <select id="wita-fd-health">
                            ${WITA_HEALTH_STATES.map(h =>
                                `<option value="${h}" ${h === slot.health ? "selected" : ""}>${WITA_HEALTH_ICON[h]} ${h}</option>`
                            ).join("")}
                        </select>
                    </div>
                    <div class="wita-fd-gm-btns">
                        ${shrinkable  ? `<button id="wita-fd-shrink"  class="wita-detail-micro-btn">← Smaller</button>` : ""}
                        ${enlargeable ? `<button id="wita-fd-enlarge" class="wita-detail-micro-btn">→ Larger</button>`  : ""}
                        <button id="wita-fd-clear" class="wita-detail-micro-btn danger" style="margin-left:auto">✕ Remove</button>
                    </div>` : ""}
                </div>
            </div>
            <div class="wita-fd-desc">
                ${description ? description : `<em style="color:var(--color-form-hint)">No description available.</em>`}
            </div>
            <div class="wita-fd-hirelings">
                <div class="wita-detail-section-label">Hirelings</div>
                ${slotWorkers.length === 0
                    ? `<div class="wita-detail-empty">No hirelings assigned.</div>`
                    : slotWorkers.map(w => `
                        <div class="wita-detail-hireling-row">
                            <span class="wita-detail-hireling-name">${sanitizeHTML(w.name)}</span>
                            <span class="wita-detail-hireling-role">${sanitizeHTML(w.role ?? "")}</span>
                            ${game.user.isGM ? `
                                <button class="wita-detail-micro-btn wita-fd-hireling-edit"   data-worker-id="${w.id}" title="Edit">✎</button>
                                <button class="wita-detail-micro-btn danger wita-fd-hireling-remove" data-worker-id="${w.id}" title="Remove">✕</button>
                            ` : ""}
                        </div>`).join("")
                }
                ${game.user.isGM ? `<button class="wita-detail-micro-btn wita-fd-add-hireling" style="margin-top:0.3rem"><i class="fas fa-plus"></i> Add Hireling</button>` : ""}
            </div>
            ${(() => {
                // Smithy commission status
                const smithyOrder = slot.flags?.wita?.smithyOrder;
                if (!smithyOrder) return "";
                const turnNow    = this._restState?.bst?.turnNumber ?? 0;
                const turnsLeft  = Math.max(0, smithyOrder.turnsRequired - (turnNow - smithyOrder.turnStarted));
                const rLabel     = { common:"Common", uncommon:"Uncommon", rare:"Rare", veryrare:"Very Rare" }[smithyOrder.rarity] ?? smithyOrder.rarity;
                return `
                    <div class="wita-fd-section-label" style="margin-top:0.5rem">Active Commission</div>
                    <div class="wita-smithy-commission">
                        <i class="fas fa-hammer"></i>
                        <span><strong>${smithyOrder.quantity}×</strong> ${sanitizeHTML(smithyOrder.itemName)}</span>
                        <span class="wita-smithy-rarity-badge">${rLabel}</span>
                        <span class="wita-smithy-turns-left">
                            <i class="fas fa-hourglass-half"></i> ${turnsLeft} turn${turnsLeft !== 1 ? "s" : ""} left
                        </span>
                        <span class="wita-smithy-dc">DC ${smithyOrder.dc}</span>
                    </div>`;
            })()}
        `;
        return inner;
    }

    _replaceHTML(result, content, options) {
        const wc = this.element?.querySelector(".window-content");
        if (!wc) return;
        wc.style.cssText = "padding:0;display:flex;flex-direction:column;overflow:hidden;";
        wc.replaceChildren(result);
        this._attachListeners(wc);
    }

    async _onRender(context, options) {
        // Listeners attached in _replaceHTML — nothing to do here.
    }

    _attachListeners(el) {
        const slot    = this._slot;
        const panel   = this._panel;
        const refresh = async () => { await panel?.render({ force: true }); await this.render({ force: true }); };

        el.querySelector("#wita-fd-order")?.addEventListener("change", async (e) => {
            const data       = getBastionData();
            const s          = findSlot(data, slot.id);
            if (!s) return;
            const newOrder   = e.target.value || null;
            const oldOrder   = s.facilityOrder ?? null;
            const hookResult = Hooks.call("wita.preSetFacilityOrder", s, newOrder, oldOrder);
            if (hookResult === false) { e.target.value = oldOrder ?? ""; return; }
            const finalOrder = (typeof hookResult === "object" && hookResult?.order !== undefined) ? hookResult.order : newOrder;
            s.facilityOrder   = finalOrder || null;
            s.orderStartTurn  = finalOrder ? (this._restState?.bst?.turnNumber ?? 0) : null;
            s.orderStartRests = finalOrder ? (this._restState?.bst?.longRestCount ?? 0) : null;
            const pool = data.basicSlots?.find(x => x.id === s.id) ? "basicSlots" : "specialSlots";
            const idx  = data[pool].findIndex(x => x.id === s.id);
            if (idx >= 0) data[pool][idx] = s;
            await saveBastionData(data);
            Hooks.callAll("wita.postSetFacilityOrder", s, finalOrder, oldOrder);
            this._slot = s;
            await refresh();
        });

        el.querySelector("#wita-fd-health")?.addEventListener("change", async (e) => {
            await setSlotHealth(slot.id, e.target.value);
            await refresh();
        });

        el.querySelector("#wita-fd-shrink")?.addEventListener("click", async () => {
            await shrinkSlot(slot.id);
            await refresh();
        });
        el.querySelector("#wita-fd-enlarge")?.addEventListener("click", async () => {
            await enlargeSlot(slot.id);
            await refresh();
        });
        el.querySelector("#wita-fd-clear")?.addEventListener("click", async () => {
            const confirmed = await foundry.applications.api.DialogV2.confirm({
                window: { title: "Remove Facility" },
                content: `<p>Remove <strong>${sanitizeHTML(slot.facilityName ?? "this facility")}</strong>?</p>`,
            }).catch(() => false);
            if (!confirmed) return;
            await clearSlot(slot.id);
            await panel?.render({ force: true });
            this.close();
        });

        el.querySelectorAll(".wita-fd-hireling-edit").forEach(btn => {
            btn.addEventListener("click", () => panel?._openWorkerDialog(btn.dataset.workerId));
        });
        el.querySelectorAll(".wita-fd-hireling-remove").forEach(btn => {
            btn.addEventListener("click", async () => {
                await deleteWorker(btn.dataset.workerId);
                await refresh();
            });
        });
        el.querySelector(".wita-fd-add-hireling")?.addEventListener("click", () => {
            panel?._openWorkerDialogForSlot(slot.id);
        });
    }
}

// ── WITABastionPanel ──────────────────────────────────────────

export class WITABastionPanel extends foundry.applications.api.ApplicationV2 {

    constructor(options = {}) {
        super(options);
        this._activeTab = "status";
        this._openSlots = new Set();
    }

    static DEFAULT_OPTIONS = {
        id:        PANEL_ID,
        window: {
            title:     "Von Valancius Bastion",
            resizable: true,
        },
        position: {
            width:  460,
            height: 620,
        },
        classes:   ["wita-bastion-panel"],
    };

    // Required by ApplicationV2
    // ── Render ──────────────────────────────────────────────────
    // ApplicationV2: required abstract methods
    // _renderHTML builds full panel content; _replaceHTML injects it so Foundry
    // can measure it for resize/chrome setup before _onRender fires.
    async _renderHTML(context, options) {
        // In player mode, reset active tab if it's engineer
        if (this._playerMode && this._activeTab === "engineer") this._activeTab = "status";
        // Cache rest state so synchronous tab builders can access it
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

    async _onRender(context, options) {
        // Listeners and tab state are set in _replaceHTML — nothing to do here.
    }

    // ── Shell ───────────────────────────────────────────────────

    async _buildPanel() {
        const wrap = document.createElement("div");
        wrap.className = "wita-panel-inner";

        const visibleTabs = this._playerMode
            ? TABS.filter(t => t !== "engineer")
            : TABS;

        wrap.appendChild(this._buildHeader());
        wrap.appendChild(this._buildTabStrip(visibleTabs));

        const body = document.createElement("div");
        body.className = "wita-panel-body";
        for (const tab of visibleTabs) {
            const pane = document.createElement("div");
            pane.className = "wita-tab-content";
            pane.dataset.tab = tab;
            pane.appendChild(await this._buildTab(tab));
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
                this._seneschalActor.sheet?.render({ force: true, _witaBastionBypass: true });
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

    // ── Tab dispatch ────────────────────────────────────────────

    async _buildTab(tab) {
        const frag = document.createDocumentFragment();
        const map  = {
            status:     async () => await this._buildStatusTab(),
            facilities: () => this._buildFacilitiesTab(),
            workers:    () => this._buildWorkersTab(),
            finance:    () => this._buildFinanceTab(),
            reports:    () => this._buildReportsTab(),
            engineer:   () => this._buildEngineerTab(),
        };
        const built = await (map[tab]?.() ?? Promise.resolve(document.createElement("div")));
        frag.appendChild(built);
        return frag;
    }

    // ── Status tab ──────────────────────────────────────────────

    async _buildStatusTab() {
        const el        = document.createElement("div");
        const data      = getBastionData();
        const bst       = await getBastionState();
        const threshold = witaSetting("longRestsPerTurn") ?? 7;
        const restCount = bst.longRestCount ?? 0;
        const pct       = Math.min(Math.round((restCount / threshold) * 100), 100);
        const workers   = data.workers ?? [];
        const active    = workers.filter(w => w.status === "Active").length;
        const defCount  = liveDefenderCount(data);
        const avgMorale = workers.length
            ? Math.round(workers.reduce((s, w) => s + (w.morale ?? 50), 0) / workers.length)
            : "—";
        const occupied  = occupiedSlots(data).length;
        const totalSlots= (data.basicSlots?.length ?? 0) + (data.specialSlots?.length ?? 0);
        const tier      = data.bastionTier ?? 0;
        const limits    = getSizeLimits(data);

        el.innerHTML = `
            <div class="wita-section-label">Bastion</div>
            <div class="wita-stat-grid">
                <div class="wita-stat-card">
                    <div class="wita-stat-value">${WITA_TIER_ICON[tier]}</div>
                    <div class="wita-stat-label">${WITA_TIER_LABEL[tier]}</div>
                </div>
                <div class="wita-stat-card">
                    <div class="wita-stat-value">${bst.turnNumber ?? 0}</div>
                    <div class="wita-stat-label">Turn</div>
                </div>
                <div class="wita-stat-card">
                    <div class="wita-stat-value">${occupied}/${totalSlots}</div>
                    <div class="wita-stat-label">Facilities</div>
                </div>
                <div class="wita-stat-card">
                    <div class="wita-stat-value">${defCount}</div>
                    <div class="wita-stat-label">Defenders</div>
                </div>
            </div>
            <div class="wita-section-label">Size Slots</div>
            <div class="wita-stat-grid">
                <div class="wita-stat-card">
                    <div class="wita-stat-value">${limits.usedRoomy}/${limits.maxRoomy}</div>
                    <div class="wita-stat-label">Roomy Used</div>
                </div>
                <div class="wita-stat-card">
                    <div class="wita-stat-value">${limits.availRoomy}</div>
                    <div class="wita-stat-label">Roomy Free</div>
                </div>
                <div class="wita-stat-card">
                    <div class="wita-stat-value">${limits.usedVast}/${limits.maxVast}</div>
                    <div class="wita-stat-label">Vast Used</div>
                </div>
                <div class="wita-stat-card">
                    <div class="wita-stat-value">${limits.availVast}</div>
                    <div class="wita-stat-label">Vast Free</div>
                </div>
            </div>
            ${game.user.isGM ? `
            <div style="display:flex;gap:0.5rem;margin-top:0.4rem;align-items:center;flex-wrap:wrap">
                <span style="font-size:0.72rem;color:var(--color-form-label);white-space:nowrap">Roomy Licenses: ${data.roomyLicenses ?? 0}</span>
                <button class="wita-btn wita-size-license-btn" data-type="roomy" data-delta="1"  style="font-size:0.65rem;padding:0.1rem 0.4rem">+</button>
                <button class="wita-btn wita-size-license-btn" data-type="roomy" data-delta="-1" style="font-size:0.65rem;padding:0.1rem 0.4rem">−</button>
                <span style="font-size:0.72rem;color:var(--color-form-label);white-space:nowrap;margin-left:0.5rem">Vast Licenses: ${data.vastLicenses ?? 0}</span>
                <button class="wita-btn wita-size-license-btn" data-type="vast" data-delta="1"  style="font-size:0.65rem;padding:0.1rem 0.4rem">+</button>
                <button class="wita-btn wita-size-license-btn" data-type="vast" data-delta="-1" style="font-size:0.65rem;padding:0.1rem 0.4rem">−</button>
            </div>` : ""}
            <div class="wita-section-label">Hirelings</div>
            <div class="wita-stat-grid">
                <div class="wita-stat-card">
                    <div class="wita-stat-value">${active}</div>
                    <div class="wita-stat-label">Active</div>
                </div>
                <div class="wita-stat-card">
                    <div class="wita-stat-value">${avgMorale}</div>
                    <div class="wita-stat-label">Avg Morale</div>
                </div>
            </div>
            <div class="wita-section-label">Rest Progress</div>
            <div class="wita-progress-row">
                <div class="wita-progress-bar-wrap">
                    <div class="wita-progress-bar" style="width:${pct}%"></div>
                </div>
                <span class="wita-progress-label">${restCount} / ${threshold}</span>
                ${game.user.isGM ? `
                <button class="wita-cap-btn wita-rest-adj" data-delta="-1" title="Remove rest">−</button>
                <button class="wita-cap-btn wita-rest-adj" data-delta="1" title="Add rest">+</button>
                ` : ""}
            </div>
            ${bst.pendingFluctuationType ? `
            <div class="wita-section-label">Pending Action</div>
            <p style="font-size:0.72rem;margin:0 0 0.4rem">Collect Earnings type:<br>
                <span class="wita-badge">${sanitizeHTML(bst.pendingFluctuationType)}</span></p>` : ""}
            ${game.user.isGM ? `
            <div class="wita-section-label">GM Controls</div>
            <div class="wita-btn-row">
                <button class="wita-btn" id="wita-trigger-turn"><i class="fas fa-dice-d20"></i> Trigger Turn</button>
                <button class="wita-btn" id="wita-open-journal"><i class="fas fa-book-open"></i> Journal</button>
            </div>
            <div class="wita-btn-row" style="align-items:center;gap:0.5rem;margin-top:0.4rem">
                <label style="font-size:0.72rem;color:var(--color-form-label);white-space:nowrap">Bastion Tier</label>
                <select id="wita-tier-select" style="flex:1;background:var(--color-cool-5);color:var(--color-text-primary);border:1px solid var(--color-fieldset-border);border-radius:3px;padding:0.15rem 0.3rem;font-size:0.72rem">
                    <option value="0" ${tier === 0 ? "selected" : ""}>0 — Unbuilt</option>
                    <option value="1" ${tier === 1 ? "selected" : ""}>I — Cramped</option>
                    <option value="2" ${tier === 2 ? "selected" : ""}>II — Roomy</option>
                    <option value="3" ${tier === 3 ? "selected" : ""}>III — Vast</option>
                </select>
            </div>` : ""}
        `;
        return el;
    }

    // ── Facilities tab ───────────────────────────────────────────

    _buildFacilitiesTab() {
        const el        = document.createElement("div");
        const data      = getBastionData();
        const restState = this._restState ?? { restsRemaining: 0, threshold: 7 };

        if (game.user.isGM) {
            const ctrl = document.createElement("div");
            ctrl.className = "wita-slot-pool-controls";
            ctrl.innerHTML = `
                <span class="wita-pool-label">Basic</span>
                <button class="wita-pool-btn" data-pool="basic" data-delta="-1">−</button>
                <span>${data.basicSlots?.length ?? 0}</span>
                <button class="wita-pool-btn" data-pool="basic" data-delta="1">+</button>
                <span class="wita-pool-label" style="margin-left:0.75rem">Special</span>
                <button class="wita-pool-btn" data-pool="special" data-delta="-1">−</button>
                <span>${data.specialSlots?.length ?? 0}</span>
                <button class="wita-pool-btn" data-pool="special" data-delta="1">+</button>
            `;
            el.appendChild(ctrl);
        }

        if ((data.basicSlots?.length ?? 0) > 0) {
            const lbl = document.createElement("div");
            lbl.className = "wita-section-label";
            lbl.textContent = "Basic Facilities";
            el.appendChild(lbl);
            const grid = document.createElement("div");
            grid.className = "wita-slots-grid";
            for (const slot of (data.basicSlots ?? [])) {
                grid.appendChild(this._buildSlotCard(slot, data.workers ?? [], restState));
            }
            el.appendChild(grid);
        }

        if ((data.specialSlots?.length ?? 0) > 0) {
            const lbl = document.createElement("div");
            lbl.className = "wita-section-label";
            lbl.textContent = "Special Facilities";
            el.appendChild(lbl);
            const grid = document.createElement("div");
            grid.className = "wita-slots-grid";
            for (const slot of (data.specialSlots ?? [])) {
                grid.appendChild(this._buildSlotCard(slot, data.workers ?? [], restState));
            }
            el.appendChild(grid);
        }

        if ((data.basicSlots?.length ?? 0) === 0 && (data.specialSlots?.length ?? 0) === 0) {
            el.innerHTML += `<div class="wita-empty">No facility slots yet. Add slots using the controls above, or purchase them from the Engineer vendor.</div>`;
        }

        return el;
    }

    _buildSlotCard(slot, allWorkers, restState = { restsRemaining: 0, threshold: 7 }) {
        const wrap = document.createElement("div");
        wrap.className = `wita-slot${slot.facilityUuid ? "" : " empty"}`;
        wrap.dataset.slotId = slot.id;

        if (!slot.facilityUuid) {
            wrap.innerHTML = `
                <div class="wita-slot-header wita-slot-empty-header">
                    <span style="opacity:0.35;font-size:1rem">🏚</span>
                    <span class="wita-slot-name" style="font-style:italic;opacity:0.5">Empty Slot</span>
                    ${game.user.isGM ? `<span style="font-size:0.6rem;color:var(--color-form-hint)">Drop facility here</span>` : ""}
                </div>
            `;
            return wrap;
        }

        const allFac     = getAllFacilities();
        const meta       = allFac[slot.facilityItemId] ?? {};
        const hIcon      = WITA_HEALTH_ICON[slot.health] ?? "❓";
        const sIcon      = slot.facilitySize ? WITA_SIZE_ICON[slot.facilitySize] : "";
        const oIcon      = slot.facilityOrder ? WITA_ORDER_ICON[slot.facilityOrder] : "";
        const oLabel     = slot.facilityOrder ? WITA_ORDER_LABEL[slot.facilityOrder] : "";
        const validOrder = meta.order ?? "";
        const restsLeft  = restState.restsRemaining;
        const isBasic    = slot.facilityType === "basic";
        const prod       = calcProductivity(slot, allWorkers);

        // Completion time label
        const timeLabel = slot.facilityOrder
            ? (restsLeft === 0 ? `<span style="color:var(--color-level-success);font-size:0.65rem">✓ This turn</span>`
                               : `<span style="color:var(--color-form-hint);font-size:0.65rem">~${restsLeft}d</span>`)
            : "";

        // Quick order toggle button (players + GM)
        const quickOrder = validOrder ? `
            <button class="wita-btn wita-quick-order-btn${slot.facilityOrder ? " order-active" : ""}" data-slot-id="${slot.id}"
                data-order="${slot.facilityOrder ? "" : validOrder}"
                title="${slot.facilityOrder ? "Cancel order" : `Issue: ${WITA_ORDER_LABEL[validOrder]}`}">
                ${slot.facilityOrder ? `${oIcon} Active` : `${WITA_ORDER_ICON[validOrder]} Issue`}
            </button>` : "";

        wrap.innerHTML = `
            <div class="wita-slot-compact" data-slot-id="${slot.id}">
                <img src="${sanitizeHTML(slot.facilityImg ?? "icons/svg/castle.svg")}" alt="" class="wita-slot-thumb">
                <div class="wita-slot-info">
                    <div class="wita-slot-name">${sanitizeHTML(slot.facilityName ?? "")}</div>
                    <div class="wita-slot-sub">
                        ${sIcon ? `<span>${sIcon} ${WITA_SIZE_LABEL[slot.facilitySize]}</span>` : ""}
                        ${oLabel ? `<span>${oIcon} ${oLabel}</span>` : ""}
                        ${timeLabel}
                        ${(() => {
                            const so = slot.flags?.wita?.smithyOrder;
                            if (!so) return "";
                            const turnNow   = restState?.bst?.turnNumber ?? 0;
                            const turnsLeft = Math.max(0, so.turnsRequired - (turnNow - so.turnStarted));
                            return `<span style="color:var(--color-highlights);font-size:0.6rem"><i class="fas fa-hammer"></i> ${sanitizeHTML(so.itemName)} (${turnsLeft}t)</span>`;
                        })()}
                    </div>
                </div>
                <div class="wita-slot-actions">
                    <span class="wita-slot-health">${hIcon}</span>
                    ${!isBasic && prod !== null ? `<span class="wita-slot-prod">${prod}%</span>` : ""}
                    ${quickOrder}
                    <i class="fas fa-circle-info wita-slot-info-icon" title="View details"></i>
                </div>
            </div>
        `;

        // Click on the card (not the quick-order button) opens the detail popup
        wrap.querySelector(".wita-slot-compact").addEventListener("click", (e) => {
            if (e.target.closest(".wita-quick-order-btn")) return;
            this._openFacilityDetail(slot, allWorkers, restState);
        });

        return wrap;
    }

    async _openFacilityDetail(slot, allWorkers, restState) {
        const appId = `wita-facility-detail-${slot.id}`;
        const existing = foundry.applications.instances.get(appId);
        if (existing) { existing.bringToFront(); return; }
        const detail = new WITAFacilityDetail(slot, allWorkers, restState, this, { id: appId });
        detail.render({ force: true });
    }

    // ── Workers tab ─────────────────────────────────────────────

    _buildWorkersTab() {
        const el      = document.createElement("div");
        const data    = getBastionData();
        const workers = data.workers ?? [];
        const slots   = allSlots(data);
        const slotName = wid => slots.find(s => (s.workerIds ?? []).includes(wid))?.facilityName ?? "—";

        const hLabel = document.createElement("div");
        hLabel.className = "wita-section-label";
        hLabel.textContent = "Hirelings";
        el.appendChild(hLabel);

        if (workers.length === 0) {
            el.innerHTML += `<div class="wita-empty">No hirelings yet.${game.user.isGM ? " Add one below." : ""}</div>`;
        } else {
            el.appendChild(this._buildWorkerTable(workers, slotName));
        }

        if (game.user.isGM) {
            const btnRow = document.createElement("div");
            btnRow.className = "wita-btn-row";
            btnRow.innerHTML = `<button class="wita-btn" id="wita-add-worker"><i class="fas fa-plus"></i> Add Hireling</button>`;
            el.appendChild(btnRow);

            const hDropZone = document.createElement("div");
            hDropZone.id = "wita-hireling-dropzone";
            hDropZone.className = "wita-facility-dropzone";
            hDropZone.style.marginTop = "0.4rem";
            hDropZone.innerHTML = `<i class="fas fa-arrow-down"></i> Drag an Actor/Token here to add as hireling`;
            hDropZone.addEventListener("dragover", e => { e.preventDefault(); hDropZone.classList.add("drag-over"); }, true);
            hDropZone.addEventListener("dragleave", () => hDropZone.classList.remove("drag-over"), true);
            hDropZone.addEventListener("drop", async e => {
                e.preventDefault(); e.stopPropagation();
                hDropZone.classList.remove("drag-over");
                let dd;
                try { dd = JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return; }
                let name = "Hireling", role = "", actorId = null;
                if (dd.type === "Actor") {
                    const actor = dd.uuid ? await fromUuid(dd.uuid) : game.actors.get(dd.id);
                    if (actor) {
                        name    = actor.name;
                        role    = actor.system?.details?.race?.value ?? actor.system?.details?.type?.value ?? "";
                        actorId = actor.id;
                    }
                } else if (dd.type === "Token") {
                    const token = dd.uuid ? await fromUuid(dd.uuid) : null;
                    name    = token?.name ?? token?.actor?.name ?? "Hireling";
                    actorId = token?.actor?.id ?? null;
                }
                await createWorker({ name, role, actorId });
                await this.render({ force: true });
            }, true);
            el.appendChild(hDropZone);
        }

        const dLabel = document.createElement("div");
        dLabel.className = "wita-section-label";
        dLabel.style.marginTop = "0.75rem";
        dLabel.textContent = "Bastion Defenders";
        el.appendChild(dLabel);

        const defenders = data.defenders ?? [];
        const alive     = defenders.filter(d => d.alive);
        const dead      = defenders.filter(d => !d.alive);

        if (defenders.length === 0) {
            const emptyDiv = document.createElement("div");
            emptyDiv.className = "wita-empty";
            emptyDiv.textContent = "No defenders recruited yet.";
            el.appendChild(emptyDiv);
        } else {
            const defDiv = document.createElement("div");
            defDiv.className = "wita-defender-roster";
            defDiv.innerHTML = `<div class="wita-defender-count"><strong>${alive.length}</strong> alive${dead.length > 0 ? ` · <span style="color:var(--color-form-hint)">${dead.length} fallen</span>` : ""}</div>`;
            if (game.user.isGM) {
                const list = document.createElement("div");
                list.className = "wita-defender-list";
                for (const d of defenders) {
                    const row = document.createElement("div");
                    row.className = `wita-defender-row${d.alive ? "" : " dead"}`;
                    row.innerHTML = `
                        <span>${d.alive ? "⚔️" : "💀"}</span>
                        <input class="wita-inline-name wita-defender-rename" data-id="${d.id}"
                            value="${sanitizeHTML(d.name)}" style="flex:1;background:transparent;border:none;border-bottom:1px solid transparent;color:inherit;font-size:0.8rem;padding:0 0.2rem;min-width:0"
                            title="Click to rename">
                        <div class="wita-worker-actions" style="margin-left:0.25rem">
                            ${d.alive
                                ? `<button class="wita-icon-btn wita-defender-kill" data-id="${d.id}" title="Mark fallen">💀</button>`
                                : `<button class="wita-icon-btn wita-defender-revive" data-id="${d.id}" title="Mark alive">⚔️</button>`}
                            <button class="wita-icon-btn danger wita-defender-remove" data-id="${d.id}" title="Remove">✕</button>
                        </div>
                    `;
                    list.appendChild(row);
                }
                defDiv.appendChild(list);
            }
            el.appendChild(defDiv);
        }

        if (game.user.isGM) {
            // Drag-drop zone for actors
            const dropZone = document.createElement("div");
            dropZone.id = "wita-defender-dropzone";
            dropZone.className = "wita-facility-dropzone";
            dropZone.style.marginTop = "0.4rem";
            dropZone.innerHTML = `<i class="fas fa-arrow-down"></i> Drag an Actor/Token here to add as defender`;
            dropZone.addEventListener("dragover", e => { e.preventDefault(); dropZone.classList.add("drag-over"); }, true);
            dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"), true);
            dropZone.addEventListener("drop", async e => {
                e.preventDefault(); e.stopPropagation();
                dropZone.classList.remove("drag-over");
                let dd;
                try { dd = JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return; }
                let name = "Defender";
                if (dd.type === "Actor") {
                    const actor = dd.uuid ? await fromUuid(dd.uuid) : game.actors.get(dd.id);
                    if (actor) name = actor.name;
                } else if (dd.type === "Token") {
                    const token = dd.uuid ? await fromUuid(dd.uuid) : null;
                    name = token?.name ?? token?.actor?.name ?? "Defender";
                }
                await addDefender(name);
                await this.render({ force: true });
            }, true);
            el.appendChild(dropZone);

            const defBtnRow = document.createElement("div");
            defBtnRow.className = "wita-btn-row";
            defBtnRow.style.marginTop = "0.4rem";
            defBtnRow.innerHTML = `<button class="wita-btn" id="wita-add-defender"><i class="fas fa-plus"></i> Add Defender</button>`;
            el.appendChild(defBtnRow);
        }

        return el;
    }

    _buildWorkerTable(workers, slotName) {
        const isGM = game.user.isGM;
        const tbl  = document.createElement("table");
        tbl.className = "wita-workers-table";
        tbl.innerHTML = `
            <thead><tr>
                <th>Name</th><th>Role</th><th>Facility</th>
                <th>Status</th><th>Morale</th>
                ${isGM ? "<th></th>" : ""}
            </tr></thead>
        `;
        const tbody = document.createElement("tbody");
        for (const w of workers) {
            const tr = document.createElement("tr");
            tr.dataset.workerId = w.id;
            tr.innerHTML = `
                <td><input class="wita-inline-name wita-worker-rename" data-worker-id="${w.id}"
                    value="${sanitizeHTML(w.name)}" style="width:100%;background:transparent;border:none;border-bottom:1px solid transparent;color:inherit;font-weight:600;font-size:0.8rem;padding:0;min-width:0"
                    title="Click to rename"></td>
                <td>${sanitizeHTML(w.role ?? "")}</td>
                <td style="font-size:0.65rem">${sanitizeHTML(slotName(w.id))}</td>
                <td>${sanitizeHTML(w.status ?? "Active")}</td>
                <td>
                    <div class="wita-morale-bar-wrap">
                        <div class="wita-morale-bar-bg">
                            <div class="wita-morale-bar-fill" style="width:${w.morale ?? 50}%;background:${WITA_MORALE_COLOUR(w.morale ?? 50)}"></div>
                        </div>
                        <span class="wita-morale-num">${w.morale ?? 50}</span>
                    </div>
                </td>
                ${isGM ? `<td><div class="wita-worker-actions">
                    <button class="wita-icon-btn wita-edit-worker" data-worker-id="${w.id}"><i class="fas fa-pencil"></i></button>
                    <button class="wita-icon-btn danger wita-delete-worker" data-worker-id="${w.id}"><i class="fas fa-trash"></i></button>
                </div></td>` : ""}
            `;
            tbody.appendChild(tr);
        }
        tbl.appendChild(tbody);
        return tbl;
    }

    // ── Finance tab ─────────────────────────────────────────────

    _buildFinanceTab() {
        const el  = document.createElement("div");
        const fin = getFinancialSummary();

        if (!fin) {
            el.innerHTML = `<div class="wita-empty">Financial System module not active or not configured.</div>`;
            return el;
        }

        const { propertyIncome, totalPropertyIncome, ownedStocks, bankBalance, currency } = fin;

        el.innerHTML += `<div class="wita-section-label">Property Income</div>`;
        if (!propertyIncome?.length) {
            el.innerHTML += `<div class="wita-empty" style="padding:0.4rem 0">No rented properties.</div>`;
        } else {
            const tbl = document.createElement("table");
            tbl.className = "wita-finance-table";
            tbl.innerHTML = `
                <thead><tr><th>Property</th><th>Type</th><th style="text-align:right">Monthly</th><th style="text-align:right">Weekly</th></tr></thead>
                <tbody>
                    ${propertyIncome.map(p => `
                    <tr>
                        <td>${sanitizeHTML(p.name)}</td>
                        <td style="color:var(--color-form-hint)">${sanitizeHTML(p.type)}</td>
                        <td style="text-align:right">${p.monthlyIncome} ${currency}</td>
                        <td style="text-align:right;font-weight:600">${p.weeklyIncome} ${currency}</td>
                    </tr>`).join("")}
                    <tr style="border-top:1px solid var(--color-fieldset-border)">
                        <td colspan="3" style="text-align:right;font-weight:700">Total Weekly</td>
                        <td style="text-align:right;font-weight:700;color:var(--color-highlights)">${totalPropertyIncome} ${currency}</td>
                    </tr>
                </tbody>
            `;
            el.appendChild(tbl);
        }

        if (ownedStocks?.length) {
            el.innerHTML += `<div class="wita-section-label">Stocks</div>`;
            const stbl = document.createElement("table");
            stbl.className = "wita-finance-table";
            stbl.innerHTML = `
                <thead><tr><th>Stock</th><th>Shares</th><th style="text-align:right">Price</th><th style="text-align:right">Value</th><th>Trend</th></tr></thead>
                <tbody>
                    ${ownedStocks.map(s => {
                        const tc = s.trend === "up" ? "wita-trend-up" : s.trend === "down" ? "wita-trend-down" : "wita-trend-flat";
                        const ti = s.trend === "up" ? "▲" : s.trend === "down" ? "▼" : "—";
                        return `<tr>
                            <td><strong>${sanitizeHTML(s.symbol)}</strong></td>
                            <td>${s.shares}</td>
                            <td style="text-align:right">${s.currentPrice}</td>
                            <td style="text-align:right;font-weight:600">${s.totalValue}</td>
                            <td class="${tc}">${ti} ${s.trendPercentage ?? 0}%</td>
                        </tr>`;
                    }).join("")}
                </tbody>
            `;
            el.appendChild(stbl);
        }

        el.innerHTML += `<div class="wita-section-label">Bank Account</div>`;
        const callout = document.createElement("div");
        callout.className = "wita-balance-callout";
        callout.innerHTML = `<span>Current Balance</span><span class="wita-balance-value">${bankBalance.toLocaleString()} ${currency}</span>`;
        el.appendChild(callout);

        return el;
    }

    // ── Reports tab ─────────────────────────────────────────────

    _buildReportsTab() {
        const el      = document.createElement("div");
        const journal = game.journal.getName(witaSetting("bastionName") ?? "");
        if (!journal) {
            el.innerHTML = `<div class="wita-empty">Bastion journal not found. Run a bastion turn first.</div>`;
            return el;
        }
        const pages = journal.pages.contents
            .filter(p => !p.name?.toLowerCase().includes("archive"))
            .sort((a, b) => (b.sort ?? 0) - (a.sort ?? 0));

        if (!pages.length) {
            el.innerHTML = `<div class="wita-empty">No reports yet.</div>`;
            return el;
        }

        const list = document.createElement("div");
        list.className = "wita-report-list";
        for (const page of pages) {
            const s   = page.getFlag?.("wita", "reportSummary") ?? _fallbackSummary(page);
            const row = document.createElement("div");
            row.className = "wita-report-row";
            row.dataset.pageId    = page.id;
            row.dataset.journalId = journal.id;
            row.innerHTML = `
                <span class="wita-report-turn">Turn ${sanitizeHTML(String(s?.turnNumber ?? "?"))}</span>
                <span class="wita-report-date">${sanitizeHTML(s?.date ?? page.name ?? "")}</span>
                <span class="wita-report-event">${sanitizeHTML(s?.eventCategory ?? "")}</span>
                ${s?.totalIncome ? `<span class="wita-report-income">${sanitizeHTML(s.totalIncome)}</span>` : ""}
                <i class="fas fa-external-link-alt" style="font-size:0.55rem;opacity:0.4;flex-shrink:0"></i>
            `;
            list.appendChild(row);
        }
        el.appendChild(list);

        const archive = journal.pages.contents.find(p => p.name?.toLowerCase().includes("archive"));
        if (archive) {
            el.innerHTML += `<p style="font-size:0.65rem;color:var(--color-form-hint);margin-top:0.5rem;text-align:center">
                <a class="wita-open-archive" data-page-id="${archive.id}" data-journal-id="${journal.id}" href="#" style="color:var(--color-highlights)">Open archive</a>
            </p>`;
        }

        return el;
    }

    // ── Engineer tab ─────────────────────────────────────────────

    _buildEngineerTab() {
        const el      = document.createElement("div");
        const isGM    = game.user.isGM;
        const engData = getEngineeringData();

        if (isGM) {
            const hasVendor = !!engData.vendorActorId && !!game.actors.get(engData.vendorActorId);
            const btnRow = document.createElement("div");
            btnRow.className = "wita-btn-row";
            btnRow.innerHTML = `
                <button class="wita-btn" id="wita-create-vendor"><i class="fas fa-hammer"></i> ${hasVendor ? "Open Vendor" : "Create Engineer Vendor"}</button>
                ${hasVendor ? `<button class="wita-btn" id="wita-sync-vendor"><i class="fas fa-rotate"></i> Sync Prices</button>` : ""}
            `;
            el.appendChild(btnRow);
        }

        // Bastion Items section — drag from wita.wita-items compendium
        const bastionItemsLabel = document.createElement("div");
        bastionItemsLabel.className = "wita-section-label";
        bastionItemsLabel.style.display = "flex";
        bastionItemsLabel.style.alignItems = "center";
        bastionItemsLabel.innerHTML = `<span style="flex:1">Bastion Items</span>
            ${isGM ? `<button class="wita-btn" id="wita-browse-meta-items" style="font-size:0.65rem;padding:0.15rem 0.5rem"><i class="fas fa-book"></i> Browse</button>` : ""}`;
        el.appendChild(bastionItemsLabel);

        if (isGM) {
            const metaDropZone = document.createElement("div");
            metaDropZone.id = "wita-meta-dropzone";
            metaDropZone.className = "wita-facility-dropzone";
            metaDropZone.innerHTML = `<i class="fas fa-arrow-down"></i> Drag a Bastion Item from the compendium to add it`;
            metaDropZone.addEventListener("dragover", e => {
                if (!e.dataTransfer.types.includes("text/plain")) return;
                e.preventDefault();
                metaDropZone.classList.add("drag-over");
            }, true);
            metaDropZone.addEventListener("dragleave", () => metaDropZone.classList.remove("drag-over"), true);
            metaDropZone.addEventListener("drop", async e => {
                e.stopPropagation();
                e.preventDefault();
                metaDropZone.classList.remove("drag-over");
                let dd;
                try { dd = JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return; }
                if (dd.type !== "Item" || !dd.uuid) return;
                const item = await fromUuid(dd.uuid);
                if (!item) { ui.notifications.warn("WITA | Could not load item."); return; }
                const wf = item.flags?.wita ?? {};
                // Accept if it has wita flags OR if it's in the Bastion folder (NVw4w2boGfiVjzHe)
                const inBastionFolder = item.folder?.id === "NVw4w2boGfiVjzHe" || item._source?.folder === "NVw4w2boGfiVjzHe";
                const isBastionItem = wf.bastionMetaItem || wf.engineerCategory || inBastionFolder ||
                    ["Bastion Expansion","Add Basic Facility","Add Special Facility","Enlarge Facility"].some(n => item.name.startsWith(n));
                if (!isBastionItem) {
                    ui.notifications.warn("WITA | That item is not a Bastion Item. Drag from the Bastion folder in wita.wita-items.");
                    return;
                }
                const engD = getEngineeringData();
                engD.stockedMetaItems = engD.stockedMetaItems ?? [];
                if (engD.stockedMetaItems.find(m => m.name === item.name)) {
                    ui.notifications.info(`WITA | "${item.name}" is already in the list.`);
                    return;
                }
                engD.stockedMetaItems.push({
                    name:    item.name,
                    metaKey: wf.engineerMetaKey ?? wf.metaKey ?? null,
                });
                await saveEngineeringData(engD);
                const panel = foundry.applications.instances.get("wita-bastion-panel");
                if (panel) { try { await panel.render({ force: true }); } catch(err) { console.error("WITA | meta render error:", err); } }
            }, true);
            el.appendChild(metaDropZone);
        }

        // Stocked bastion items table (starts empty, populated by drag-drop)
        const stockedMeta = engData.stockedMetaItems ?? [];
        if (stockedMeta.length === 0) {
            { const _d = document.createElement("div"); _d.innerHTML = `<div class="wita-empty" style="padding:0.4rem 0">No bastion items added yet. Drag from the compendium above.</div>`; el.appendChild(_d); }
        } else {
            const metaLookup = {
                "Bastion Expansion — Tier I":   { key: "tierUpgrade1" },
                "Bastion Expansion — Tier II":  { key: "tierUpgrade2" },
                "Bastion Expansion — Tier III": { key: "tierUpgrade3" },
                "Add Basic Facility Slot":       { key: "basicSlot" },
                "Add Special Facility Slot":     { key: "specialSlot" },
                "Enlarge Facility":              { key: "enlarge" },
                "Enlarge Facility (Roomy → Vast)": { key: "enlarge" }, // legacy name
                "Roomy Slot License":            { key: "roomyLicense" },
                "Vast Slot License":             { key: "vastLicense" },
            };
            const metaRows = stockedMeta.map(entry => {
                const lookup = metaLookup[entry.name] ?? {};
                return {
                    id:         entry.metaKey ?? lookup.key ?? entry.name,
                    name:       entry.name,
                    meta:       true,
                    cost:       getMetaCost(entry.metaKey ?? lookup.key ?? "enlarge"),
                    removable:  true,
                };
            }, true);
            el.appendChild(this._buildCostTable(metaRows, false, false, true));
        }

        // Facilities — drag-drop to add (DMG compendium, wita.wita-items, or world items)
        const facLabel = document.createElement("div");
        facLabel.className = "wita-section-label";
        facLabel.style.display = "flex";
        facLabel.style.alignItems = "center";
        facLabel.innerHTML = `<span style="flex:1">Facilities</span>
            ${isGM ? `
                <button class="wita-btn" id="wita-new-facility" style="font-size:0.65rem;padding:0.15rem 0.5rem;margin-right:0.25rem"><i class="fas fa-plus"></i> New</button>
                <button class="wita-btn" id="wita-clear-facilities" style="font-size:0.65rem;padding:0.15rem 0.5rem"><i class="fas fa-trash"></i> Clear All</button>
            ` : ""}`;
        el.appendChild(facLabel);

        // Drop zone
        if (isGM) {
            const dropZone = document.createElement("div");
            dropZone.id = "wita-facility-dropzone";
            dropZone.className = "wita-facility-dropzone";
            dropZone.innerHTML = `<i class="fas fa-arrow-down"></i> Drag a facility from any compendium or world items`;
            dropZone.addEventListener("dragover", e => {
                e.preventDefault();
                dropZone.classList.add("drag-over");
            }, true);
            dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"), true);
            dropZone.addEventListener("drop", async e => {
                e.stopPropagation();
                e.preventDefault();
                dropZone.classList.remove("drag-over");
                let raw = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("text");
                let dd;
                try { dd = JSON.parse(raw); } catch {
                    console.warn("WITA | Could not parse drop data:", raw);
                    return;
                }
                if (!dd.uuid && dd.id) {
                    dd.uuid = dd.pack ? `Compendium.${dd.pack}.Item.${dd.id}` : `Item.${dd.id}`;
                }
                if (dd.type !== "Item" || !dd.uuid) {
                    ui.notifications.warn("WITA | Drop a facility item here.");
                    return;
                }
                await _addFacilityToStock(dd.uuid);
                const panel = foundry.applications.instances.get("wita-bastion-panel");
                if (panel) { try { await panel.render({ force: true }); } catch(err) { console.error("WITA | render error:", err); } }
            }, true);
            el.appendChild(dropZone);
        }

        // Unified stocked facilities table (DMG + custom + any world items)
        const engData2 = getEngineeringData();
        const stocked  = engData2.stockedFacilities ?? [];
        if (stocked.length === 0) {
            const _d = document.createElement("div");
            _d.innerHTML = `<div class="wita-empty" style="padding:0.4rem 0">No facilities added yet. Drag from a compendium or click New to create a custom facility.</div>`;
            el.appendChild(_d);
        } else {
            const allFac2 = getAllFacilities();
            const facRows = stocked
                .map(itemId => {
                    const meta = allFac2[itemId] ?? WITA_DMG_FACILITIES[itemId] ?? {};
                    // Fallback: use stored name from cost record (covers compendium items not in game.items)
                    const storedName = engData2.facilities?.[itemId]?.name;
                    const name = meta.name ?? storedName ?? itemId;
                    const isCustom = !!meta.custom || (!!storedName && !WITA_DMG_FACILITIES[itemId]);
                    return { id: itemId, name, meta: false, cost: getFacilityCost(itemId), fMeta: { ...meta, name }, removable: true, custom: isCustom };
                })
                .sort((a, b) => a.name.localeCompare(b.name));
            el.appendChild(this._buildCostTable(facRows, true, true, true));
        }

        return el;
    }

    _buildCostTable(rows, showFacilityMeta, showDelete = false, showRemove = false) {
        const isGM = game.user.isGM;
        const tbl  = document.createElement("table");
        tbl.className = "wita-engineer-table";
        tbl.innerHTML = `
            <thead><tr>
                <th>Name</th>
                ${showFacilityMeta ? "<th>Type</th><th>Size</th><th>Order</th>" : ""}
                <th style="text-align:right">GP Only</th>
                <th style="text-align:right">GP+Mats</th>
                ${isGM ? "<th></th>" : ""}
            </tr></thead>
        `;
        const tbody = document.createElement("tbody");
        for (const row of rows) {
            const tr = document.createElement("tr");
            tr.dataset.itemId = row.id;
            tr.innerHTML = `
                <td style="font-size:0.72rem"><strong>${sanitizeHTML(row.name)}</strong></td>
                ${showFacilityMeta ? `
                    <td style="font-size:0.65rem">${row.fMeta?.type === "basic" ? "Basic" : "Special"}</td>
                    <td style="font-size:0.65rem">${row.fMeta?.size ? WITA_SIZE_LABEL[row.fMeta.size] : "—"}</td>
                    <td style="font-size:0.65rem">${row.fMeta?.order ? WITA_ORDER_LABEL[row.fMeta.order] : "—"}</td>
                ` : ""}
                <td style="text-align:right;font-size:0.72rem">${row.cost.gpOnly.toLocaleString()} GP</td>
                <td style="text-align:right;font-size:0.72rem">${row.cost.gpWithMaterials.toLocaleString()} GP</td>
                ${isGM ? `<td style="white-space:nowrap">
                    <div class="wita-worker-actions">
                        <button class="wita-icon-btn ${row.meta ? "wita-edit-meta-cost" : "wita-edit-facility-cost"}" data-item-id="${row.id}" title="Edit"><i class="fas fa-pencil"></i></button>
                        ${showDelete && row.custom ? `<button class="wita-icon-btn danger wita-delete-custom" data-item-id="${row.id}" title="Delete"><i class="fas fa-trash"></i></button>` : ""}
                        ${showRemove && row.removable ? `<button class="wita-icon-btn danger wita-remove-from-stock" data-item-id="${row.id}" title="Remove from list"><i class="fas fa-times"></i></button>` : ""}
                    </div>
                </td>` : ""}
            `;
            tbody.appendChild(tr);
        }
        tbl.appendChild(tbody);
        return tbl;
    }

    // ── Listeners ────────────────────────────────────────────────

    _activateListeners(container) {

        container.querySelectorAll(".wita-tab-btn").forEach(btn =>
            btn.addEventListener("click", () => this._switchTab(btn.dataset.tab, container))
        );

        // Slot header expand/collapse — no longer used (detail popup replaces it)

        container.querySelectorAll(".wita-pool-btn").forEach(btn =>
            btn.addEventListener("click", async () => {
                const delta = parseInt(btn.dataset.delta);
                if (delta > 0) await addSlot(btn.dataset.pool);
                else await removeLastEmptySlot(btn.dataset.pool);
                await this.render({ force: true });
            })
        );

        // Quick order toggle — issue/cancel the facility's valid order
        container.querySelectorAll(".wita-quick-order-btn").forEach(btn =>
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const data     = getBastionData();
                const slot     = findSlot(data, btn.dataset.slotId);
                if (!slot) return;
                const newOrder = btn.dataset.order || null;
                const oldOrder = slot.facilityOrder ?? null;
                const hookResult = Hooks.call("wita.preSetFacilityOrder", slot, newOrder, oldOrder);
                if (hookResult === false) return;
                const finalOrder = (typeof hookResult === "object" && hookResult?.order !== undefined) ? hookResult.order : newOrder;
                slot.facilityOrder   = finalOrder || null;
                slot.orderStartTurn  = finalOrder ? (this._restState?.bst?.turnNumber ?? 0) : null;
                slot.orderStartRests = finalOrder ? (this._restState?.bst?.longRestCount ?? 0) : null;
                const pool = data.basicSlots?.find(s => s.id === slot.id) ? "basicSlots" : "specialSlots";
                const idx  = data[pool].findIndex(s => s.id === slot.id);
                if (idx >= 0) data[pool][idx] = slot;
                await saveBastionData(data);
                Hooks.callAll("wita.postSetFacilityOrder", slot, finalOrder, oldOrder);
                await this.render({ force: true });
            })
        );

        if (game.user.isGM) {
            container.querySelectorAll(".wita-slot").forEach(slotEl => {
                slotEl.addEventListener("dragover", e => {
                    if (!e.dataTransfer.types.includes("text/plain")) return;
                    e.preventDefault();
                    slotEl.classList.add("drag-over");
                });
                slotEl.addEventListener("dragleave", () => slotEl.classList.remove("drag-over"), true);
                slotEl.addEventListener("drop", async e => {
                    e.preventDefault();
                    slotEl.classList.remove("drag-over");
                    let dd;
                    try { dd = JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return; }
                    if (dd.type !== "Item" || !dd.uuid) return;
                    await assignFacilityToSlot(slotEl.dataset.slotId, dd.uuid);
                    await this.render({ force: true });
                });
            }, true);
        }

        container.querySelectorAll(".wita-edit-worker").forEach(btn =>
            btn.addEventListener("click", () => this._openWorkerDialog(btn.dataset.workerId))
        );
        container.querySelectorAll(".wita-delete-worker").forEach(btn =>
            btn.addEventListener("click", async () => {
                const ok = await Dialog.confirm({ title: "Remove Hireling", content: "<p>Permanently remove this hireling?</p>" });
                if (!ok) return;
                await deleteWorker(btn.dataset.workerId);
                await this.render({ force: true });
            })
        );
        container.querySelector("#wita-add-worker")?.addEventListener("click", () => this._openWorkerDialog(null));

        // Inline rename — workers
        container.querySelectorAll(".wita-worker-rename").forEach(input => {
            input.addEventListener("focus", () => input.style.borderBottomColor = "var(--color-highlights)");
            input.addEventListener("blur",  async () => {
                input.style.borderBottomColor = "transparent";
                const newName = input.value.trim();
                if (!newName) return;
                await updateWorker(input.dataset.workerId, { name: newName });
            });
            input.addEventListener("keydown", e => { if (e.key === "Enter") input.blur(); });
        });

        // Inline rename — defenders
        container.querySelectorAll(".wita-defender-rename").forEach(input => {
            input.addEventListener("focus", () => input.style.borderBottomColor = "var(--color-highlights)");
            input.addEventListener("blur", async () => {
                input.style.borderBottomColor = "transparent";
                const newName = input.value.trim();
                if (!newName) return;
                const data = getBastionData();
                const d = (data.defenders ?? []).find(d => d.id === input.dataset.id);
                if (d) { d.name = newName; await saveBastionData(data); }
            });
            input.addEventListener("keydown", e => { if (e.key === "Enter") input.blur(); });
        });

        container.querySelectorAll(".wita-defender-kill").forEach(btn =>
            btn.addEventListener("click", async () => { await setDefenderAlive(btn.dataset.id, false); await this.render({ force: true }); })
        );
        container.querySelectorAll(".wita-defender-revive").forEach(btn =>
            btn.addEventListener("click", async () => { await setDefenderAlive(btn.dataset.id, true);  await this.render({ force: true }); })
        );
        container.querySelectorAll(".wita-defender-remove").forEach(btn =>
            btn.addEventListener("click", async () => {
                const ok = await Dialog.confirm({ title: "Remove Defender", content: "<p>Remove from roster?</p>" });
                if (!ok) return;
                await removeDefender(btn.dataset.id);
                await this.render({ force: true });
            })
        );
        container.querySelector("#wita-add-defender")?.addEventListener("click", async () => {
            await addDefender();
            await this.render({ force: true });
        });

        container.querySelectorAll(".wita-rest-adj").forEach(btn =>
            btn.addEventListener("click", async () => {
                if (!game.user.isGM) return;
                const delta     = parseInt(btn.dataset.delta);
                const threshold = witaSetting("longRestsPerTurn") ?? 7;
                const state     = await getBastionState();
                state.longRestCount = Math.min(Math.max((state.longRestCount ?? 0) + delta, 0), threshold);
                await saveBastionState(state);
                await this.render({ force: true });
            })
        );

        container.querySelector("#wita-trigger-turn")?.addEventListener("click", async () => {
            await globalThis.WITA_BASTION?.triggerTurn?.();
        });
        container.querySelector("#wita-open-journal")?.addEventListener("click", () => {
            game.journal.getName(witaSetting("bastionName") ?? "")?.sheet.render({ force: true });
        });
        container.querySelector("#wita-tier-select")?.addEventListener("change", async (e) => {
            await setBastionTier(parseInt(e.target.value));
            await this.render({ force: true });
        });

        container.querySelectorAll(".wita-size-license-btn").forEach(btn =>
            btn.addEventListener("click", async () => {
                const sizeType = btn.dataset.type;  // "roomy" or "vast"
                const delta    = parseInt(btn.dataset.delta);
                const data     = getBastionData();
                const key      = sizeType === "roomy" ? "roomyLicenses" : "vastLicenses";
                data[key]      = Math.max(0, (data[key] ?? 0) + delta);
                await saveBastionData(data);
                await this.render({ force: true });
            })
        );

        container.querySelectorAll(".wita-report-row").forEach(row =>
            row.addEventListener("click", () => {
                const j = game.journal.get(row.dataset.journalId);
                j?.sheet.render(true, { pageId: row.dataset.pageId });
            })
        );
        container.querySelectorAll(".wita-open-archive").forEach(link =>
            link.addEventListener("click", e => {
                e.preventDefault();
                const j = game.journal.get(link.dataset.journalId);
                j?.sheet.render(true, { pageId: link.dataset.pageId });
            })
        );

        container.querySelector("#wita-create-vendor")?.addEventListener("click", async () => {
            const engData = getEngineeringData();
            const existing = engData.vendorActorId ? game.actors.get(engData.vendorActorId) : null;
            if (existing) { existing.sheet.render({ force: true }); return; }
            await createEngineerVendor();
            await this.render({ force: true });
        });
        container.querySelector("#wita-sync-vendor")?.addEventListener("click", async () => {
            await syncVendorPrices();
            ui.notifications.info("WITA | Vendor prices synced.");
        });

        container.querySelector("#wita-browse-meta-items")?.addEventListener("click", async () => {
            if (!game.user.isGM) return;
            // Seed items first if needed
            await seedBastionMetaItems();
            // Open the wita-items compendium
            const pack = game.packs.get("wita.wita-items");
            if (!pack) { ui.notifications.warn("WITA | wita.wita-items compendium not found."); return; }
            pack.render({ force: true });
        });
        container.querySelector("#wita-new-facility")?.addEventListener("click", () => openCustomFacilityDialog(null));

        container.querySelectorAll(".wita-edit-facility-cost").forEach(btn =>
            btn.addEventListener("click", () => this._openCostDialog(btn.dataset.itemId, false))
        );
        container.querySelectorAll(".wita-edit-meta-cost").forEach(btn =>
            btn.addEventListener("click", () => this._openCostDialog(btn.dataset.itemId, true))
        );
        container.querySelectorAll(".wita-delete-custom").forEach(btn =>
            btn.addEventListener("click", async () => {
                const item = game.items.get(btn.dataset.itemId);
                const ok   = await Dialog.confirm({
                    title:   "Delete Custom Facility",
                    content: `<p>Delete <strong>${item?.name ?? btn.dataset.itemId}</strong>? This will clear any bastion slots using it and remove it from the vendor.</p>`,
                });
                if (!ok) return;
                await deleteCustomFacility(btn.dataset.itemId);
                await this.render({ force: true });
            })
        );

        container.querySelectorAll(".wita-remove-from-stock").forEach(btn =>
            btn.addEventListener("click", async () => {
                if (!game.user.isGM) return;
                const itemId = btn.dataset.itemId;
                const engD = getEngineeringData();
                const metaKeys = ["tierUpgrade1","tierUpgrade2","tierUpgrade3","basicSlot","specialSlot","enlarge"];
                if (metaKeys.includes(itemId)) {
                    engD.stockedMetaItems = (engD.stockedMetaItems ?? []).filter(e => e.metaKey !== itemId);
                    await saveEngineeringData(engD);
                } else {
                    await _removeFacilityFromStock(itemId);
                }
                await this.render({ force: true });
            })
        );

        container.querySelector("#wita-clear-facilities")?.addEventListener("click", async () => {
            if (!game.user.isGM) return;
            const engD = getEngineeringData();
            engD.stockedFacilities = [];
            engD.facilities = {};
            await saveEngineeringData(engD);
            await this.render({ force: true });
        });
    }

    // ── Tab switcher ─────────────────────────────────────────────

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

    // ── Worker edit dialog ────────────────────────────────────────

    async _openWorkerDialogForSlot(slotId) {
        if (!game.user.isGM) return;
        const data      = getBastionData();
        const slots     = allSlots(data).filter(s => s.facilityUuid);
        const slotOpts  = slots.map(s =>
            `<option value="${s.id}" ${slotId === s.id ? "selected" : ""}>${sanitizeHTML(s.facilityName ?? "")}</option>`
        ).join("");
        const statusOpts = WITA_WORKER_STATUSES.map(st =>
            `<option value="${st}" ${"Active" === st ? "selected" : ""}>${st}</option>`
        ).join("");
        await foundry.applications.api.DialogV2.prompt({
            window: { title: "Add Hireling" },
            content: `
                <div style="display:flex;flex-direction:column;gap:0.5rem;padding:0.25rem;font-family:var(--font-primary)">
                    <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                        Name <input type="text" name="name" value="" placeholder="Hireling name"
                              style="font-size:0.8rem;padding:0.2rem 0.35rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                    </label>
                    <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                        Role <input type="text" name="role" value="" placeholder="e.g. Blacksmith"
                              style="font-size:0.78rem;padding:0.2rem 0.35rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                    </label>
                    <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                        Facility <select name="slotId" style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                            <option value="">— Unassigned —</option>${slotOpts}
                        </select>
                    </label>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem">
                        <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                            Status <select name="status" style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">${statusOpts}</select>
                        </label>
                        <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                            Morale <input type="number" name="morale" min="0" max="100" value="70"
                                    style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                        </label>
                    </div>
                </div>
            `,
            ok: {
                label: "Add",
                callback: async (event, button) => {
                    const f      = button.form;
                    const name   = f.querySelector("[name=name]").value.trim();
                    if (!name) { ui.notifications.warn("WITA | Name is required."); return; }
                    const role   = f.querySelector("[name=role]").value.trim();
                    const status = f.querySelector("[name=status]").value;
                    const morale = parseInt(f.querySelector("[name=morale]").value) || 70;
                    const sid    = f.querySelector("[name=slotId]").value || null;
                    const newId  = await createWorker({ name, role, status, morale });
                    if (newId && sid) await assignWorkerToSlot(newId, sid);
                    await this.render({ force: true });
                },
            },
        });
    }

    async _openWorkerDialog(workerId) {
        if (!game.user.isGM) return;
        const data   = getBastionData();
        const worker = workerId ? (data.workers ?? []).find(w => w.id === workerId) : null;
        const slots  = allSlots(data).filter(s => s.facilityUuid);
        const curSlot = workerId
            ? slots.find(s => (s.workerIds ?? []).includes(workerId))?.id ?? ""
            : "";

        const slotOpts   = slots.map(s =>
            `<option value="${s.id}" ${curSlot === s.id ? "selected" : ""}>${sanitizeHTML(s.facilityName ?? "")}</option>`
        ).join("");
        const statusOpts = WITA_WORKER_STATUSES.map(st =>
            `<option value="${st}" ${(worker?.status ?? "Active") === st ? "selected" : ""}>${st}</option>`
        ).join("");

        await foundry.applications.api.DialogV2.prompt({
            window: { title: workerId ? `Edit Hireling — ${worker?.name ?? ""}` : "Add Hireling" },
            content: `
                <div style="display:flex;flex-direction:column;gap:0.5rem;padding:0.25rem;font-family:var(--font-primary)">
                    <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                        Name <input type="text" name="name" value="${sanitizeHTML(worker?.name ?? "")}" placeholder="Hireling name"
                              style="font-size:0.8rem;padding:0.2rem 0.35rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                    </label>
                    <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                        Role <input type="text" name="role" value="${sanitizeHTML(worker?.role ?? "")}" placeholder="e.g. Blacksmith"
                              style="font-size:0.78rem;padding:0.2rem 0.35rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                    </label>
                    <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                        Facility <select name="slotId" style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                            <option value="">— Unassigned —</option>${slotOpts}
                        </select>
                    </label>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem">
                        <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                            Status <select name="status" style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">${statusOpts}</select>
                        </label>
                        <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                            Morale <input type="number" name="morale" min="0" max="100" value="${worker?.morale ?? 70}"
                                    style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                        </label>
                    </div>
                </div>
            `,
            ok: {
                label: workerId ? "Save" : "Add",
                callback: async (event, button) => {
                    const f      = button.form;
                    const name   = f.querySelector("[name=name]").value.trim();
                    if (!name) { ui.notifications.warn("WITA | Name is required."); return; }
                    const role   = f.querySelector("[name=role]").value.trim();
                    const status = f.querySelector("[name=status]").value;
                    const morale = parseInt(f.querySelector("[name=morale]").value) || 70;
                    const slotId = f.querySelector("[name=slotId]").value || null;
                    if (workerId) {
                        await updateWorker(workerId, { name, role, status, morale });
                        await assignWorkerToSlot(workerId, slotId);
                    } else {
                        const newId = await createWorker({ name, role, status, morale });
                        if (newId && slotId) await assignWorkerToSlot(newId, slotId);
                    }
                    await this.render({ force: true });
                },
            },
        });
    }

    // ── Cost edit dialog ──────────────────────────────────────────

    async _openCostDialog(itemIdOrKey, isMeta) {
        if (!game.user.isGM) return;

        const cost = isMeta ? getMetaCost(itemIdOrKey) : getFacilityCost(itemIdOrKey);
        const name = isMeta
            ? itemIdOrKey
            : (getAllFacilities()[itemIdOrKey]?.name ?? itemIdOrKey);

        const matRowsHtml = (mats) => mats.map((m, i) => `
            <div class="wita-mat-row" data-index="${i}" style="display:flex;gap:0.3rem;margin-bottom:0.25rem">
                <input type="text" class="wita-mat-name" value="${sanitizeHTML(m.name)}" placeholder="Material"
                       style="flex:1;font-size:0.75rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                <input type="number" class="wita-mat-qty" value="${m.qty}" min="1"
                       style="width:3.5rem;font-size:0.75rem;padding:0.15rem 0.25rem;border:1px solid var(--color-fieldset-border);border-radius:3px;text-align:center">
                <button type="button" class="wita-icon-btn danger wita-remove-mat" style="flex-shrink:0">✕</button>
            </div>
        `).join("");

        await foundry.applications.api.DialogV2.prompt({
            window: { title: `Edit Costs — ${sanitizeHTML(name)}` },
            content: `
                <div style="display:flex;flex-direction:column;gap:0.5rem;padding:0.25rem;font-family:var(--font-primary)">
                    <p style="margin:0;font-weight:700;font-size:0.85rem">${sanitizeHTML(name)}</p>
                    <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                        GP Only <input type="number" name="gpOnly" value="${cost.gpOnly}" min="0" step="50"
                                 style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                    </label>
                    <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                        GP + Materials <input type="number" name="gpWithMaterials" value="${cost.gpWithMaterials}" min="0" step="50"
                                       style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                    </label>
                    <div class="wita-section-label" style="margin-top:0.3rem">Materials (for GP+Mat option)</div>
                    <div id="wita-mat-rows">${matRowsHtml(cost.materials ?? [])}</div>
                    <button type="button" id="wita-add-mat" class="wita-btn" style="font-size:0.7rem;padding:0.15rem 0.4rem">
                        <i class="fas fa-plus"></i> Add Material
                    </button>
                </div>
            `,
            render: (event, html) => {
                const el = html instanceof HTMLElement ? html : html[0];
                el.querySelector("#wita-add-mat")?.addEventListener("click", () => {
                    const rows = el.querySelector("#wita-mat-rows");
                    const div  = document.createElement("div");
                    div.className = "wita-mat-row";
                    div.style.cssText = "display:flex;gap:0.3rem;margin-bottom:0.25rem";
                    div.innerHTML = `
                        <input type="text" class="wita-mat-name" placeholder="Material"
                               style="flex:1;font-size:0.75rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                        <input type="number" class="wita-mat-qty" value="1" min="1"
                               style="width:3.5rem;font-size:0.75rem;padding:0.15rem 0.25rem;border:1px solid var(--color-fieldset-border);border-radius:3px;text-align:center">
                        <button type="button" class="wita-icon-btn danger wita-remove-mat" style="flex-shrink:0">✕</button>
                    `;
                    div.querySelector(".wita-remove-mat").addEventListener("click", () => div.remove());
                    rows.appendChild(div);
                });
                el.querySelectorAll(".wita-remove-mat").forEach(btn =>
                    btn.addEventListener("click", () => btn.closest(".wita-mat-row").remove())
                );
            },
            ok: {
                label: "Save",
                callback: async (event, button) => {
                    const f          = button.form;
                    const gpOnly     = parseInt(f.querySelector("[name=gpOnly]").value) || 0;
                    const gpWithMats = parseInt(f.querySelector("[name=gpWithMaterials]").value) || 0;
                    const materials  = [...f.querySelectorAll(".wita-mat-row")].map(r => ({
                        name: r.querySelector(".wita-mat-name").value.trim(),
                        qty:  parseInt(r.querySelector(".wita-mat-qty").value) || 1,
                    })).filter(m => m.name);
                    const newCost = { gpOnly, gpWithMaterials: gpWithMats, materials };
                    if (isMeta) setMetaCost(itemIdOrKey, newCost);
                    else        setFacilityCost(itemIdOrKey, newCost);
                    await this.render({ force: true });
                },
            },
        });
    }
}

// ── Report fallback ───────────────────────────────────────────

function _fallbackSummary(page) {
    const c = page.text?.content ?? "";
    return {
        turnNumber:    c.match(/data-turn-number="(\d+)"/)?.[1],
        date:          c.match(/data-report-date="([^"]+)"/)?.[1],
        eventCategory: c.match(/data-event-category="([^"]+)"/)?.[1],
        totalIncome:   c.match(/data-total-income="([^"]+)"/)?.[1],
    };
}

// ── Registration ──────────────────────────────────────────────

export function registerBastionPanel() {
    CONFIG.ui[SIDEBAR_ID] = WITABastionPanel;

    // Add castle button to the left UI controls
    // Compatible with v13 and v14 — injects directly into DOM after render
    const _witaOpenPanel = () => {
        const existing = foundry.applications.instances.get(PANEL_ID);
        if (existing?.rendered) { existing.bringToFront(); return; }
        new WITABastionPanel().render({ force: true });
    };

    const _witaInjectButton = () => {
        if (document.querySelector("#wita-bastion-btn")) return;
        // Target the notes/journal tools menu in v13 scene controls
        const toolsMenu = document.querySelector("#scene-controls-tools");
        if (!toolsMenu) return;

        // Only inject when the notes layer is active (tools menu shows journal tools)
        const hasJournal = toolsMenu.querySelector("[data-tool='journal']");
        if (!hasJournal) return;

        const li = document.createElement("li");
        li.id = "wita-bastion-btn";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "control ui-control tool icon button fa-solid fa-chess-rook";
        btn.setAttribute("data-action", "tool");
        btn.setAttribute("data-tool", "wita-bastion");
        btn.setAttribute("aria-label", "Von Valancius Bastion");
        btn.setAttribute("aria-pressed", "false");
        btn.setAttribute("data-tooltip", "Von Valancius Bastion");
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

    // Seneschal: intercept sheet open BEFORE render - no flash
    const _isSeneschal = (actor) => {
        const seneschalId = witaSetting("seneschalActorId");
        if (!seneschalId || !actor) return false;
        const uuid = actor?.uuid ?? "";
        const id   = actor?.id ?? "";
        return seneschalId === uuid || seneschalId === id
            || uuid.includes(seneschalId) || seneschalId.includes(id);
    };

    // Seneschal: use libWrapper to intercept render before any DOM is built — zero flash
    const _isSeneschalApp = (app) => {
        const actor = app.document ?? app.actor;
        return _isSeneschal(actor);
    };

    if (game.modules.get("lib-wrapper")?.active) {
        // Wrap V1 ActorSheet render
        try {
            libWrapper.register("wita", "foundry.appv1.sheets.ActorSheet.prototype.render", function(wrapped, ...args) {
                const options = args[1] ?? args[0] ?? {};
                if (options?._witaBastionBypass) return wrapped(...args);
                if (_isSeneschalApp(this)) {
                    _witaOpenPlayerPanel(this.document ?? this.actor);
                    return this;
                }
                return wrapped(...args);
            }, "MIXED");
        } catch(e) { /* ActorSheet may not exist in pure V2 environments */ }

        // Wrap V2 ActorSheet render
        try {
            libWrapper.register("wita", "dnd5e.applications.actor.NPCActorSheet.prototype.render", function(wrapped, ...args) {
                const options = (typeof args[0] === "object") ? args[0] : (args[1] ?? {});
                if (options?._witaBastionBypass) return wrapped(...args);
                if (_isSeneschalApp(this)) {
                    _witaOpenPlayerPanel(this.document ?? this.actor);
                    return Promise.resolve();
                }
                return wrapped(...args);
            }, "MIXED");
        } catch(e) { console.warn("WITA | Could not wrap NPCActorSheet.render:", e); }
    } else {
        // Fallback: hide+close on render hooks
        const _seneschalClose = (app) => {
            if (app.id === PANEL_ID) return;
            if (!_isSeneschalApp(app)) return;
            if (app.element) app.element.style.display = "none";
            setTimeout(() => app.close(), 0);
            _witaOpenPlayerPanel(app.document ?? app.actor);
        };
        Hooks.on("renderActorSheetV2",   _seneschalClose);
        Hooks.on("renderNPCActorSheet",  _seneschalClose);
        Hooks.on("renderBaseActorSheet", _seneschalClose);
    }

    // preRenderApplication as extra safety net for V1 apps
    Hooks.on("preRenderApplication", (app, options) => {
        if (options?._witaBastionBypass) return true;
        if (app.id === PANEL_ID) return true;
        if (!_isSeneschalApp(app)) return true;
        _witaOpenPlayerPanel(app.document ?? app.actor);
        return false;
    });

    // Double-clicking a seneschal token opens the player panel
    Hooks.on("dnd5e.postUseActivity", () => {});  // placeholder — token interaction below
    Hooks.on("getTokenContextOptions", (token, options) => {
        const seneschalId = witaSetting("seneschalActorId");
        if (!seneschalId) return;
        const tokenActorId  = token.document?.actorId ?? "";
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
    if (existing?.rendered) {
        existing.bringToFront();
        return;
    }
    const panel = new WITABastionPanel();
    panel._playerMode = !game.user.isGM;
    panel._seneschalActor = seneschalActor;
    panel.render({ force: true });
}