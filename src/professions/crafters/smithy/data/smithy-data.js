import {
    SMITHY_ITEM_ID,
    RARITY_LABELS, smithyCraftDC, smithyCraftTurns, RARITY_CRAFTING,
    parseTableResultUuid, parseTableResultName,
    PHB_EQUIPMENT_PACK, EQUIPMENT_TYPE_FILTERS,
    GENERIC_ENHANCEMENT_UUIDS, getGenericCategory,
    DMG_TABLES_PACK, ARMAMENTS_TABLES,
} from "./smithy-config.js";
import { witaSetting }        from "../../../../settings/settings.js";
import { WITAFacilityCraft }  from "../../../core/facility-craft.js";

export { smithyCraftTurns, RARITY_CRAFTING };

// ── Table loaders ─────────────────────────────────────────────

export async function loadArmamentsTable(rarity) {
    const tableId = ARMAMENTS_TABLES[rarity];
    if (!tableId) return [];
    const uuid  = `Compendium.${DMG_TABLES_PACK}.RollTable.${tableId}`;
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

// ── Enhancement application ───────────────────────────────────

async function _buildEnhancedItemData(baseItemUuid, commissionItemName) {
    const baseItem = await fromUuid(baseItemUuid).catch(() => null);
    if (!baseItem) return null;
    const itemData = baseItem.toObject();

    const bonusMatch = commissionItemName.match(/\+(\d)/);
    if (!bonusMatch) return itemData;

    const bonus    = parseInt(bonusMatch[1]);
    const category = getGenericCategory(commissionItemName);
    if (!category) return itemData;

    const enhUuid = GENERIC_ENHANCEMENT_UUIDS[category];
    if (!enhUuid) return itemData;

    const enhItem = await fromUuid(enhUuid).catch(() => null);
    if (!enhItem) return itemData;

    const effect = enhItem.effects.find(e => {
        const bonusChange = e.changes.find(c => c.key === "system.magicalBonus");
        return bonusChange && parseInt(bonusChange.value) === bonus;
    });
    if (!effect) return itemData;

    for (const change of effect.changes) {
        const { key, value, mode } = change;
        if (key === "name") {
            itemData.name = value.replace("{}", itemData.name);
        } else if (key === "system.properties") {
            const props = itemData.system.properties ?? [];
            if (!props.includes(value)) props.push(value);
            foundry.utils.setProperty(itemData, "system.properties", props);
        } else if (mode === 5) {
            foundry.utils.setProperty(itemData, key, value);
        } else if (mode === 4) {
            const current = foundry.utils.getProperty(itemData, key) ?? 0;
            foundry.utils.setProperty(itemData, key, (parseFloat(current) || 0) + (parseFloat(value) || 0));
        } else if (mode === 2) {
            foundry.utils.setProperty(itemData, key, value);
        }
    }

    itemData.effects = itemData.effects ?? [];
    itemData.effects.push(effect.toObject());

    return itemData;
}

async function _deliverSmithyItem(order, _slot, success) {
    if (!success) return;
    const bankerId = witaSetting("bankerActorId");
    const banker   = bankerId ? game.actors.get(bankerId) : null;
    if (!banker || !order.itemUuid) return;
    try {
        const itemData = await _buildEnhancedItemData(order.itemUuid, order.itemName);
        const items = itemData
            ? Array.from({ length: order.quantity }, () => itemData)
            : Array.from({ length: order.quantity }, () => ({ uuid: order.itemUuid, quantity: 1 }));
        await game.itempiles?.API?.addItems(banker, items);
    } catch (e) {
        console.warn("WITA | Smithy delivery failed:", e);
    }
}

// ── SmithyCraft singleton ─────────────────────────────────────

export const SmithyCraft = new WITAFacilityCraft({
    facilityItemId:  SMITHY_ITEM_ID,
    orderFlagKey:    "smithyOrder",
    professionKey:   "mechanicus",
    chatAlias:       "Smithy",
    xpEvents: {
        success: "smithySuccess",
        partial: "smithyPartialSuccess",
        failure: "smithyFailure",
    },
    deliverItem:     _deliverSmithyItem,
    orderDetailHtml: (order) => order.rarity
        ? ` <em style="color:var(--color-form-hint)">(${RARITY_LABELS[order.rarity] ?? order.rarity})</em>`
        : "",
    dcFormula:       smithyCraftDC,
    turnsFormula:    smithyCraftTurns,
});

// ── Named exports for existing call sites ─────────────────────

export const getSmithySlots         = ()       => SmithyCraft.getFacilitySlots();
export const getSmithyOrder         = (slotId) => SmithyCraft.getOrder(slotId);
export const setSmithyOrder         = (s, o)   => SmithyCraft.setOrder(s, o);
export const clearSmithyOrder       = (slotId) => SmithyCraft.clearOrder(slotId);
export const resolveSmithyOrders    = (turn)   => SmithyCraft.resolveOrders(turn);
