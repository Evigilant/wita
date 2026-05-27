// ============================================================
// WITA Smithy — smithy-data.js
// Order storage (via bastion slot flags) and resolution logic
// ============================================================

import {
    SMITHY_ITEM_ID, DMG_TABLES_PACK, ARMAMENTS_TABLES,
    RARITY_DC_BASE, RARITY_LABELS, smithyCraftDC, smithyCraftTurns, RARITY_CRAFTING,
    parseTableResultUuid, parseTableResultName,
    PHB_EQUIPMENT_PACK, EQUIPMENT_TYPE_FILTERS,
    GENERIC_ENHANCEMENT_UUIDS, getGenericCategory,
} from "./smithy-config.js";
import { deductBankFunds } from "../bastion/bastion-finance.js";
import { getBastionData, saveBastionData } from "../bastion/bastion-data.js";
import { witaSetting } from "../settings/settings.js";

// ── Order shape ───────────────────────────────────────────────
// Stored on the bastion slot as slot.flags.wita.smithyOrder:
// {
//   itemUuid:      string,   // compendium UUID of item being crafted
//   itemName:      string,
//   rarity:        string,
//   quantity:      number,
//   turnsRequired: number,   // 1d3 result
//   turnStarted:   number,
//   dc:            number,
//   workerIds:     string[], // snapshot of assigned workers at order time
// }

// ── Load armaments table ──────────────────────────────────────

export async function loadArmamentsTable(rarity) {
    const tableId = ARMAMENTS_TABLES[rarity];
    if (!tableId) return [];
    const uuid = `Compendium.${DMG_TABLES_PACK}.RollTable.${tableId}`;
    const table = await fromUuid(uuid).catch(() => null);
    if (!table) return [];

    return table.results.map(r => {
        const nameStr = r.description ?? r.name ?? "";
        return {
            uuid:  parseTableResultUuid(nameStr),
            name:  parseTableResultName(nameStr),
            range: r.range,
        };
    }).filter(r => r.uuid);
}

// ── Equipment sub-selection loader ───────────────────────────

