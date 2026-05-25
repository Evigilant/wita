// ============================================================
// WITA — BASTION PANEL
// WITABastionPanel: custom Foundry sidebar tab, 6 tabs.
// Tabs: Status · Facilities · Workers · Finance · Reports · Engineer
// All players can view; GM controls are conditionally rendered.
// ============================================================

import { sanitizeHTML, witaSetting }              from "../core/utils.js";
import { getBastionData, saveBastionData,
         getEngineeringData, getAllFacilities,
         WITA_HEALTH_STATES, WITA_HEALTH_ICON,
         WITA_SIZE_ICON, WITA_SIZE_LABEL,
         WITA_ORDER_ICON, WITA_ORDER_LABEL,
         WITA_TIER_ICON, WITA_TIER_LABEL,
         WITA_WORKER_STATUSES,
         WITA_MORALE_COLOUR, WITA_MORALE_LABEL,
         allSlots, occupiedSlots,
         _emptySlotFields }                       from "./bastion-data.js";
import { calcProductivity, findSlot,
         assignFacilityToSlot, clearSlot,
         enlargeSlot, setSlotHealth,
         adjustSlotCapacity, addSlot,
         removeLastEmptySlot, setBastionTier }    from "./bastion-slots.js";
import { getAllWorkers, getUnassignedWorkers,
         liveDefenderCount,
         createWorker, updateWorker, deleteWorker,
         assignWorkerToSlot, addDefender,
         removeDefender, setDefenderAlive }       from "./bastion-workers.js";
import { getBastionState }                        from "./bastion-state.js";
import { getFinancialSummary }                    from "./bastion-finance.js";
import { getFacilityCost, setFacilityCost,
         getMetaCost, setMetaCost,
         createEngineerVendor, syncVendorPrices,
         openCustomFacilityDialog,
         addCustomFacilityToVendor }              from "./bastion-engineer.js";
import { deleteCustomFacility }                   from "./bastion-data.js";

// ── Constants ─────────────────────────────────────────────────

const TABS       = ["status","facilities","workers","finance","reports","engineer"];
const TAB_LABELS = { status:"Status", facilities:"Facilities", workers:"Workers",
                     finance:"Finance", reports:"Reports", engineer:"Engineer" };
const PANEL_ID   = "wita-bastion-panel";
const SIDEBAR_ID = "wita-bastion";

// ── WITABastionPanel ──────────────────────────────────────────

export class WITABastionPanel extends Application {

