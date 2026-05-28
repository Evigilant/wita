import { SMITHY_ITEM_ID }                                    from "../../professions/crafters/smithy/data/smithy-config.js";
import { resolveSmithyOrders, getSmithySlots, getSmithyOrder } from "../../professions/crafters/smithy/data/smithy-data.js";
import { WITASmithyDialog }                                    from "../../professions/crafters/smithy/ui/smithy-dialog.js";
import { witaSetting }                                         from "../../settings/settings.js";

export function registerSmithy() {
    _registerOrderIntercept();
    _registerTurnResolution();
    _registerPublicAPI();
    _registerFacilityDetailStatus();

    console.log("WITA | Smithy ready.");
}

// ── Order intercept ───────────────────────────────────────────
// When a Smithy slot order is set to "craft", open the item dialog

function _registerOrderIntercept() {
    Hooks.on("wita.preSetFacilityOrder", async (slot, newOrder) => {
        if (slot.facilityItemId !== SMITHY_ITEM_ID) return;
        if (newOrder !== "craft") return;

        // Check if workers are assigned
        if (!slot.workerIds?.length) {
            ui.notifications.warn("WITA | Assign smiths to the Smithy before commissioning an item.");
            return false; // cancel order change
        }

        await WITASmithyDialog.open(slot.id);
        return false; // cancel default order save — dialog sets order on confirm
    });
}

// ── Bastion turn resolution ───────────────────────────────────

function _registerTurnResolution() {
    // Called directly from runBastionTurn via game.wita.smithy.resolveNow()
    // Also hooked via bastion-state.js
}

// ── Facility detail status injection ─────────────────────────
// Shows active commission status in WITAFacilityDetail for Smithy slots

function _registerFacilityDetailStatus() {
    Hooks.on("wita.buildFacilityDetailExtra", (slot, containerEl) => {
        if (slot.facilityItemId !== SMITHY_ITEM_ID) return;

        const order = getSmithyOrder(slot.id);
        if (!order) return;

        const rLabelMap = { common: "Common", uncommon: "Uncommon", rare: "Rare", veryrare: "Very Rare" };

        const turnNow     = witaSetting("bastionState")?.turnNumber ?? 0;
        const turnsLeft   = Math.max(0, order.turnsRequired - (turnNow - order.turnStarted));
        const rLabel      = rLabelMap[order.rarity] ?? order.rarity;

        const statusEl = document.createElement("div");
        statusEl.className = "wita-smithy-status";
        statusEl.innerHTML = `
            <div class="wita-fd-section-label">Active Commission</div>
            <div class="wita-smithy-commission">
                <i class="fas fa-hammer"></i>
                <span><strong>${order.quantity}×</strong> ${order.itemName}</span>
                <span class="wita-smithy-rarity-badge">${rLabel}</span>
                <span class="wita-smithy-turns-left">
                    <i class="fas fa-hourglass-half"></i> ${turnsLeft} turn${turnsLeft !== 1 ? "s" : ""} remaining
                </span>
                <span class="wita-smithy-dc">DC ${order.dc}</span>
            </div>
        `;
        containerEl.appendChild(statusEl);
    });
}

// ── Public API ────────────────────────────────────────────────

function _registerPublicAPI() {
    if (!game.wita) return;
    game.wita.smithy = {
        openDialog:   (slotId) => WITASmithyDialog.open(slotId),
        resolveNow:   () => resolveSmithyOrders(witaSetting("bastionState")?.turnNumber ?? 0),
        getOrders:    () => getSmithySlots().map(s => ({ slotId: s.id, order: getSmithyOrder(s.id) })).filter(o => o.order),
    };
}