export async function loadEquipmentOptions(category) {
    const pack = game.packs.get(PHB_EQUIPMENT_PACK);
    if (!pack) return [];
    await pack.getIndex({ fields: ["name", "type", "system.type.value"] });
    const typeFilters = new Set(EQUIPMENT_TYPE_FILTERS[category] ?? []);
    return [...pack.index]
        .filter(i => typeFilters.has(i.system?.type?.value))
        .map(i => ({ uuid: `Compendium.${PHB_EQUIPMENT_PACK}.Item.${i._id}`, name: i.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

// ── Smithy slots ──────────────────────────────────────────────

export function getSmithySlots() {
    const data  = getBastionData();
    const slots = [...(data.basicSlots ?? []), ...(data.specialSlots ?? [])];
    return slots.filter(s => s.facilityItemId === SMITHY_ITEM_ID);
}

export function getSmithyOrder(slotId) {
    const data  = getBastionData();
    const slots = [...(data.basicSlots ?? []), ...(data.specialSlots ?? [])];
    const slot  = slots.find(s => s.id === slotId);
    return slot?.flags?.wita?.smithyOrder ?? null;
}

export { smithyCraftTurns, RARITY_CRAFTING };

export async function setSmithyOrder(slotId, order) {
    const data  = getBastionData();
    for (const pool of ["basicSlots", "specialSlots"]) {
        const slot = (data[pool] ?? []).find(s => s.id === slotId);
        if (!slot) continue;
        slot.flags         = slot.flags ?? {};
        slot.flags.wita    = slot.flags.wita ?? {};
        slot.flags.wita.smithyOrder = order;
        break;
    }
    await saveBastionData(data);
}

export async function clearSmithyOrder(slotId) {
    await setSmithyOrder(slotId, null);
}

// ── Resolution ────────────────────────────────────────────────

export async function resolveSmithyOrders(turnNumber) {
    if (!game.user.isGM) return;
    const slots = getSmithySlots();
    for (const slot of slots) {
        const order = slot.flags?.wita?.smithyOrder;
        if (!order) continue;
        const turnsElapsed = turnNumber - order.turnStarted;
        if (turnsElapsed < order.turnsRequired) continue;
        await _resolveOrder(slot, order, turnNumber);
    }
}

// ── Enhancement application ──────────────────────────────────

/**
 * Given a base item UUID and the commission item name (e.g. "Weapon, +1 (Longsword)"),
 * returns item data with the appropriate +1/+2/+3 effect applied in-memory.
 */
async function _buildEnhancedItemData(baseItemUuid, commissionItemName) {
    // Load base item
    const baseItem = await fromUuid(baseItemUuid).catch(() => null);
    if (!baseItem) return null;
    const itemData = baseItem.toObject();

    // Determine bonus from commission name (e.g. "Weapon, +2 (Longsword)" → 2)
    const bonusMatch = commissionItemName.match(/\+(\d)/);
    if (!bonusMatch) return itemData; // no bonus found, return plain item

    const bonus    = parseInt(bonusMatch[1]);
    const category = getGenericCategory(commissionItemName);
    if (!category) return itemData;

    const enhUuid  = GENERIC_ENHANCEMENT_UUIDS[category];
    if (!enhUuid) return itemData;

    // Load the DMG generic enhancement item
    const enhItem = await fromUuid(enhUuid).catch(() => null);
    if (!enhItem) return itemData;

    // Find the matching effect (Weapon +1, Armor +2, etc.)
    const effect = enhItem.effects.find(e => {
        const bonusChange = e.changes.find(c => c.key === "system.magicalBonus");
        return bonusChange && parseInt(bonusChange.value) === bonus;
    });
    if (!effect) return itemData;

    // Apply effect changes to item data
    for (const change of effect.changes) {
        const { key, value, mode } = change;
        if (key === "name") {
            // Mode 5 override with {} placeholder replaced by item name
            itemData.name = value.replace("{}", itemData.name);
        } else if (key === "system.properties") {
            // Mode 2 = add to set
            const props = itemData.system.properties ?? [];
            if (!props.includes(value)) props.push(value);
            foundry.utils.setProperty(itemData, "system.properties", props);
        } else if (mode === 5) {
            // Override
            foundry.utils.setProperty(itemData, key, value);
        } else if (mode === 4) {
            // Add (numeric)
            const current = foundry.utils.getProperty(itemData, key) ?? 0;
            foundry.utils.setProperty(itemData, key, (parseFloat(current) || 0) + (parseFloat(value) || 0));
        } else if (mode === 2) {
            // Add — for non-array fields just set
            foundry.utils.setProperty(itemData, key, value);
        }
    }

    // Also embed the DMG effect on the item so it's visible in the sheet
    itemData.effects = itemData.effects ?? [];
    itemData.effects.push(effect.toObject());

    return itemData;
}

async function _resolveOrder(slot, order, turnNumber) {
    // Get current workers for morale check
    const data    = getBastionData();
    const workers = (data.workers ?? []).filter(w => (slot.workerIds ?? []).includes(w.id));
    const avgMorale = workers.length
        ? workers.reduce((s, w) => s + (w.morale ?? 70), 0) / workers.length
        : 50;

    // Craft check — 1d20 + worker count bonus vs DC
    const die      = await new Roll("1d20").evaluate();
    const countMod = workers.length;
    const total    = die.total + countMod;
    const dc       = order.dc;
    const success  = total >= dc;

    if (success) {
        // Build enhanced item data in-memory, then deliver to banker
        const bankerId = witaSetting("bankerActorId");
        const banker   = bankerId ? game.actors.get(bankerId) : null;
        if (banker && order.itemUuid) {
            try {
                // Build enhanced item data (applies +1/+2/+3 effect before delivery)
                const itemData = await _buildEnhancedItemData(order.itemUuid, order.itemName);
                if (itemData) {
                    // Deliver quantity copies
                    const items = Array.from({ length: order.quantity }, () => itemData);
                    await game.itempiles?.API?.addItems(banker, items);
                } else {
                    // Fallback: deliver by UUID if enhancement failed
                    const items = Array.from({ length: order.quantity }, () => ({ uuid: order.itemUuid, quantity: 1 }));
                    await game.itempiles?.API?.addItems(banker, items);
                }
            } catch (e) {
                console.warn("WITA | Smithy delivery failed:", e);
            }
        }
    }

    // Deduct material costs from banker on resolution
    if (order.materialCost) {
        const { success: funded, shortfall } = await deductBankFunds(order.materialCost, true);
        if (!funded) console.warn(`WITA | Smithy: ${shortfall} GP shortfall on material costs.`);
    }

    // Post chat message
    await _postResolutionChat(slot, order, { die: die.total, countMod, total, dc, success, workers });

    // Clear order
    await clearSmithyOrder(slot.id);
}

async function _postResolutionChat(slot, order, { die, countMod, total, dc, success, workers }) {
    const workerNames = workers.map(w => w.name).join(", ") || "Unknown";
    const outcomeColour = success ? "var(--color-level-success)" : "var(--color-level-error)";
    const outcomeLabel  = success ? "✅ Crafting Successful" : "❌ Crafting Failed";

    const content = `
        <div style="font-family:var(--font-primary,Signika);padding:0.5rem">
            <h3 style="margin:0 0 0.4rem;color:${outcomeColour}">${outcomeLabel}</h3>
            <p style="margin:0 0 0.25rem;font-size:0.85rem">
                <strong>${order.quantity}× ${order.itemName}</strong>
                <em style="color:var(--color-form-hint)">(${RARITY_LABELS[order.rarity] ?? order.rarity})</em>
            </p>
            <p style="font-size:0.75rem;color:var(--color-form-hint);margin:0 0 0.4rem">
                Roll: ${die} + ${countMod} (workers) = <strong>${total}</strong> vs DC <strong>${dc}</strong>
            </p>
            <p style="font-size:0.72rem;color:var(--color-form-hint);margin:0">
                Smiths: ${workerNames}
            </p>
            ${success ? `<p style="font-size:0.72rem;margin:0.3rem 0 0;color:var(--color-level-success)">
                Delivered to banker inventory.
            </p>` : `<p style="font-size:0.72rem;margin:0.3rem 0 0;color:var(--color-level-error)">
                Materials lost — crafting failed.
            </p>`}
        </div>
    `;

    await ChatMessage.create({
        content,
        whisper: [],
        speaker: { alias: "Smithy" },
    });
}