import { sanitizeHTML, getRarityColor }                from "../../core/utils.js";
import { getBastionData, saveBastionData,
         getAllFacilities,
         WITA_HEALTH_STATES, WITA_HEALTH_ICON,
         WITA_SIZE_ICON, WITA_SIZE_LABEL,
         WITA_ORDER_ICON, WITA_ORDER_LABEL }           from "../data/data.js";
import { getSizeLimits, findSlot,
         shrinkSlot, enlargeSlot,
         setSlotHealth, clearSlot,
         adjustSlotCapacity,
         isUnderConstruction, forceCompleteConstruction } from "../data/slots.js";
import { deleteWorker }                                from "../../professions/workers/index.js";
import { moraleChip, rarityBadge, timeLabel }          from "./panel-utils.js";

export class WITAFacilityDetail extends foundry.applications.api.ApplicationV2 {

    constructor(slot, allWorkers, restState, panelInstance, options = {}) {
        super(options);
        this._slot       = slot;
        this._allWorkers = allWorkers;
        this._restState  = restState;
        this._panel      = panelInstance;
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
        const inner = document.createElement("div");
        inner.className = "wita-fd-body";

        // Always re-read slot from live data so capacity/health changes are reflected.
        const liveSlot = findSlot(getBastionData(), this._slot?.id);
        if (liveSlot) this._slot = liveSlot;
        const slot       = this._slot;
        const allFac     = getAllFacilities();
        const meta       = allFac[slot.facilityItemId] ?? {};
        const validOrder = meta.order ?? "";
        const restsLeft  = this._restState?.restsRemaining ?? 0;
        const limits     = getSizeLimits(getBastionData());
        const enlargeable = slot.facilitySize !== "vast"
            && (slot.facilitySize !== "roomy" || limits.availRoomy > 0 || slot.facilitySize === "cramped");
        const shrinkable  = slot.facilitySize !== "cramped";
        const hIcon       = WITA_HEALTH_ICON[slot.health] ?? "❓";
        const sIcon       = slot.facilitySize ? WITA_SIZE_ICON[slot.facilitySize] : "";

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
        const tLabel = timeLabel(restsLeft, !!(slot.facilityOrder && validOrder));

        const slotWorkers = (getBastionData().workers ?? []).filter(w =>
            (slot.workerIds ?? []).includes(w.id)
        );

        const building = isUnderConstruction(slot);
        const turnNow  = this._restState?.bst?.turnNumber ?? 0;
        const turnsLeft = building
            ? Math.max(0, (slot.buildTurnsRequired ?? 1) - (turnNow - (slot.buildStartTurn ?? 0)))
            : 0;

        inner.innerHTML = `
            ${building ? `
            <div class="wita-fd-construction-banner">
                <i class="fas fa-hammer"></i>
                <strong>Under Construction</strong>
                <span>${turnsLeft} turn${turnsLeft !== 1 ? "s" : ""} remaining</span>
                ${game.user.isGM ? `<button id="wita-fd-complete-now" class="wita-detail-micro-btn" style="margin-left:auto">Complete Now</button>` : ""}
            </div>` : ""}
            <div class="wita-fd-top">
                <div class="wita-fd-img-col">
                    <img src="${sanitizeHTML(slot.facilityImg ?? "icons/svg/castle.svg")}" class="wita-fd-img"${building ? ` style="opacity:0.55;filter:grayscale(0.5)"` : ""}>
                    <div class="wita-fd-stat">${sIcon} ${WITA_SIZE_LABEL[slot.facilitySize] ?? ""}</div>
                    <div class="wita-fd-stat">${hIcon} ${slot.health ?? ""}</div>
                    ${slot.facilityLevelReq ? `<div class="wita-fd-stat">Lv ${slot.facilityLevelReq}+</div>` : ""}
                    ${meta.prereq && meta.prereq !== "None" ? `<div class="wita-fd-stat" title="${sanitizeHTML(meta.prereq)}">Req ⚠</div>` : ""}
                </div>
                <div class="wita-fd-controls-col">
                    ${!building && orderOptions.length ? `
                    <div class="wita-fd-field">
                        <label><strong>Order</strong> ${tLabel}</label>
                        <select id="wita-fd-order">
                            ${orderOptions.map(([val, lbl]) =>
                                `<option value="${val}" ${(slot.facilityOrder ?? "") === val ? "selected" : ""}>${lbl}</option>`
                            ).join("")}
                        </select>
                    </div>` : ""}
                    ${game.user.isGM ? `
                    <div class="wita-fd-field">
                        <label><strong>Health</strong></label>
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
                <div class="wita-fd-section-label" style="margin-top:0.5rem;display:flex;align-items:center;gap:0.4rem">
                    Hirelings
                    <span style="color:var(--color-form-hint);font-size:0.7rem;font-weight:400">${slotWorkers.length} / ${slot.hirelingSlots ?? 0}</span>
                    ${game.user.isGM ? `
                        <span style="margin-left:auto;display:flex;gap:0.2rem">
                            <button class="wita-detail-micro-btn wita-fd-hireling-cap-dec" title="Decrease hireling capacity">−</button>
                            <button class="wita-detail-micro-btn wita-fd-hireling-cap-inc" title="Increase hireling capacity">+</button>
                        </span>` : ""}
                </div>
                ${slotWorkers.length === 0
                    ? `<div class="wita-detail-empty">No hirelings assigned.</div>`
                    : slotWorkers.map(w => {
                        const morale = w.morale ?? 70;
                        return `
                        <div class="wita-detail-hireling-row">
                            <span class="wita-detail-hireling-name">${sanitizeHTML(w.name)}</span>
                            <span class="wita-detail-hireling-role">${sanitizeHTML(w.role ?? "—")}</span>
                            ${moraleChip(morale)}
                            ${game.user.isGM ? `
                                <button class="wita-detail-micro-btn wita-fd-hireling-edit"   data-worker-id="${w.id}" title="Edit">✎</button>
                                <button class="wita-detail-micro-btn danger wita-fd-hireling-remove" data-worker-id="${w.id}" title="Remove">✕</button>
                            ` : ""}
                        </div>`;
                    }).join("")
                }
                ${game.user.isGM ? `<button class="wita-detail-micro-btn wita-fd-add-hireling" style="margin-top:0.3rem"><i class="fas fa-plus"></i> Add Hireling</button>` : ""}
            </div>
            ${this._buildCommissionHTML(slot)}
        `;
        return inner;
    }

    _buildCommissionHTML(slot) {
        const smithyOrder = slot.flags?.wita?.smithyOrder;
        if (!smithyOrder) return "";
        const turnNow   = this._restState?.bst?.turnNumber ?? 0;
        const turnsLeft = Math.max(0, smithyOrder.turnsRequired - (turnNow - smithyOrder.turnStarted));
        const rLabel    = { common:"Common", uncommon:"Uncommon", rare:"Rare", veryrare:"Very Rare" }[smithyOrder.rarity] ?? smithyOrder.rarity;
        return `
            <div class="wita-fd-section-label" style="margin-top:0.5rem">Active Commission</div>
            <div class="wita-smithy-commission">
                <i class="fas fa-hammer" style="color:var(--color-highlights)"></i>
                <span style="color:var(--color-highlights)">${smithyOrder.quantity}× ${sanitizeHTML(smithyOrder.itemName)}</span>
                ${rarityBadge(smithyOrder.rarity, rLabel)}
                <span class="wita-smithy-turns-left">
                    <i class="fas fa-hourglass-half"></i> ${turnsLeft} turn${turnsLeft !== 1 ? "s" : ""} left
                </span>
                <span class="wita-smithy-dc">DC ${smithyOrder.dc}</span>
                ${game.user.isGM ? `<button class="wita-detail-micro-btn danger wita-fd-cancel-commission" style="margin-left:auto" data-slot-id="${slot.id}">✕ Cancel</button>` : ""}
            </div>`;
    }

    _replaceHTML(result, content, options) {
        const wc = this.element?.querySelector(".window-content");
        if (!wc) return;
        wc.style.cssText = "padding:0;display:flex;flex-direction:column;overflow:hidden;";
        wc.replaceChildren(result);
        this._attachListeners(wc);
    }

    async _onRender() {}

    _attachListeners(el) {
        const slot    = this._slot;
        const panel   = this._panel;
        const refresh = async () => {
            await panel?.render({ force: true });
            await this.render({ force: true });
        };

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

        el.querySelector("#wita-fd-complete-now")?.addEventListener("click", async () => {
            await forceCompleteConstruction(slot.id);
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
                window:  { title: "Remove Facility" },
                content: `<p>Remove <strong>${sanitizeHTML(slot.facilityName ?? "this facility")}</strong>?</p>`,
            }).catch(() => false);
            if (!confirmed) return;
            await clearSlot(slot.id);
            await panel?.render({ force: true });
            this.close();
        });

        el.querySelectorAll(".wita-fd-hireling-edit").forEach(btn =>
            btn.addEventListener("click", () => panel?._openWorkerDialog(btn.dataset.workerId))
        );
        el.querySelectorAll(".wita-fd-hireling-remove").forEach(btn =>
            btn.addEventListener("click", async () => {
                await deleteWorker(btn.dataset.workerId);
                await refresh();
            })
        );
        el.querySelector(".wita-fd-add-hireling")?.addEventListener("click", () =>
            panel?._openWorkerDialogForSlot(slot.id)
        );

        el.querySelector(".wita-fd-hireling-cap-dec")?.addEventListener("click", async () => {
            await adjustSlotCapacity(slot.id, "hirelingSlots", -1);
            await refresh();
        });
        el.querySelector(".wita-fd-hireling-cap-inc")?.addEventListener("click", async () => {
            await adjustSlotCapacity(slot.id, "hirelingSlots", +1);
            await refresh();
        });

        el.querySelector(".wita-fd-cancel-commission")?.addEventListener("click", async () => {
            const confirmed = await foundry.applications.api.DialogV2.confirm({
                window:  { title: "Cancel Commission" },
                content: `<p>Cancel the active commission? This cannot be undone.</p>`,
            }).catch(() => false);
            if (!confirmed) return;
            const { clearSmithyOrder } = await import("../../professions/crafters/smithy/data/smithy-data.js");
            await clearSmithyOrder(slot.id);
            ui.notifications.info("WITA | Commission cancelled.");
            await panel?.render({ force: true });
            await refresh();
        });
    }
}
