import { sanitizeHTML }                              from "../../../core/utils.js";
import { getBastionData,
         getAllFacilities,
         WITA_HEALTH_ICON, WITA_SIZE_ICON, WITA_SIZE_LABEL,
         WITA_ORDER_ICON, WITA_ORDER_LABEL }           from "../../data/data.js";
import { calcProductivity, findSlot,
         assignFacilityToSlot, isUnderConstruction,
         isBastionExpanding,
         addSlot, removeLastEmptySlot }                from "../../data/slots.js";
import { saveBastionData }                             from "../../data/data.js";
import { WITAFacilityDetail }                          from "../facility-detail.js";
import { timeLabelCompact }                            from "../panel-utils.js";

export function build(panel) {
    const el        = document.createElement("div");
    const data      = getBastionData();
    const restState = panel._restState ?? { restsRemaining: 0, threshold: 7 };
    const turnNumber = restState?.bst?.turnNumber ?? 0;
    const expanding  = isBastionExpanding(data, turnNumber);

    if (expanding) {
        const turnsLeft = Math.max(0, (data.expansionEndTurn ?? 0) - turnNumber);
        const banner = document.createElement("div");
        banner.className = "wita-fd-construction-banner";
        banner.style.cssText = "margin:0.4rem 0 0.6rem";
        banner.innerHTML = `<i class="fas fa-hammer"></i><strong>Bastion Expansion in Progress</strong><span>${turnsLeft} turn${turnsLeft !== 1 ? "s" : ""} remaining — all facilities paused</span>`;
        el.appendChild(banner);
    }

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
            grid.appendChild(buildSlotCard(slot, data.workers ?? [], restState, panel, expanding));
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
            grid.appendChild(buildSlotCard(slot, data.workers ?? [], restState, panel, expanding));
        }
        el.appendChild(grid);
    }

    if ((data.basicSlots?.length ?? 0) === 0 && (data.specialSlots?.length ?? 0) === 0) {
        el.innerHTML += `<div class="wita-empty">No facility slots yet. Add slots using the controls above, or purchase them from the Engineer vendor.</div>`;
    }

    return el;
}

function buildSlotCard(slot, allWorkers, restState, panel, expanding = false) {
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
    const tLabel     = timeLabelCompact(restsLeft, !!slot.facilityOrder);

    if (expanding && slot.facilityUuid) {
        wrap.innerHTML = `
            <div class="wita-slot-compact wita-slot-construction" data-slot-id="${slot.id}">
                <img src="${sanitizeHTML(slot.facilityImg ?? "icons/svg/castle.svg")}" alt="" class="wita-slot-thumb" style="opacity:0.4;filter:grayscale(0.7)">
                <div class="wita-slot-info">
                    <div class="wita-slot-name">${sanitizeHTML(slot.facilityName ?? "")}</div>
                    <div class="wita-slot-sub">
                        <span style="color:var(--color-highlights)"><i class="fas fa-hammer"></i> Expansion in Progress</span>
                        <span style="color:var(--color-form-hint)">Facility paused</span>
                    </div>
                </div>
                <div class="wita-slot-actions">
                    <i class="fas fa-circle-info wita-slot-info-icon" title="View details"></i>
                </div>
            </div>
        `;
        wrap.querySelector(".wita-slot-compact").addEventListener("click", (e) => {
            if (e.target.closest(".wita-slot-info-icon") || !e.target.closest(".wita-slot-actions")) {
                _openFacilityDetail(slot, allWorkers, restState, panel);
            }
        });
        return wrap;
    }

    if (isUnderConstruction(slot)) {
        const turnNow   = restState?.bst?.turnNumber ?? 0;
        const turnsLeft = Math.max(0, (slot.buildTurnsRequired ?? 1) - (turnNow - (slot.buildStartTurn ?? 0)));
        wrap.innerHTML = `
            <div class="wita-slot-compact wita-slot-construction" data-slot-id="${slot.id}">
                <img src="${sanitizeHTML(slot.facilityImg ?? "icons/svg/castle.svg")}" alt="" class="wita-slot-thumb" style="opacity:0.5;filter:grayscale(0.6)">
                <div class="wita-slot-info">
                    <div class="wita-slot-name">${sanitizeHTML(slot.facilityName ?? "")}</div>
                    <div class="wita-slot-sub">
                        <span style="color:var(--color-highlights)"><i class="fas fa-hammer"></i> Under Construction</span>
                        <span style="color:var(--color-form-hint)">${turnsLeft} turn${turnsLeft !== 1 ? "s" : ""} remaining</span>
                    </div>
                </div>
                <div class="wita-slot-actions">
                    <i class="fas fa-circle-info wita-slot-info-icon" title="View details"></i>
                </div>
            </div>
        `;
        wrap.querySelector(".wita-slot-compact").addEventListener("click", (e) => {
            if (e.target.closest(".wita-slot-info-icon") || !e.target.closest(".wita-slot-actions")) {
                _openFacilityDetail(slot, allWorkers, restState, panel);
            }
        });
        return wrap;
    }

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
                    ${tLabel}
                    ${_smithyBadge(slot, restState)}
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

    wrap.querySelector(".wita-slot-compact").addEventListener("click", (e) => {
        if (e.target.closest(".wita-quick-order-btn")) return;
        _openFacilityDetail(slot, allWorkers, restState, panel);
    });

    return wrap;
}

