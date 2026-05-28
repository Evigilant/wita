// ============================================================
// WITA — ENGINEER VENDOR
// Item Piles NPC actor creation, stock management, price sync,
// meta-item seeding.
// ============================================================
import { getEngineeringData, saveEngineeringData } from "../../../bastion/data/data.js";
import { getFacilityCost, getMetaCost }             from "./costs.js";

const DMG_PACK          = "dnd-dungeon-masters-guide.bastions";
const VENDOR_ACTOR_NAME = "Engineer";

// ── Refresh helper ────────────────────────────────────────────

export function _refreshPanel() {
    const panel = foundry.applications.instances.get("wita-bastion-panel");
    if (panel?.rendered) panel.render(true);
}

// ── Stock management ──────────────────────────────────────────

export async function _addFacilityToStock(uuid) {
    if (!game.user.isGM) return;

    const item = await fromUuid(uuid);
    if (!item) { ui.notifications.warn("WITA | Could not load item from UUID."); return; }

    const itemId  = item.id ?? item._id;
    const engData = getEngineeringData();
    const stocked = engData.stockedFacilities ?? [];

    if (stocked.includes(itemId)) {
        ui.notifications.info(`WITA | "${item.name}" is already in the stock list.`);
        return;
    }

    stocked.push(itemId);
    engData.stockedFacilities = stocked;

    engData.facilities = engData.facilities ?? {};
    if (!engData.facilities[itemId]) {
        engData.facilities[itemId] = { gpOnly: 1000, gpWithMaterials: 400, materials: [] };
    }
    engData.facilities[itemId].name = item.name;
    await saveEngineeringData(engData);

    const freshData = getEngineeringData();
    const vendor = freshData.vendorActorId ? game.actors.get(freshData.vendorActorId) : null;
    if (vendor) {
        const already = vendor.items.find(i => i.flags?.wita?.engineerItemId === itemId);
        if (!already) {
            await vendor.createEmbeddedDocuments("Item", [_facilityVendorItem(item)]);
        }
    }

    ui.notifications.info(`WITA | "${item.name}" added to Engineer stock.`);
}

export async function _removeFacilityFromStock(itemId) {
    if (!game.user.isGM) return;
    const engData = getEngineeringData();
    engData.stockedFacilities = (engData.stockedFacilities ?? []).filter(id => id !== itemId);
    delete engData.facilities?.[itemId];
    await saveEngineeringData(engData);

    const vendor = engData.vendorActorId ? game.actors.get(engData.vendorActorId) : null;
    if (vendor) {
        const vendorItem = vendor.items.find(i => i.flags?.wita?.engineerItemId === itemId);
        if (vendorItem) await vendor.deleteEmbeddedDocuments("Item", [vendorItem.id]);
    }
}

// ── Item builders ─────────────────────────────────────────────

export function _metaVendorItem(name, gpOnly, metaKey, category, extraFlags) {
    return {
        name,
        type: "consumable",
        img:  "icons/svg/castle.svg",
        system: { quantity: 99, price: { value: gpOnly, denomination: "gp" } },
        flags: {
            "item-piles": {
                item: {
                    price:    gpOnly,
                    quantity: 99,
                    macro:    "Compendium.wita.wita-macros.Macro.8Zd7nXPybrOKzNjA",
                }
            },
            wita: {
                engineerCategory: category,
                engineerMetaKey:  metaKey,
                gpOnly,
                ...extraFlags,
            }
        }
    };
}

export function _facilityVendorItem(facilityItem) {
    const itemId   = facilityItem.id;
    const cost     = getFacilityCost(itemId);
    const matLabel = cost.materials?.length
        ? cost.materials.map(m => `${m.qty}× ${m.name}`).join(", ")
        : "None";
    const base = facilityItem.toObject?.() ?? {};
    return foundry.utils.mergeObject(base, {
        type:   "loot",
        system: { quantity: 99, price: { value: cost.gpOnly, denomination: "gp" } },
        flags: {
            "item-piles": { item: {
                price:    cost.gpOnly,
                quantity: 99,
                macro:    "Compendium.wita.wita-macros.Macro.8Zd7nXPybrOKzNjA",
            }},
            wita: {
                engineerCategory: "facility",
                engineerItemId:   itemId,
                gpOnly:           cost.gpOnly,
                gpWithMaterials:  cost.gpWithMaterials,
                materials:        cost.materials,
                materialsLabel:   matLabel,
            }
        }
    });
}

export function _metaCategoryFromKey(metaKey) {
    if (metaKey.startsWith("tierUpgrade")) return "tierUpgrade";
    if (metaKey === "enlarge")              return "enlargement";
    return "slotExpansion";
}

// ── Vendor creation ───────────────────────────────────────────