    constructor(options = {}) {
        super(options);
        this._activeTab  = "status";
        this._openSlots  = new Set();
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id:      PANEL_ID,
            title:   "Von Valancius Bastion",
            popOut:  false,
            classes: ["tab", "wita-bastion-panel"],
        });
    }

    // ── Render ──────────────────────────────────────────────────

    async _render(force, options) {
        const container = document.querySelector(`#${PANEL_ID}`);
        if (!container) return;
        container.innerHTML = "";
        container.appendChild(this._buildPanel());
        this._activateListeners(container);
        this._switchTab(this._activeTab, container);
    }

    // ── Shell ───────────────────────────────────────────────────

    _buildPanel() {
        const wrap = document.createElement("div");
        wrap.className = "wita-panel-inner";

        wrap.appendChild(this._buildHeader());
        wrap.appendChild(this._buildTabStrip());

        const body = document.createElement("div");
        body.className = "wita-panel-body";
        for (const tab of TABS) {
            const pane = document.createElement("div");
            pane.className = "wita-tab-content";
            pane.dataset.tab = tab;
            pane.appendChild(this._buildTab(tab));
            body.appendChild(pane);
        }
        wrap.appendChild(body);
        return wrap;
    }

    _buildHeader() {
        const data    = getBastionData();
        const tier    = data.bastionTier ?? 0;
        const header  = document.createElement("div");
        header.className = "wita-panel-header";
        header.innerHTML = `
            <span class="wita-tier-badge" title="${WITA_TIER_LABEL[tier]}">${WITA_TIER_ICON[tier]}</span>
            <h2>${sanitizeHTML(witaSetting("bastionJournalName") ?? "Bastion")}</h2>
        `;
        return header;
    }

    _buildTabStrip() {
        const strip = document.createElement("nav");
        strip.className = "wita-tabs";
        for (const tab of TABS) {
            const btn = document.createElement("button");
            btn.className  = "wita-tab-btn";
            btn.dataset.tab = tab;
            btn.textContent = TAB_LABELS[tab];
            strip.appendChild(btn);
        }
        return strip;
    }

    // ── Tab dispatch ────────────────────────────────────────────

    _buildTab(tab) {
        const frag = document.createDocumentFragment();
        const map  = {
            status:     () => this._buildStatusTab(),
            facilities: () => this._buildFacilitiesTab(),
            workers:    () => this._buildWorkersTab(),
            finance:    () => this._buildFinanceTab(),
            reports:    () => this._buildReportsTab(),
            engineer:   () => this._buildEngineerTab(),
        };
        const el = map[tab]?.() ?? document.createElement("div");
        frag.appendChild(el);
        return frag;
    }

    // ── Status tab ──────────────────────────────────────────────

    _buildStatusTab() {
        const el      = document.createElement("div");
        const data    = getBastionData();
        const bst     = getBastionState();
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
            </div>` : ""}
        `;
        return el;
    }

    // ── Facilities tab ───────────────────────────────────────────

    _buildFacilitiesTab() {
        const el   = document.createElement("div");
        const data = getBastionData();

        // Slot pool controls (GM only)
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

        // Basic facilities section
        if ((data.basicSlots?.length ?? 0) > 0) {
            const basicLabel = document.createElement("div");
            basicLabel.className = "wita-section-label";
            basicLabel.textContent = "Basic Facilities";
            el.appendChild(basicLabel);
            const basicGrid = document.createElement("div");
            basicGrid.className = "wita-slots-grid";
            for (const slot of (data.basicSlots ?? [])) {
                basicGrid.appendChild(this._buildSlotCard(slot, data.workers ?? []));
            }
            el.appendChild(basicGrid);
        }

        // Special facilities section
        if ((data.specialSlots?.length ?? 0) > 0) {
            const specLabel = document.createElement("div");
            specLabel.className = "wita-section-label";
            specLabel.textContent = "Special Facilities";
            el.appendChild(specLabel);
            const specGrid = document.createElement("div");
            specGrid.className = "wita-slots-grid";
            for (const slot of (data.specialSlots ?? [])) {
                specGrid.appendChild(this._buildSlotCard(slot, data.workers ?? []));
            }
            el.appendChild(specGrid);
        }

        if ((data.basicSlots?.length ?? 0) === 0 && (data.specialSlots?.length ?? 0) === 0) {
            el.innerHTML += `<div class="wita-empty">No facility slots yet. Add slots using the controls above, or purchase them from the Engineer vendor.</div>`;
        }

        return el;
    }

    _buildSlotCard(slot, allWorkers) {
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

        const prod   = calcProductivity(slot, allWorkers);
        const hIcon  = WITA_HEALTH_ICON[slot.health] ?? "❓";
        const sIcon  = slot.facilitySize ? WITA_SIZE_ICON[slot.facilitySize] : "";
        const oIcon  = slot.facilityOrder ? WITA_ORDER_ICON[slot.facilityOrder] : "";
        const oLabel = slot.facilityOrder ? WITA_ORDER_LABEL[slot.facilityOrder] : "";
        const isOpen = this._openSlots.has(slot.id);
        const isBasic = slot.facilityType === "basic";
        const allFac  = getAllFacilities();
        const meta    = allFac[slot.facilityItemId] ?? {};

        const assigned = (slot.workerIds ?? [])
            .map(id => allWorkers.find(w => w.id === id))
            .filter(Boolean);

        const hdr = document.createElement("div");
        hdr.className = "wita-slot-header";
        hdr.dataset.slotId = slot.id;
        hdr.innerHTML = `
            <img class="wita-slot-img" src="${sanitizeHTML(slot.facilityImg ?? "icons/svg/castle.svg")}" alt="">
            <span class="wita-slot-name" title="${sanitizeHTML(slot.facilityName ?? "")}">${sanitizeHTML(slot.facilityName ?? "")}</span>
            ${!isBasic && prod !== null ? `<span class="wita-slot-productivity">${prod}%</span>` : ""}
            <span class="wita-health-badge">${hIcon}</span>
            <i class="fas fa-chevron-${isOpen ? "up" : "down"}" style="font-size:0.55rem;opacity:0.5"></i>
        `;
        wrap.appendChild(hdr);

        const body = document.createElement("div");
        body.className = `wita-slot-body${isOpen ? " open" : ""}`;

        // Metadata row
        const metaRow = document.createElement("div");
        metaRow.className = "wita-slot-meta-row";
        metaRow.innerHTML = `
            ${sIcon ? `<span class="wita-meta-badge size">${sIcon} ${WITA_SIZE_LABEL[slot.facilitySize]}</span>` : ""}
            ${oLabel ? `<span class="wita-meta-badge order">${oIcon} ${oLabel}</span>` : ""}
            ${slot.facilityLevelReq ? `<span class="wita-meta-badge level">Lv ${slot.facilityLevelReq}</span>` : ""}
            ${slot.facilityPrereq && slot.facilityPrereq !== "None" ? `<span class="wita-meta-badge prereq" title="${sanitizeHTML(slot.facilityPrereq)}">Req</span>` : ""}
        `;
        body.appendChild(metaRow);

        if (!isBasic) {
            // Worker summary
            const wRow = document.createElement("div");
            wRow.className = "wita-slot-worker-summary";
            wRow.innerHTML = `
                <span>Hirelings: ${assigned.filter(w=>w.status==="Active").length} / ${slot.hirelingSlots ?? 0}</span>
                ${(slot.defenderSlots ?? 0) > 0 ? `<span>Defenders: ${assigned.filter(w=>w.status==="Active").length} / ${slot.defenderSlots}</span>` : ""}
                <span>Cap: ${(WITA_SIZE_LABEL[slot.facilitySize] ? Math.round((
                    slot.facilitySize === "cramped" ? 1.00 :
                    slot.facilitySize === "roomy"   ? 1.25 : 1.50
                ) * 100) : 100)}%</span>
            `;
            body.appendChild(wRow);

            // Worker chips
            if (assigned.length > 0) {
                const chips = document.createElement("div");
                chips.className = "wita-worker-chips";
                for (const w of assigned) {
                    const chip = document.createElement("div");
                    chip.className = "wita-worker-chip";
                    chip.innerHTML = `
                        <span class="morale-pip" style="background:${WITA_MORALE_COLOUR(w.morale ?? 50)}"></span>
                        <span class="chip-name">${sanitizeHTML(w.name)}</span>
                        <span class="chip-role">${sanitizeHTML(w.role ?? "")}</span>
                        <span class="chip-status" style="margin-left:auto">${w.status}</span>
                    `;
                    chips.appendChild(chip);
                }
                body.appendChild(chips);
            }
        }

        if (game.user.isGM) {
            const gmControls = document.createElement("div");
            gmControls.className = "wita-slot-gm-controls";

            if (!isBasic) {
                gmControls.innerHTML += `
                    <div class="wita-cap-row">
                        <span class="wita-cap-label">👷</span>
                        <button class="wita-cap-btn" data-slot-id="${slot.id}" data-field="hirelingSlots" data-delta="-1">−</button>
                        <span class="wita-cap-value">${slot.hirelingSlots ?? 0}</span>
                        <button class="wita-cap-btn" data-slot-id="${slot.id}" data-field="hirelingSlots" data-delta="1">+</button>
                        <span class="wita-cap-label" style="margin-left:0.5rem">🛡</span>
                        <button class="wita-cap-btn" data-slot-id="${slot.id}" data-field="defenderSlots" data-delta="-1">−</button>
                        <span class="wita-cap-value">${slot.defenderSlots ?? 0}</span>
                        <button class="wita-cap-btn" data-slot-id="${slot.id}" data-field="defenderSlots" data-delta="1">+</button>
                    </div>
                `;
            }

            const enlargeable = meta.enlargeable && slot.facilitySize === "roomy";
            gmControls.innerHTML += `
                <div class="wita-slot-actions">
                    <select class="wita-health-select" data-slot-id="${slot.id}">
                        ${WITA_HEALTH_STATES.map(h =>
                            `<option value="${h}" ${h === slot.health ? "selected":""}>${WITA_HEALTH_ICON[h]} ${h}</option>`
                        ).join("")}
                    </select>
                    ${enlargeable ? `<button class="wita-btn wita-enlarge-btn" data-slot-id="${slot.id}" style="font-size:0.65rem">→ Vast</button>` : ""}
                    <button class="wita-btn danger wita-clear-slot" data-slot-id="${slot.id}" style="font-size:0.65rem;margin-left:auto">✕ Clear</button>
                </div>
            `;
            body.appendChild(gmControls);
        }

        wrap.appendChild(body);
        return wrap;
    }

    // ── Workers tab ─────────────────────────────────────────────

    _buildWorkersTab() {
        const el      = document.createElement("div");
        const data    = getBastionData();
        const workers = data.workers ?? [];
        const slots   = allSlots(data);
        const slotName = wid => slots.find(s => (s.workerIds ?? []).includes(wid))?.facilityName ?? "—";

        // Hirelings section
        const hLabel = document.createElement("div");
        hLabel.className = "wita-section-label";
        hLabel.textContent = "Hirelings";
        el.appendChild(hLabel);

        if (workers.length === 0) {
            el.innerHTML += `<div class="wita-empty">No hirelings yet.${game.user.isGM ? " Add one below." : ""}</div>`;
        } else {
            const tbl = this._buildWorkerTable(workers, slotName, slots);
            el.appendChild(tbl);
        }

        if (game.user.isGM) {
            const btnRow = document.createElement("div");
            btnRow.className = "wita-btn-row";
            btnRow.innerHTML = `<button class="wita-btn" id="wita-add-worker"><i class="fas fa-plus"></i> Add Hireling</button>`;
            el.appendChild(btnRow);
        }

        // Defenders section
        const dLabel = document.createElement("div");
        dLabel.className = "wita-section-label";
        dLabel.style.marginTop = "0.75rem";
        dLabel.textContent = "Bastion Defenders";
        el.appendChild(dLabel);

        const defenders = data.defenders ?? [];
        const alive     = defenders.filter(d => d.alive);
        const dead      = defenders.filter(d => !d.alive);

        if (defenders.length === 0) {
            el.innerHTML += `<div class="wita-empty">No defenders recruited yet.${game.user.isGM ? " Add them below." : ""}</div>`;
        } else {
            const defDiv = document.createElement("div");
            defDiv.className = "wita-defender-roster";
            defDiv.innerHTML = `
                <div class="wita-defender-count">
                    <strong>${alive.length}</strong> alive
                    ${dead.length > 0 ? ` · <span style="color:var(--color-form-hint)">${dead.length} fallen</span>` : ""}
                </div>
            `;
            if (game.user.isGM) {
                const list = document.createElement("div");
                list.className = "wita-defender-list";
                for (const d of defenders) {
                    const row = document.createElement("div");
                    row.className = `wita-defender-row${d.alive ? "" : " dead"}`;
                    row.innerHTML = `
                        <span>${d.alive ? "⚔️" : "💀"}</span>
                        <span class="def-name">${sanitizeHTML(d.name)}</span>
                        <div class="wita-worker-actions" style="margin-left:auto">
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
            const defBtnRow = document.createElement("div");
            defBtnRow.className = "wita-btn-row";
            defBtnRow.style.marginTop = "0.4rem";
            defBtnRow.innerHTML = `<button class="wita-btn" id="wita-add-defender"><i class="fas fa-plus"></i> Add Defender</button>`;
            el.appendChild(defBtnRow);
        }

        return el;
    }

    _buildWorkerTable(workers, slotName, slots) {
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
                <td><strong>${sanitizeHTML(w.name)}</strong></td>
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
        const journal = game.journal.getName(witaSetting("bastionJournalName") ?? "");
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
            row.dataset.pageId = page.id;
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
        const el     = document.createElement("div");
        const isGM   = game.user.isGM;
        const engData = getEngineeringData();
        const allFac  = getAllFacilities();

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

        // Meta items (tier / slot / enlarge)
        el.innerHTML += `<div class="wita-section-label">Bastion Items</div>`;
        const metaData = [
            { key: "tierUpgrade1", name: "Bastion Expansion — Tier I" },
            { key: "tierUpgrade2", name: "Bastion Expansion — Tier II" },
            { key: "tierUpgrade3", name: "Bastion Expansion — Tier III" },
            { key: "basicSlot",    name: "Add Basic Facility Slot" },
            { key: "specialSlot",  name: "Add Special Facility Slot" },
            { key: "enlarge",      name: "Enlarge Facility (→ Vast)" },
        ];
        el.appendChild(this._buildCostTable(metaData.map(m => ({
            id:   m.key,
            name: m.name,
            meta: true,
            cost: getMetaCost(m.key),
        })), false));

        // DMG facilities
        el.innerHTML += `<div class="wita-section-label">DMG Facilities</div>`;
        const dmgRows = Object.entries(WITA_DMG_FACILITIES ?? {})
            .sort((a, b) => a[1].name.localeCompare(b[1].name))
            .map(([id, meta]) => ({ id, name: meta.name, meta: false, cost: getFacilityCost(id), fMeta: meta }));
        el.appendChild(this._buildCostTable(dmgRows, true));

        // Custom facilities
        const customFac = Object.entries(allFac).filter(([, m]) => m.custom);
        const customLabel = document.createElement("div");
        customLabel.className = "wita-section-label";
        customLabel.style.display = "flex";
        customLabel.style.alignItems = "center";
        customLabel.innerHTML = `<span style="flex:1">Custom Facilities</span>
            ${isGM ? `<button class="wita-btn" id="wita-new-facility" style="font-size:0.65rem;padding:0.15rem 0.5rem"><i class="fas fa-plus"></i> New</button>` : ""}`;
        el.appendChild(customLabel);

        if (customFac.length === 0) {
            el.innerHTML += `<div class="wita-empty" style="padding:0.4rem 0">No custom facilities yet.</div>`;
        } else {
            const customRows = customFac.sort((a, b) => a[1].name.localeCompare(b[1].name))
                .map(([id, meta]) => ({ id, name: meta.name, meta: false, cost: getFacilityCost(id), fMeta: meta, custom: true }));
            el.appendChild(this._buildCostTable(customRows, true, true));
        }

        return el;
    }

    _buildCostTable(rows, showFacilityMeta, showDelete = false) {
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

        // Tab switching
        container.querySelectorAll(".wita-tab-btn").forEach(btn =>
            btn.addEventListener("click", () => this._switchTab(btn.dataset.tab, container))
        );

        // Slot header toggle (collapse/expand)
        container.querySelectorAll(".wita-slot-header[data-slot-id]").forEach(hdr =>
            hdr.addEventListener("click", () => {
                const id   = hdr.dataset.slotId;
                const body = hdr.nextElementSibling;
                if (!body?.classList.contains("wita-slot-body")) return;
                if (this._openSlots.has(id)) this._openSlots.delete(id);
                else this._openSlots.add(id);
                body.classList.toggle("open");
                const chev = hdr.querySelector(".fa-chevron-down, .fa-chevron-up");
                if (chev) {
                    chev.classList.toggle("fa-chevron-down");
                    chev.classList.toggle("fa-chevron-up");
                }
            })
        );

        // Slot pool controls (+/- basic/special)
        container.querySelectorAll(".wita-pool-btn").forEach(btn =>
            btn.addEventListener("click", async () => {
                const pool  = btn.dataset.pool;
                const delta = parseInt(btn.dataset.delta);
                if (delta > 0) await addSlot(pool);
                else await removeLastEmptySlot(pool);
                await this.render(true);
            })
        );

        // Drag-drop (GM only)
        if (game.user.isGM) {
            container.querySelectorAll(".wita-slot").forEach(slotEl => {
                slotEl.addEventListener("dragover", e => {
                    if (!e.dataTransfer.types.includes("text/plain")) return;
                    e.preventDefault();
                    slotEl.classList.add("drag-over");
                });
                slotEl.addEventListener("dragleave", () => slotEl.classList.remove("drag-over"));
                slotEl.addEventListener("drop", async e => {
                    e.preventDefault();
                    slotEl.classList.remove("drag-over");
                    let dd;
                    try { dd = JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return; }
                    if (dd.type !== "Item" || !dd.uuid) return;
                    await assignFacilityToSlot(slotEl.dataset.slotId, dd.uuid);
                    await this.render(true);
                });
            });
        }

        // Health select
        container.querySelectorAll(".wita-health-select").forEach(sel =>
            sel.addEventListener("change", async () => {
                await setSlotHealth(sel.dataset.slotId, sel.value);
                await this.render(true);
            })
        );

        // Capacity +/-
        container.querySelectorAll(".wita-cap-btn").forEach(btn =>
            btn.addEventListener("click", async e => {
                e.stopPropagation();
                await adjustSlotCapacity(btn.dataset.slotId, btn.dataset.field, parseInt(btn.dataset.delta));
                await this.render(true);
            })
        );

        // Enlarge
        container.querySelectorAll(".wita-enlarge-btn").forEach(btn =>
            btn.addEventListener("click", async e => {
                e.stopPropagation();
                if (!game.user.isGM) return;
                const ok = await Dialog.confirm({
                    title: "Enlarge Facility",
                    content: "<p>Enlarge this facility to Vast? This cannot be undone without clearing the slot.</p>",
                });
                if (!ok) return;
                await enlargeSlot(btn.dataset.slotId);
                await this.render(true);
            })
        );

        // Clear slot
        container.querySelectorAll(".wita-clear-slot").forEach(btn =>
            btn.addEventListener("click", async e => {
                e.stopPropagation();
                if (!game.user.isGM) return;
                const ok = await Dialog.confirm({ title: "Clear Slot", content: "<p>Remove facility and unassign all workers?</p>" });
                if (!ok) return;
                await clearSlot(btn.dataset.slotId);
                await this.render(true);
            })
        );

        // Worker CRUD
        container.querySelectorAll(".wita-edit-worker").forEach(btn =>
            btn.addEventListener("click", () => this._openWorkerDialog(btn.dataset.workerId))
        );
        container.querySelectorAll(".wita-delete-worker").forEach(btn =>
            btn.addEventListener("click", async () => {
                if (!game.user.isGM) return;
                const ok = await Dialog.confirm({ title: "Remove Hireling", content: "<p>Permanently remove this hireling?</p>" });
                if (!ok) return;
                await deleteWorker(btn.dataset.workerId);
                await this.render(true);
            })
        );
        container.querySelector("#wita-add-worker")?.addEventListener("click", () => this._openWorkerDialog(null));

        // Defender roster
        container.querySelectorAll(".wita-defender-kill").forEach(btn =>
            btn.addEventListener("click", async () => { await setDefenderAlive(btn.dataset.id, false); await this.render(true); })
        );
        container.querySelectorAll(".wita-defender-revive").forEach(btn =>
            btn.addEventListener("click", async () => { await setDefenderAlive(btn.dataset.id, true);  await this.render(true); })
        );
        container.querySelectorAll(".wita-defender-remove").forEach(btn =>
            btn.addEventListener("click", async () => {
                const ok = await Dialog.confirm({ title: "Remove Defender", content: "<p>Remove from roster?</p>" });
                if (!ok) return;
                await removeDefender(btn.dataset.id);
                await this.render(true);
            })
        );
        container.querySelector("#wita-add-defender")?.addEventListener("click", async () => {
            await addDefender();
            await this.render(true);
        });

        // Status tab
        container.querySelector("#wita-trigger-turn")?.addEventListener("click", async () => {
            if (!game.user.isGM) return;
            await globalThis.WITA_BASTION?.triggerTurn?.();
        });
        container.querySelector("#wita-open-journal")?.addEventListener("click", () => {
            game.journal.getName(witaSetting("bastionJournalName") ?? "")?.sheet.render(true);
        });

        // Reports
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

        // Engineer tab
        container.querySelector("#wita-create-vendor")?.addEventListener("click", async () => {
            const engData = getEngineeringData();
            const existing = engData.vendorActorId ? game.actors.get(engData.vendorActorId) : null;
            if (existing) { existing.sheet.render(true); return; }
            await createEngineerVendor();
            await this.render(true);
        });
        container.querySelector("#wita-sync-vendor")?.addEventListener("click", async () => {
            await syncVendorPrices();
            ui.notifications.info("WITA | Vendor prices synced.");
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
                if (!game.user.isGM) return;
                const item = game.items.get(btn.dataset.itemId);
                const ok   = await Dialog.confirm({
                    title:   "Delete Custom Facility",
                    content: `<p>Delete <strong>${item?.name ?? btn.dataset.itemId}</strong>? This will clear any bastion slots using it and remove it from the vendor.</p>`,
                });
                if (!ok) return;
                await deleteCustomFacility(btn.dataset.itemId);
                await this.render(true);
            })
        );
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

    _openWorkerDialog(workerId) {
        if (!game.user.isGM) return;
        const data    = getBastionData();
        const worker  = workerId ? (data.workers ?? []).find(w => w.id === workerId) : null;
        const slots   = allSlots(data).filter(s => s.facilityUuid);
        const curSlot = workerId
            ? slots.find(s => (s.workerIds ?? []).includes(workerId))?.id ?? ""
            : "";

        const slotOpts = slots.map(s =>
            `<option value="${s.id}" ${curSlot === s.id ? "selected" : ""}>${sanitizeHTML(s.facilityName ?? "")}</option>`
        ).join("");
        const statusOpts = WITA_WORKER_STATUSES.map(st =>
            `<option value="${st}" ${(worker?.status ?? "Active") === st ? "selected" : ""}>${st}</option>`
        ).join("");

        const content = `
            <div style="display:flex;flex-direction:column;gap:0.5rem;padding:0.25rem;font-family:var(--font-primary)">
                <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                    Name <input type="text" name="name" value="${sanitizeHTML(worker?.name ?? "")}" placeholder="Hireling name" required
                          style="font-size:0.8rem;padding:0.2rem 0.35rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                </label>
                <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                    Role / Job Title <input type="text" name="role" value="${sanitizeHTML(worker?.role ?? "")}" placeholder="e.g. Blacksmith, Cook…"
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
                        Morale (0–100) <input type="number" name="morale" min="0" max="100" value="${worker?.morale ?? 70}"
                                       style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                    </label>
                </div>
            </div>
        `;

        new Dialog({
            title:   workerId ? `Edit Hireling — ${worker?.name ?? ""}` : "Add Hireling",
            content,
            default: "ok",
            buttons: {
                ok: {
                    label: workerId ? "Save" : "Add",
                    callback: async html => {
                        const f      = html[0];
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
                        await this.render(true);
                    },
                },
                cancel: { label: "Cancel" },
            },
        }).render(true);
    }

    // ── Cost edit dialog ──────────────────────────────────────────

    _openCostDialog(itemIdOrKey, isMeta) {
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

        const content = `
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
                <div>
                    <div style="font-size:0.72rem;font-weight:700;color:var(--color-form-label);margin-bottom:0.25rem">Materials Required</div>
                    <div id="wita-mat-rows">${matRowsHtml(cost.materials ?? [])}</div>
                    <button type="button" id="wita-add-mat" class="wita-btn" style="margin-top:0.3rem;font-size:0.7rem;padding:0.15rem 0.5rem">
                        <i class="fas fa-plus"></i> Add Material
                    </button>
                </div>
            </div>
        `;

        const dlg = new Dialog({
            title:   `Edit Costs — ${sanitizeHTML(name)}`,
            content,
            default: "save",
            buttons: {
                save: {
                    label: "Save",
                    callback: async html => {
                        const f      = html[0];
                        const gpOnly = parseInt(f.querySelector("[name=gpOnly]").value) || 0;
                        const gpMats = parseInt(f.querySelector("[name=gpWithMaterials]").value) || 0;
                        const mats   = [...f.querySelectorAll(".wita-mat-row")]
                            .map(row => ({
                                name: row.querySelector(".wita-mat-name").value.trim(),
                                qty:  parseInt(row.querySelector(".wita-mat-qty").value) || 1,
                            }))
                            .filter(m => m.name);
                        if (isMeta) await setMetaCost(itemIdOrKey, { gpOnly, gpWithMaterials: gpMats, materials: mats });
                        else        await setFacilityCost(itemIdOrKey, { gpOnly, gpWithMaterials: gpMats, materials: mats });
                        await this.render(true);
                    },
                },
                cancel: { label: "Cancel" },
            },
        });

        dlg.render(true);
        Hooks.once("renderDialog", (app, html) => {
            if (app !== dlg) return;
            const c = html[0] ?? html;
            c.querySelector("#wita-add-mat")?.addEventListener("click", () => {
                const rows = c.querySelector("#wita-mat-rows");
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
            c.querySelectorAll(".wita-remove-mat").forEach(btn =>
                btn.addEventListener("click", () => btn.closest(".wita-mat-row").remove())
            );
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

    Hooks.on("renderSidebar", (sidebar, html) => {
        const root   = html.querySelector ? html : html[0];
        const tabsEl = root?.querySelector("#sidebar-tabs");
        if (!tabsEl) return;
        if (tabsEl.querySelector(`[data-tab="${SIDEBAR_ID}"]`)) return;

        const li = document.createElement("li");
        li.setAttribute("data-tab", SIDEBAR_ID);
        li.setAttribute("data-tooltip", "Von Valancius Bastion");
        li.className = "item";
        li.innerHTML = `<i class="fas fa-castle"></i>`;
        tabsEl.appendChild(li);

        li.addEventListener("click", () => {
            const panelEl = document.querySelector(`#${PANEL_ID}`);
            if (!panelEl) return;
            document.querySelectorAll("#sidebar .tab.active").forEach(t => t.classList.remove("active"));
            document.querySelectorAll("#sidebar-tabs .item.active").forEach(t => t.classList.remove("active"));
            li.classList.add("active");
            panelEl.classList.add("active");
            const inst = foundry.applications.instances.get(PANEL_ID) ?? new WITABastionPanel();
            inst.render(true);
        });

        let panelEl = document.querySelector(`#${PANEL_ID}`);
        if (!panelEl) {
            panelEl = document.createElement("section");
            panelEl.id = PANEL_ID;
            panelEl.className = "tab wita-bastion-panel";
            root?.querySelector("#sidebar")?.appendChild(panelEl);
        }
    });

    Hooks.on("updateWorld",   () => { const p = foundry.applications.instances.get(PANEL_ID); if (p?.rendered) p.render(true); });
    Hooks.on("updateSetting", s  => { if (s.namespace !== "wita") return; const p = foundry.applications.instances.get(PANEL_ID); if (p?.rendered) p.render(true); });
    Hooks.on("createItem",    i  => { if (i.getFlag?.("wita","customFacility")) { const p = foundry.applications.instances.get(PANEL_ID); if (p?.rendered) p.render(true); }});
    Hooks.on("deleteItem",    i  => { if (i.getFlag?.("wita","customFacility")) { const p = foundry.applications.instances.get(PANEL_ID); if (p?.rendered) p.render(true); }});
}
