import { getBastionData, saveBastionData, allSlots } from "../../bastion/data/data.js";
import { deductBankFunds }                           from "../../bastion/data/finance.js";
import { WITAWorkerProfession }                      from "../workers/level.js";

export class WITAFacilityCraft {
    constructor({
        facilityItemId,
        orderFlagKey,
        professionKey,
        xpEvents,
        deliverItem,
        buildStatusHtml = () => "",
        chatAlias       = "Facility",
        orderDetailHtml = null,
        outcomeNoteHtml = null,
        dcFormula       = null,
        turnsFormula    = null,
    }) {
        this.facilityItemId  = facilityItemId;
        this.orderFlagKey    = orderFlagKey;
        this.professionKey   = professionKey;
        this.xpEvents        = xpEvents;
        this.deliverItem     = deliverItem;
        this.buildStatusHtml = buildStatusHtml;
        this.chatAlias       = chatAlias;
        this.orderDetailHtml = orderDetailHtml;
        this.outcomeNoteHtml = outcomeNoteHtml ?? _defaultOutcomeNote;
        this.dcFormula       = dcFormula;
        this.turnsFormula    = turnsFormula;
    }

    getFacilitySlots() {
        const data = getBastionData();
        return allSlots(data).filter(s => s.facilityItemId === this.facilityItemId);
    }

    getOrder(slotId) {
        const data = getBastionData();
        const slot = allSlots(data).find(s => s.id === slotId);
        return slot?.flags?.wita?.[this.orderFlagKey] ?? null;
    }

    async setOrder(slotId, order) {
        const data = getBastionData();
        for (const pool of ["basicSlots", "specialSlots"]) {
            const slot = (data[pool] ?? []).find(s => s.id === slotId);
            if (!slot) continue;
            slot.flags                         = slot.flags ?? {};
            slot.flags.wita                    = slot.flags.wita ?? {};
            slot.flags.wita[this.orderFlagKey] = order;
            break;
        }
        await saveBastionData(data);
    }

    async clearOrder(slotId) {
        await this.setOrder(slotId, null);
    }

    async resolveOrders(turnNumber) {
        if (!game.user.isGM) return;
        for (const slot of this.getFacilitySlots()) {
            const order = slot.flags?.wita?.[this.orderFlagKey];
            if (!order) continue;
            if ((turnNumber - order.turnStarted) < order.turnsRequired) continue;
            await this._resolveOrder(slot, order);
        }
    }

    async _resolveOrder(slot, order) {
        const data    = getBastionData();
        const workers = (data.workers ?? []).filter(w => (slot.workerIds ?? []).includes(w.id));

        const die      = await new Roll("1d20").evaluate();
        const countMod = workers.length;
        const total    = die.total + countMod;
        const dc       = order.dc;
        const success  = total >= dc;
        const partial  = !success && total >= dc - 5;

        await this.deliverItem(order, slot, success);

        if (order.materialCost) {
            const { success: funded, shortfall } = await deductBankFunds(order.materialCost, true);
            if (!funded) console.warn(`WITA | ${this.chatAlias}: ${shortfall} GP shortfall on material costs.`);
        }

        const eventKey = success ? this.xpEvents.success
            : partial            ? this.xpEvents.partial
            : this.xpEvents.failure;

        if (eventKey) {
            const freshData  = getBastionData();
            const profession = new WITAWorkerProfession(this.professionKey);
            let   xpDirty    = false;
            for (const worker of workers) {
                const w = (freshData.workers ?? []).find(fw => fw.id === worker.id);
                if (!w) continue;
                profession.awardXP(w, eventKey, freshData);
                xpDirty = true;
            }
            if (xpDirty) await saveBastionData(freshData);
        }

        await this._postResolutionChat(order, { die: die.total, countMod, total, dc, success, workers });
        await this.clearOrder(slot.id);
    }

    async _postResolutionChat(order, { die, countMod, total, dc, success, workers }) {
        const workerNames   = workers.map(w => w.name).join(", ") || "Unknown";
        const outcomeColour = success ? "var(--color-level-success)" : "var(--color-level-error)";
        const outcomeLabel  = success ? "✅ Crafting Successful" : "❌ Crafting Failed";
        const itemLabel     = order.quantity > 1 ? `${order.quantity}× ${order.itemName}` : order.itemName;
        const extraDetail   = this.orderDetailHtml ? this.orderDetailHtml(order) : "";

        await ChatMessage.create({
            content: `
                <div style="font-family:var(--font-primary,Signika);padding:0.5rem">
                    <h3 style="margin:0 0 0.4rem;color:${outcomeColour}">${outcomeLabel}</h3>
                    <p style="margin:0 0 0.25rem;font-size:0.85rem">
                        <strong>${itemLabel}</strong>${extraDetail}
                    </p>
                    <p style="font-size:0.75rem;color:var(--color-form-hint);margin:0 0 0.4rem">
                        Roll: ${die} + ${countMod} (workers) = <strong>${total}</strong> vs DC <strong>${dc}</strong>
                    </p>
                    <p style="font-size:0.72rem;color:var(--color-form-hint);margin:0">Workers: ${workerNames}</p>
                    ${this.outcomeNoteHtml(order, success)}
                </div>
            `,
            whisper: [],
            speaker: { alias: this.chatAlias },
        });
    }
}

function _defaultOutcomeNote(_order, success) {
    return success
        ? `<p style="font-size:0.72rem;margin:0.3rem 0 0;color:var(--color-level-success)">Delivered to banker inventory.</p>`
        : `<p style="font-size:0.72rem;margin:0.3rem 0 0;color:var(--color-level-error)">Materials lost — crafting failed.</p>`;
}