export async function createEngineerVendor() {
    if (!game.user.isGM) return;

    if (!game.modules.get("item-piles")?.active) {
        ui.notifications.error("WITA | Item Piles is not active.");
        return;
    }

    const engData = getEngineeringData();
    if (engData.vendorActorId) {
        const existing = game.actors.get(engData.vendorActorId);
        if (existing) { existing.sheet.render(true); return; }
    }

    ui.notifications.info("WITA | Creating Engineer vendor…");
    await seedBastionMetaItems();

    const actor = await Actor.create({
        name: VENDOR_ACTOR_NAME,
        type: "npc",
        img:  "icons/svg/castle.svg",
        flags: {
            "item-piles": {
                data: {
                    type:            "merchant",
                    displayOne:      false,
                    showItemName:    true,
                    purchaseOnly:    false,
                    displayQuantity: "always",
                    description:     "Commission facilities, expand your bastion, or enquire about construction.",
                }
            }
        }
    });

    engData.vendorActorId = actor.id;
    await saveEngineeringData(engData);

    const stockedFacilities = engData.stockedFacilities ?? [];
    if (stockedFacilities.length) {
        const facilityItems = [];
        for (const itemId of stockedFacilities) {
            const worldItem = game.items.get(itemId);
            if (worldItem) { facilityItems.push(_facilityVendorItem(worldItem)); continue; }
            const pack = game.packs.get(DMG_PACK);
            if (pack) {
                const doc = await pack.getDocument(itemId);
                if (doc) facilityItems.push(_facilityVendorItem(doc));
            }
        }
        if (facilityItems.length) {
            await actor.createEmbeddedDocuments("Item", facilityItems);
        }
    }

    await game.itempiles.API.makeItemPileMerchant?.(actor)
        ?? await game.itempiles.API.turnTokenIntoItemPile?.(actor.getActiveTokens()?.[0] ?? actor);

    ui.notifications.info("WITA | Engineer vendor created.");
    actor.sheet.render(true);
}

// ── Sync vendor (prices + items) ─────────────────────────────

export async function syncVendorPrices() {
    if (!game.user.isGM) return;
    const engData = getEngineeringData();
    const vendor  = engData.vendorActorId ? game.actors.get(engData.vendorActorId) : null;
    if (!vendor) { ui.notifications.warn("WITA | No vendor found — create one first."); return; }

    const updates     = [];
    const toCreate    = [];
    const vendorItems = vendor.items;

    for (const item of vendorItems) {
        const wf = item.flags?.wita;
        if (!wf) continue;

        if (wf.engineerCategory === "facility") {
            const cost     = getFacilityCost(wf.engineerItemId);
            const matLabel = cost.materials?.length
                ? cost.materials.map(m => `${m.qty}× ${m.name}`).join(", ") : "None";
            updates.push({
                _id:                              item.id,
                "flags.wita.gpOnly":              cost.gpOnly,
                "flags.wita.gpWithMaterials":     cost.gpWithMaterials,
                "flags.wita.materials":           cost.materials,
                "flags.wita.materialsLabel":      matLabel,
                "flags.item-piles.item.price":    cost.gpOnly,
                "system.price.value":             cost.gpOnly,
                "system.type.value":              "facility",
                "system.type.label":              "Facility",
            });
        } else if (wf.engineerCategory && wf.engineerMetaKey) {
            const cost = getMetaCost(wf.engineerMetaKey);
            updates.push({
                _id:                           item.id,
                type:                          "consumable",
                "flags.wita.gpOnly":           cost.gpOnly,
                "flags.item-piles.item.price": cost.gpOnly,
                "system.price.value":          cost.gpOnly,
            });
        }
    }

    const stockedFacilities = engData.stockedFacilities ?? [];
    for (const itemId of stockedFacilities) {
        const alreadyInVendor = vendorItems.find(i => i.flags?.wita?.engineerItemId === itemId);
        if (alreadyInVendor) continue;

        const worldItem = game.items.get(itemId);
        if (worldItem) { toCreate.push(_facilityVendorItem(worldItem)); continue; }
        for (const packId of ["wita.wita-items", DMG_PACK]) {
            const pack = game.packs.get(packId);
            if (!pack) continue;
            const doc = await pack.getDocument(itemId).catch(() => null);
            if (doc) { toCreate.push(_facilityVendorItem(doc)); break; }
        }
    }

    const stockedMeta = engData.stockedMetaItems ?? [];
    for (const { metaKey, name } of stockedMeta) {
        const alreadyInVendor = vendorItems.find(i => i.flags?.wita?.engineerMetaKey === metaKey);
        if (alreadyInVendor) continue;
        const cost = getMetaCost(metaKey);
        toCreate.push(_metaVendorItem(name, cost.gpOnly, metaKey, _metaCategoryFromKey(metaKey), {}));
    }

    const stockedFacilityIds = new Set(stockedFacilities);
    const stockedMetaKeys    = new Set(stockedMeta.map(m => m.metaKey));
    const toDelete = [];
    for (const item of vendorItems) {
        const wf = item.flags?.wita;
        if (!wf) continue;
        if (wf.engineerCategory === "facility" && !stockedFacilityIds.has(wf.engineerItemId)) {
            toDelete.push(item.id);
        } else if (wf.engineerMetaKey && !stockedMetaKeys.has(wf.engineerMetaKey)) {
            toDelete.push(item.id);
        }
    }

    if (updates.length)  await vendor.updateEmbeddedDocuments("Item", updates);
    if (toCreate.length) await vendor.createEmbeddedDocuments("Item", toCreate);
    if (toDelete.length) await vendor.deleteEmbeddedDocuments("Item", toDelete);

    ui.notifications.info(`WITA | Vendor synced — ${updates.length} updated, ${toCreate.length} added.`);
    console.log(`WITA | Synced vendor: ${updates.length} updated, ${toCreate.length} added.`);
}