function _smithyBadge(slot, restState) {
    const so = slot.flags?.wita?.smithyOrder;
    if (!so) return "";
    const turnNow   = restState?.bst?.turnNumber ?? 0;
    const turnsLeft = Math.max(0, so.turnsRequired - (turnNow - so.turnStarted));
    return `<span style="color:var(--color-highlights);font-size:0.6rem"><i class="fas fa-hammer"></i> ${sanitizeHTML(so.itemName)} (${turnsLeft}t)</span>`;
}

function _openFacilityDetail(slot, allWorkers, restState, panel) {
    const appId   = `wita-facility-detail-${slot.id}`;
    const existing = foundry.applications.instances.get(appId);
    if (existing) { existing.bringToFront(); return; }
    new WITAFacilityDetail(slot, allWorkers, restState, panel, { id: appId }).render({ force: true });
}

export function bindListeners(el, panel) {
    el.querySelectorAll(".wita-pool-btn").forEach(btn =>
        btn.addEventListener("click", async () => {
            const delta = parseInt(btn.dataset.delta);
            if (delta > 0) await addSlot(btn.dataset.pool);
            else await removeLastEmptySlot(btn.dataset.pool);
            await panel.render({ force: true });
        })
    );

    el.querySelectorAll(".wita-quick-order-btn").forEach(btn =>
        btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const data     = getBastionData();
            const slot     = findSlot(data, btn.dataset.slotId);
            if (!slot) return;
            const newOrder   = btn.dataset.order || null;
            const oldOrder   = slot.facilityOrder ?? null;
            const hookResult = Hooks.call("wita.preSetFacilityOrder", slot, newOrder, oldOrder);
            if (hookResult === false) return;
            const finalOrder = (typeof hookResult === "object" && hookResult?.order !== undefined) ? hookResult.order : newOrder;
            slot.facilityOrder   = finalOrder || null;
            slot.orderStartTurn  = finalOrder ? (panel._restState?.bst?.turnNumber ?? 0) : null;
            slot.orderStartRests = finalOrder ? (panel._restState?.bst?.longRestCount ?? 0) : null;
            const pool = data.basicSlots?.find(s => s.id === slot.id) ? "basicSlots" : "specialSlots";
            const idx  = data[pool].findIndex(s => s.id === slot.id);
            if (idx >= 0) data[pool][idx] = slot;
            await saveBastionData(data);
            Hooks.callAll("wita.postSetFacilityOrder", slot, finalOrder, oldOrder);
            await panel.render({ force: true });
        })
    );

    if (game.user.isGM) {
        el.querySelectorAll(".wita-slot").forEach(slotEl => {
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
                await panel.render({ force: true });
            });
        });
    }
}