// ── Add custom facility to vendor ────────────────────────────

export async function addCustomFacilityToVendor(facilityItem) {
    const engData = getEngineeringData();
    const vendor  = engData.vendorActorId ? game.actors.get(engData.vendorActorId) : null;
    if (!vendor) return;
    await vendor.createEmbeddedDocuments("Item", [_facilityVendorItem(facilityItem)]);
}

// ── Meta-item seeding ─────────────────────────────────────────

const WITA_BASTION_META_ITEMS = [
    { name: "Bastion Expansion — Tier I",    img: "icons/environment/wilderness/arch-stone.webp",    description: "Expands the bastion to Tier I, unlocking Cramped facilities.",                                                                                          metaKey: "tierUpgrade1", category: "tierUpgrade",    tier: 1 },
    { name: "Bastion Expansion — Tier II",   img: "icons/environment/wilderness/arch-stone.webp",    description: "Expands the bastion to Tier II, unlocking Roomy facilities.",                                                                                          metaKey: "tierUpgrade2", category: "tierUpgrade",    tier: 2 },
    { name: "Bastion Expansion — Tier III",  img: "icons/environment/wilderness/arch-stone.webp",    description: "Expands the bastion to Tier III, unlocking Vast facilities.",                                                                                          metaKey: "tierUpgrade3", category: "tierUpgrade",    tier: 3 },
    { name: "Add Basic Facility Slot",       img: "icons/environment/settlement/house-simple.webp",  description: "Adds one new Basic Facility slot to the bastion.",                                                                                                      metaKey: "basicSlot",    category: "slotExpansion",  facilityType: "basic"    },
    { name: "Add Special Facility Slot",     img: "icons/environment/settlement/castle.webp",        description: "Adds one new Special Facility slot to the bastion.",                                                                                                    metaKey: "specialSlot",  category: "slotExpansion",  facilityType: "special"  },
    { name: "Enlarge Facility",              img: "icons/environment/settlement/tower-stone.webp",   description: "Enlarges an eligible facility up one size (Cramped → Roomy, or Roomy → Vast), increasing its capacity and productivity cap.",                           metaKey: "enlarge",      category: "enlargement"                             },
    { name: "Roomy Slot License",            img: "icons/environment/settlement/house-simple.webp",  description: "Grants one additional Roomy size slot, allowing one more facility to be enlarged to Roomy beyond the tier default.",                                    metaKey: "roomyLicense", category: "sizeLicense",    sizeType: "roomy"        },
    { name: "Vast Slot License",             img: "icons/environment/settlement/castle.webp",        description: "Grants one additional Vast size slot, allowing one more facility to be enlarged to Vast beyond the tier default.",                                      metaKey: "vastLicense",  category: "sizeLicense",    sizeType: "vast"         },
];

export async function seedBastionMetaItems() {
    if (!game.user.isGM) return;

    const pack = game.packs.get("wita.wita-items");
    if (!pack) {
        console.warn("WITA | wita.wita-items compendium not found, skipping meta-item seeding.");
        return;
    }

    const index    = await pack.getIndex();
    const toCreate = [];

    for (const meta of WITA_BASTION_META_ITEMS) {
        if (index.find(i => i.name === meta.name)) continue;
        toCreate.push({
            name:   meta.name,
            type:   "loot",
            img:    meta.img,
            system: {
                description: { value: `<p>${meta.description}</p>`, chat: "" },
                quantity: 1,
                price: { value: getMetaCost(meta.metaKey).gpOnly, denomination: "gp" },
            },
            flags: {
                wita: {
                    engineerCategory: meta.category,
                    engineerMetaKey:  meta.metaKey,
                    ...(meta.tier         ? { tier: meta.tier }                 : {}),
                    ...(meta.facilityType ? { facilityType: meta.facilityType } : {}),
                    ...(meta.sizeType     ? { sizeType: meta.sizeType }         : {}),
                    bastionMetaItem: true,
                }
            }
        });
    }

    if (toCreate.length > 0) {
        await Item.createDocuments(toCreate, { pack: "wita.wita-items" });
        console.log(`WITA | Seeded ${toCreate.length} bastion meta-items into wita.wita-items.`);
    } else {
        console.log("WITA | Bastion meta-items already exist in compendium.");
    }
}
