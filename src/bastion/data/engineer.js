// ============================================================
// WITA — BASTION ENGINEER
// Vendor creation, cost management, purchase interception,
// slot/enlargement dialogs, custom facility creator.
// ============================================================

import { sanitizeHTML, witaSetting }          from "../../core/utils.js";
import { getBastionData, saveBastionData,
         getEngineeringData, saveEngineeringData,
         getAllFacilities, WITA_DMG_FACILITIES,
         WITA_TIER_SIZES, WITA_TIER_LABEL,
         createCustomFacility, deleteCustomFacility,
         WITA_SIZES, WITA_ORDERS,
         WITA_SIZE_LABEL, WITA_ORDER_LABEL }  from "./data.js";
import { assignFacilityToSlot, enlargeSlot,
         setBastionTier, addSlot,
         getSizeLimits,
         validateFacilityDrop }               from "./slots.js";

const DMG_PACK          = "dnd-dungeon-masters-guide.bastions";
const DEFAULT_GP_ONLY   = 1000;
const DEFAULT_GP_MATS   = 400;
const VENDOR_ACTOR_NAME = "Engineer";

// ── Cost helpers ──────────────────────────────────────────────

export function getFacilityCost(itemId) {
    const data = getEngineeringData();
    return foundry.utils.mergeObject(
        { gpOnly: DEFAULT_GP_ONLY, gpWithMaterials: DEFAULT_GP_MATS, materials: [] },
        data.facilities?.[itemId] ?? {}
    );
}

export async function setFacilityCost(itemId, cost) {
    if (!game.user.isGM) return;
    const data = getEngineeringData();
    data.facilities         = data.facilities ?? {};
    data.facilities[itemId] = cost;
    await saveEngineeringData(data);
}

// ── Stock management ─────────────────────────────────────────

/**
 * Adds a facility item to the Engineer's stocked list by UUID.
 * Reads item metadata and seeds a default cost entry.
 */
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

    // Seed default cost if none exists, always store name for sync display
    engData.facilities = engData.facilities ?? {};
    if (!engData.facilities[itemId]) {
        engData.facilities[itemId] = { gpOnly: 1000, gpWithMaterials: 400, materials: [] };
    }
    engData.facilities[itemId].name = item.name;

    await saveEngineeringData(engData);

    // Re-read to get the current vendorActorId (may have been set by a concurrent operation)
    const freshData = getEngineeringData();
    const vendor = freshData.vendorActorId ? game.actors.get(freshData.vendorActorId) : null;
    if (vendor) {
        const already = vendor.items.find(i => i.flags?.wita?.engineerItemId === itemId);
        if (!already) {
            await vendor.createEmbeddedDocuments("Item", [_facilityVendorItem(item)]);
        }
        // Item Piles re-renders automatically on actor item changes
    }

    ui.notifications.info(`WITA | "${item.name}" added to Engineer stock.`);
}

/**
 * Removes a facility from the stocked list and its cost entry.
 */
export async function _removeFacilityFromStock(itemId) {
    if (!game.user.isGM) return;
    const engData = getEngineeringData();
    engData.stockedFacilities = (engData.stockedFacilities ?? []).filter(id => id !== itemId);
    delete engData.facilities?.[itemId];
    await saveEngineeringData(engData);

    // Remove from vendor actor
    const vendor = engData.vendorActorId ? game.actors.get(engData.vendorActorId) : null;
    if (vendor) {
        const vendorItem = vendor.items.find(i => i.flags?.wita?.engineerItemId === itemId);
        if (vendorItem) await vendor.deleteEmbeddedDocuments("Item", [vendorItem.id]);
        // Item Piles re-renders automatically on actor item changes
    }
}

// Meta-items (tier upgrades, slot expansions, enlargements, size licenses)
export function getMetaCost(key) {
    const data = getEngineeringData();
    const defaults = {
        tierUpgrade1:  { gpOnly: 5000,  gpWithMaterials: 2000,  materials: [] },
        tierUpgrade2:  { gpOnly: 15000, gpWithMaterials: 6000,  materials: [] },
        tierUpgrade3:  { gpOnly: 40000, gpWithMaterials: 15000, materials: [] },
        basicSlot:     { gpOnly: 500,   gpWithMaterials: 200,   materials: [] },
        specialSlot:   { gpOnly: 2000,  gpWithMaterials: 800,   materials: [] },
        enlarge:       { gpOnly: 2000,  gpWithMaterials: 800,   materials: [] },
        roomyLicense:  { gpOnly: 3000,  gpWithMaterials: 1200,  materials: [] },
        vastLicense:   { gpOnly: 8000,  gpWithMaterials: 3000,  materials: [] },
    };
    return foundry.utils.mergeObject(
        defaults[key] ?? { gpOnly: 1000, gpWithMaterials: 400, materials: [] },
        data.metaItems?.[key] ?? {}
    );
}

export async function setMetaCost(key, cost) {
    if (!game.user.isGM) return;
    const data = getEngineeringData();
    data.metaItems = data.metaItems ?? {};
    data.metaItems[key] = cost;
    await saveEngineeringData(data);
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

    // Only add items that have been explicitly configured in the Engineer tab.
    // Meta items (tier upgrades, slot expansions etc.) are added via the Engineer tab stock list.
    // Facilities are added via drag-drop. Nothing is bulk-seeded on creation.
    const itemsToCreate = [];

    engData.vendorActorId = actor.id;
    await saveEngineeringData(engData);

    // Sync any facilities already in stockedFacilities into the new vendor
    const stockedFacilities = engData.stockedFacilities ?? [];
    if (stockedFacilities.length) {
        const facilityItems = [];
        for (const itemId of stockedFacilities) {
            // Try world items first, then compendium
            const worldItem = game.items.get(itemId);
            if (worldItem) { facilityItems.push(_facilityVendorItem(worldItem)); continue; }
            // Search compendium
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

function _metaVendorItem(name, gpOnly, metaKey, category, extraFlags) {
    return {
        name,
        type: "consumable",  // separates from "loot" facilities in Sort by Type
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

function _facilityVendorItem(facilityItem) {
    const itemId = facilityItem.id;
    const cost   = getFacilityCost(itemId);
    const matLabel = cost.materials?.length
        ? cost.materials.map(m => `${m.qty}× ${m.name}`).join(", ")
        : "None";
    // Use type "loot" so dnd5e allows it in NPC/vendor inventories.
    // "facility" type is restricted from actor inventories in dnd5e v3.
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

// ── Sync vendor (prices + items + types) ─────────────────────

export async function syncVendorPrices() {
    if (!game.user.isGM) return;
    const engData = getEngineeringData();
    const vendor  = engData.vendorActorId ? game.actors.get(engData.vendorActorId) : null;
    if (!vendor) { ui.notifications.warn("WITA | No vendor found — create one first."); return; }

    const updates     = [];
    const toCreate    = [];
    const vendorItems = vendor.items;

    // ── 1. Sync existing vendor items (prices + type label) ──
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

    // ── 2. Add missing stocked facilities ──
    const stockedFacilities = engData.stockedFacilities ?? [];
    for (const itemId of stockedFacilities) {
        const alreadyInVendor = vendorItems.find(i => i.flags?.wita?.engineerItemId === itemId);
        if (alreadyInVendor) continue;

        const worldItem = game.items.get(itemId);
        if (worldItem) { toCreate.push(_facilityVendorItem(worldItem)); continue; }
        // Try wita.wita-items compendium first (custom facilities), then DMG pack
        for (const packId of ["wita.wita-items", DMG_PACK]) {
            const pack = game.packs.get(packId);
            if (!pack) continue;
            const doc = await pack.getDocument(itemId).catch(() => null);
            if (doc) { toCreate.push(_facilityVendorItem(doc)); break; }
        }
    }

    // ── 3. Add missing stocked meta items ──
    const stockedMeta = engData.stockedMetaItems ?? [];
    for (const { metaKey, name } of stockedMeta) {
        const alreadyInVendor = vendorItems.find(i => i.flags?.wita?.engineerMetaKey === metaKey);
        if (alreadyInVendor) continue;
        const cost = getMetaCost(metaKey);
        toCreate.push(_metaVendorItem(name, cost.gpOnly, metaKey, _metaCategoryFromKey(metaKey), {}));
    }

    // ── 4. Remove vendor items no longer in stock lists ──
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

    // Refresh Item Piles merchant inventory cache
    // Item Piles re-renders automatically on actor item changes

    const total = updates.length + toCreate.length;
    ui.notifications.info(`WITA | Vendor synced — ${updates.length} updated, ${toCreate.length} added.`);
    console.log(`WITA | Synced vendor: ${updates.length} updated, ${toCreate.length} added.`);
}

function _metaCategoryFromKey(metaKey) {
    if (metaKey.startsWith("tierUpgrade")) return "tierUpgrade";
    if (metaKey === "enlarge")              return "enlargement";
    return "slotExpansion";
}

// ── Add custom facility to vendor ────────────────────────────

export async function addCustomFacilityToVendor(facilityItem) {
    const engData = getEngineeringData();
    const vendor  = engData.vendorActorId ? game.actors.get(engData.vendorActorId) : null;
    if (!vendor) return;
    const vendorItemData = _facilityVendorItem(facilityItem);
    await vendor.createEmbeddedDocuments("Item", [vendorItemData]);
}

// ── Purchase handler (called from macro) ─────────────────────

export async function handleEngineerPurchase({ seller, buyer, item, quantity, userId }) {
    if (game.user.id !== userId) return false;

    const wf = item.flags?.wita ?? {};

    switch (wf.engineerCategory) {

        case "tierUpgrade":
            return _handleTierUpgrade(wf, buyer);

        case "slotExpansion":
            return _handleSlotExpansion(wf, buyer);

        case "enlargement":
            return _handleEnlargement(wf, buyer);

        case "sizeLicense":
            return _handleSizeLicense(wf, buyer);

        case "facility":
            return _handleFacilityPurchase(item, wf, buyer);

        default:
            ui.notifications.warn(`WITA | Unknown engineer category: ${wf.engineerCategory}`);
            return false;
    }
}

// ── Purchase sub-handlers ─────────────────────────────────────

async function _handleTierUpgrade(wf, buyer) {
    const data      = getBastionData();
    const curTier   = data.bastionTier ?? 0;
    const newTier   = parseInt(wf.tier);  // flags may stringify numbers

    if (isNaN(newTier) || newTier <= curTier) {
        ui.notifications.warn(`WITA | Bastion is already Tier ${curTier} — this upgrade has no effect.`);
        const cost = getMetaCost(wf.engineerMetaKey);
        if (cost?.gpOnly) await game.itempiles.API.addCurrencies(buyer, `${cost.gpOnly}gp`);
        return false;
    }

    if (newTier !== curTier + 1) {
        ui.notifications.warn(`WITA | Must reach Tier ${newTier - 1} before purchasing Tier ${newTier}.`);
        const cost = getMetaCost(wf.engineerMetaKey);
        if (cost?.gpOnly) await game.itempiles.API.addCurrencies(buyer, `${cost.gpOnly}gp`);
        return false;
    }

    // GP already charged by Item Piles.
    await setBastionTier(newTier);
    ui.notifications.info(`WITA | Bastion upgraded to ${WITA_TIER_LABEL[newTier]}!`);
    _refreshPanel();
    return false;
}

async function _handleSlotExpansion(wf, buyer) {
    const fType = wf.facilityType;
    const label = fType === "basic" ? "Basic" : "Special";

    // GP already charged by Item Piles.
    await addSlot(fType);
    ui.notifications.info(`WITA | New ${label} facility slot added.`);
    _refreshPanel();
    return false;
}

async function _handleSizeLicense(wf, buyer) {
    const sizeType = wf.sizeType; // "roomy" or "vast"
    const data     = getBastionData();
    const limits   = getSizeLimits(data);

    if (sizeType === "roomy") {
        data.roomyLicenses = (data.roomyLicenses ?? 0) + 1;
        await saveBastionData(data);
        ui.notifications.info(`WITA | Roomy Slot License applied. You can now enlarge one more facility to Roomy (${limits.usedRoomy}/${limits.maxRoomy + 1} used).`);
    } else if (sizeType === "vast") {
        data.vastLicenses = (data.vastLicenses ?? 0) + 1;
        await saveBastionData(data);
        ui.notifications.info(`WITA | Vast Slot License applied. You can now enlarge one more facility to Vast (${limits.usedVast}/${limits.maxVast + 1} used).`);
    } else {
        ui.notifications.warn("WITA | Unknown size license type.");
        const cost = getMetaCost(wf.engineerMetaKey);
        if (cost?.gpOnly) await game.itempiles.API.addCurrencies(buyer, `${cost.gpOnly}gp`);
    }

    _refreshPanel();
    return false;
}

async function _handleEnlargement(wf, buyer) {
    const data    = getBastionData();
    const cost    = getMetaCost("enlarge");

    // All non-vast occupied slots are eligible
    const eligible = [...(data.basicSlots ?? []), ...(data.specialSlots ?? [])]
        .filter(s => s.facilityUuid && s.facilitySize !== "vast");

    if (!eligible.length) {
        ui.notifications.warn("WITA | No enlargeable facilities currently in the bastion.");
        if (cost?.gpOnly) await game.itempiles.API.addCurrencies(buyer, `${cost.gpOnly}gp`);
        return false;
    }

    const options = eligible.map(s =>
        `<option value="${s.id}">${sanitizeHTML(s.facilityName ?? "Unknown")} (${s.facilitySize})</option>`
    ).join("");

    const choice = await new Promise(resolve => {
        new Dialog({
            title:   "Enlarge Facility",
            content: `
                <p>Select the facility to enlarge:</p>
                <select name="slotId" style="width:100%;margin-top:0.4rem">${options}</select>
            `,
            buttons: {
                ok:     { label: "Enlarge", callback: html => resolve((html instanceof jQuery ? html[0] : html).querySelector("[name=slotId]").value) },
                cancel: { label: "Cancel",  callback: () => resolve(null) },
            },
            close: () => resolve(null),
        }).render(true);
    });

    if (!choice) {
        // Refund GP on cancel
        if (cost?.gpOnly) await game.itempiles.API.addCurrencies(buyer, `${cost.gpOnly}gp`);
        return false;
    }

    // GP already charged by Item Piles.
    await enlargeSlot(choice);
    _refreshPanel();
    return false;
}

async function _handleFacilityPurchase(item, wf, buyer) {
    const itemId    = wf.engineerItemId;
    const gpOnly    = wf.gpOnly         ?? DEFAULT_GP_ONLY;
    const gpMats    = wf.gpWithMaterials ?? DEFAULT_GP_MATS;
    const materials = wf.materials       ?? [];
    const hasMats   = materials.length > 0;
    const name      = sanitizeHTML(item.name);

    // Tier check.
    const allFac  = getAllFacilities();
    const meta    = allFac[itemId];
    const data    = getBastionData();
    const tierErr = meta ? validateFacilityDrop(data, meta, { bypassTier: game.user.isGM }) : null;
    if (tierErr) {
        ui.notifications.warn(`WITA | ${tierErr}`);
        await game.itempiles.API.addCurrencies(buyer, `${gpOnly}gp`);
        return false;
    }

    const matRows = hasMats
        ? materials.map(m => `<li>${m.qty}× ${sanitizeHTML(m.name)}</li>`).join("")
        : "<li>No materials required</li>";

    const choice = await new Promise(resolve => {
        new Dialog({
            title:   `Commission — ${name}`,
            content: `
                <div style="font-family:var(--font-primary)">
                    <p style="font-weight:600;margin:0 0 0.5rem">${name}</p>
                    <label style="display:flex;gap:0.5rem;align-items:flex-start;padding:0.4rem;border:1px solid var(--color-fieldset-border);border-radius:3px;margin-bottom:0.35rem;cursor:pointer">
                        <input type="radio" name="pt" value="gpOnly" checked style="margin-top:0.15rem">
                        <span><strong>${gpOnly.toLocaleString()} GP</strong>
                        <span style="font-size:0.72rem;color:var(--color-form-hint);display:block">Currency only</span></span>
                    </label>
                    <label style="display:flex;gap:0.5rem;align-items:flex-start;padding:0.4rem;border:1px solid var(--color-fieldset-border);border-radius:3px;cursor:pointer${!hasMats?";opacity:0.5;pointer-events:none":""}">
                        <input type="radio" name="pt" value="gpMats" ${!hasMats?"disabled":""} style="margin-top:0.15rem">
                        <span><strong>${gpMats.toLocaleString()} GP + Materials</strong>
                        <ul style="margin:0.2rem 0 0 1rem;font-size:0.72rem;padding:0">${matRows}</ul></span>
                    </label>
                </div>
            `,
            buttons: {
                ok:     { label: "Commission", callback: html => resolve((html instanceof jQuery ? html[0] : html).querySelector("input[name=pt]:checked")?.value ?? "gpOnly") },
                cancel: { label: "Cancel",     callback: () => resolve(null) },
            },
            close: () => resolve(null),
        }).render(true);
    });

    if (!choice) {
        // Player cancelled — refund the GP Item Piles already charged
        await game.itempiles.API.addCurrencies(buyer, `${gpOnly}gp`);
        return false;
    }

    const useMats    = choice === "gpMats" && hasMats;
    const partyActor = game.actors.get(witaSetting("partyActorId"));

    if (useMats) {
        if (!partyActor) { ui.notifications.error("WITA | Party actor not configured."); return false; }
        const missing = _checkMaterials(partyActor, materials);
        if (missing.length) {
            ui.notifications.warn(`WITA | Missing: ${missing.map(m => `${m.qty}× ${m.name}`).join(", ")}`);
            // Refund GP since we can't proceed
            await game.itempiles.API.addCurrencies(buyer, `${gpOnly}gp`);
            return false;
        }
        await _consumeMaterials(partyActor, materials);
        // Refund the difference (IP charged gpOnly, we only want gpMats)
        const refund = gpOnly - gpMats;
        if (refund > 0) await game.itempiles.API.addCurrencies(buyer, `${refund}gp`);
    }

    // GP already charged by Item Piles (gpOnly price on the vendor item).
    await _openSlotDialog(itemId, item, meta);
    return false;
}

// ── Slot assignment dialog ────────────────────────────────────

async function _openSlotDialog(facilityItemId, item, meta) {
    const data     = getBastionData();
    const poolKey  = meta?.type === "basic" ? "basicSlots" : "specialSlots";
    const empty    = (data[poolKey] ?? []).filter(s => !s.facilityUuid);

    if (!empty.length) {
        ui.notifications.warn(`WITA | No empty ${meta?.type ?? ""} slots. Add a slot first.`);
        return;
    }

    const slots    = data[poolKey] ?? [];
    const options  = empty.map((s, i) =>
        `<option value="${s.id}">Slot ${slots.indexOf(s) + 1} (empty)</option>`
    ).join("");

    const uuid = facilityItemId.startsWith("dmg")
        ? `Compendium.${DMG_PACK}.Item.${facilityItemId}`
        : `Item.${facilityItemId}`;

    await new Promise(resolve => {
        new Dialog({
            title:   `Assign — ${sanitizeHTML(item?.name ?? "Facility")}`,
            content: `
                <p><strong>${sanitizeHTML(item?.name ?? "")}</strong> commissioned.</p>
                <p style="font-size:0.8rem;margin:0.3rem 0">Choose a slot:</p>
                <select name="slotId" style="width:100%">${options}</select>
            `,
            buttons: {
                assign: {
                    label: "Assign",
                    callback: async html => {
                        const slotId = (html instanceof jQuery ? html[0] : html).querySelector("[name=slotId]").value;
                        await assignFacilityToSlot(slotId, uuid);
                        ui.notifications.info(`WITA | ${item?.name} assigned to bastion.`);
                        _refreshPanel();
                        resolve();
                    }
                },
                later: { label: "Assign Later", callback: resolve },
            },
            close: resolve,
        }).render(true);
    });
}

// ── Custom facility creator dialog ────────────────────────────

export async function openCustomFacilityDialog(existingItemId = null) {
    if (!game.user.isGM) return;

    let existing = existingItemId ? game.items.get(existingItemId) : null;
    // Also check compendium if not found in world items
    if (existingItemId && !existing) {
        const pack = game.packs.get("wita.wita-items");
        if (pack) existing = await pack.getDocument(existingItemId).catch(() => null);
    }
    const ef      = existing?.getFlag?.("wita", "customFacility") ?? {};
    const engData = getEngineeringData();
    const ec      = engData.facilities?.[existingItemId] ?? { gpOnly: 1000, gpWithMaterials: 400, materials: [] };

    const sizeOptions = WITA_SIZES.map(s =>
        `<option value="${s}" ${(ef.size ?? "cramped") === s ? "selected" : ""}>${WITA_SIZE_LABEL[s]}</option>`
    ).join("");

    const orderOptions = WITA_ORDERS.map(o =>
        `<option value="${o}" ${(ef.order ?? "") === o ? "selected" : ""}>${WITA_ORDER_LABEL[o]}</option>`
    ).join("");

    const content = `
        <div style="display:flex;flex-direction:column;gap:0.5rem;padding:0.25rem;font-family:var(--font-primary)">

            <label style="display:flex;flex-direction:column;gap:0.15rem;font-size:0.75rem;font-weight:600">
                Name <input type="text" name="name" value="${sanitizeHTML(existing?.name ?? "")}" placeholder="e.g. Brewery" required
                      style="font-size:0.8rem;padding:0.2rem 0.35rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
            </label>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem">
                <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                    Type <select name="type" style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                        <option value="basic"   ${(ef.type ?? "special") === "basic"   ? "selected" : ""}>Basic</option>
                        <option value="special" ${(ef.type ?? "special") === "special" ? "selected" : ""}>Special</option>
                    </select>
                </label>
                <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                    Subtype <input type="text" name="subtype" value="${sanitizeHTML(ef.subtype ?? "")}" placeholder="e.g. brewery"
                             style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                </label>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem">
                <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                    Size <select name="size" style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                        ${sizeOptions}
                    </select>
                </label>
                <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                    Level Req <input type="number" name="level" value="${ef.level ?? 5}" min="1" max="20"
                              style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                </label>
            </div>

            <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                Order <select name="order" style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                    ${orderOptions}
                </select>
            </label>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem">
                <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                    Hirelings <input type="number" name="hirelings" value="${ef.hirelings ?? 1}" min="0" max="20"
                              style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                </label>
                <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                    Defenders <input type="number" name="defenders" value="${ef.defenders ?? 0}" min="0" max="50"
                              style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                </label>
            </div>

            <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                Prerequisite <input type="text" name="prereq" value="${sanitizeHTML(ef.prereq ?? "None")}" placeholder="e.g. Proficiency in Brewer's Supplies"
                             style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
            </label>

            <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.75rem;font-weight:600;cursor:pointer">
                <input type="checkbox" name="enlargeable" ${ef.enlargeable ? "checked" : ""}> Enlargeable (Roomy → Vast)
            </label>

            <div id="wita-enlarge-fields" style="display:${ef.enlargeable ? "grid" : "none"};grid-template-columns:1fr 1fr;gap:0.4rem">
                <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                    +Hirelings on Enlarge <input type="number" name="enlargeHirelings" value="${ef.enlargeHirelings ?? 0}" min="0"
                                          style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                </label>
                <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                    Defenders after Enlarge <input type="number" name="enlargeDefenders" value="${ef.enlargeDefenders ?? 0}" min="0"
                                            style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                </label>
            </div>

            <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                Description <textarea name="description" rows="3" placeholder="Flavour text and mechanical effects…"
                             style="font-size:0.75rem;padding:0.2rem 0.35rem;border:1px solid var(--color-fieldset-border);border-radius:3px;resize:vertical">${sanitizeHTML(ef.description ?? "")}</textarea>
            </label>

            <div style="border-top:1px solid var(--color-fieldset-border);margin-top:0.25rem;padding-top:0.4rem">
                <div style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--color-form-hint);margin-bottom:0.35rem">Construction Costs</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem">
                    <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                        GP Only <input type="number" name="gpOnly" value="${ec.gpOnly ?? 1000}" min="0"
                                 style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                    </label>
                    <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                        GP with Materials <input type="number" name="gpWithMaterials" value="${ec.gpWithMaterials ?? 400}" min="0"
                                          style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                    </label>
                </div>
                <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600;margin-top:0.35rem">
                    Materials <input type="text" name="materialsLabel" value="${sanitizeHTML((ec.materials ?? []).map(m => m.qty + '×' + m.name).join(', '))}"
                               placeholder="e.g. 50× Stone, 20× Timber"
                               style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                    <span style="font-size:0.65rem;color:var(--color-form-hint)">Format: qty× Name, qty× Name</span>
                </label>
            </div>
        </div>
    `;

    const dlg = new Dialog({
        title:   existingItemId ? `Edit Facility — ${existing?.name}` : "Create Custom Facility",
        content,
        default: "ok",
        buttons: {
            ok: {
                label: existingItemId ? "Save Changes" : "Create",
                callback: async html => {
                    const f = html instanceof jQuery ? html[0] : html;
                    // Parse materials from "qty× Name, qty× Name" format
                    const matStr = f.querySelector("[name=materialsLabel]")?.value.trim() ?? "";
                    const materials = matStr ? matStr.split(",").map(s => {
                        const m = s.trim().match(/^(\d+)[×x]\s*(.+)$/);
                        return m ? { qty: parseInt(m[1]), name: m[2].trim() } : null;
                    }).filter(Boolean) : [];

                    const opts = {
                        name:             f.querySelector("[name=name]").value.trim(),
                        subtype:          f.querySelector("[name=subtype]").value.trim(),
                        type:             f.querySelector("[name=type]").value,
                        size:             f.querySelector("[name=size]").value,
                        level:            parseInt(f.querySelector("[name=level]").value) || 5,
                        order:            f.querySelector("[name=order]").value,
                        hirelings:        parseInt(f.querySelector("[name=hirelings]").value) || 0,
                        defenders:        parseInt(f.querySelector("[name=defenders]").value) || 0,
                        prereq:           f.querySelector("[name=prereq]").value.trim(),
                        enlargeable:      f.querySelector("[name=enlargeable]").checked,
                        enlargeHirelings: parseInt(f.querySelector("[name=enlargeHirelings]").value) || 0,
                        enlargeDefenders: parseInt(f.querySelector("[name=enlargeDefenders]").value) || 0,
                        description:      f.querySelector("[name=description]").value.trim(),
                        img:              existing?.img ?? "icons/svg/castle.svg",
                        gpOnly:           parseInt(f.querySelector("[name=gpOnly]").value) || 1000,
                        gpWithMaterials:  parseInt(f.querySelector("[name=gpWithMaterials]").value) || 400,
                        materials,
                    };

                    if (!opts.name) { ui.notifications.warn("WITA | Name is required."); return; }

                    if (existingItemId) {
                        // Update existing item flags
                        const flagData = { ...opts };
                        await existing.update({
                            name:   opts.name,
                            img:    opts.img,
                            system: {
                                description: { value: `<p>${opts.description}</p>` },
                                type:   { value: opts.type, subtype: opts.subtype },
                                size:   opts.size,
                                level:  opts.level,
                                order:  opts.order,
                                hirelings: { value: [], max: opts.hirelings || null },
                                defenders: { value: [], max: opts.defenders || null },
                            },
                            flags: { wita: { customFacility: flagData } },
                        });
                        // Update cost record
                        const ed = getEngineeringData();
                        ed.facilities = ed.facilities ?? {};
                        ed.facilities[existingItemId] = {
                            ...(ed.facilities[existingItemId] ?? {}),
                            name:            opts.name,
                            gpOnly:          opts.gpOnly,
                            gpWithMaterials: opts.gpWithMaterials,
                            materials:       opts.materials,
                        };
                        await saveEngineeringData(ed);
                        await syncVendorPrices();
                        ui.notifications.info(`WITA | "${opts.name}" updated.`);
                    } else {
                        const newItem = await createCustomFacility(opts);
                        if (newItem) {
                            await _addFacilityToStock(newItem.uuid);
                            // Override default cost with user-specified values
                            const ed = getEngineeringData();
                            const nid = newItem.id;
                            if (ed.facilities?.[nid]) {
                                ed.facilities[nid].gpOnly          = opts.gpOnly;
                                ed.facilities[nid].gpWithMaterials = opts.gpWithMaterials;
                                ed.facilities[nid].materials       = opts.materials;
                                await saveEngineeringData(ed);
                            }
                        }
                    }

                    _refreshPanel();
                },
            },
            cancel: { label: "Cancel" },
        },
    });

    dlg.render(true);

    // Wire enlargeable toggle.
    Hooks.once("renderDialog", (app, html) => {
        if (app !== dlg) return;
        const cb     = (html instanceof jQuery ? html[0] : html).querySelector("[name=enlargeable]");
        const fields = (html instanceof jQuery ? html[0] : html).querySelector("#wita-enlarge-fields");
        if (cb && fields) {
            cb.addEventListener("change", () => {
                fields.style.display = cb.checked ? "grid" : "none";
            });
        }
    });
}

// ── Material helpers ──────────────────────────────────────────

function _checkMaterials(actor, materials) {
    return materials.filter(req => {
        const held = actor.items
            .filter(i => i.name.toLowerCase() === req.name.toLowerCase())
            .reduce((s, i) => s + (i.system?.quantity ?? 1), 0);
        return held < req.qty;
    }).map(req => {
        const held = actor.items
            .filter(i => i.name.toLowerCase() === req.name.toLowerCase())
            .reduce((s, i) => s + (i.system?.quantity ?? 1), 0);
        return { name: req.name, qty: req.qty - held };
    });
}

async function _consumeMaterials(actor, materials) {
    for (const req of materials) {
        let remaining = req.qty;
        const items = actor.items
            .filter(i => i.name.toLowerCase() === req.name.toLowerCase())
            .sort((a, b) => (a.system?.quantity ?? 1) - (b.system?.quantity ?? 1));
        for (const item of items) {
            if (remaining <= 0) break;
            const qty  = item.system?.quantity ?? 1;
            const take = Math.min(qty, remaining);
            remaining -= take;
            if (qty - take <= 0) await item.delete();
            else await item.update({ "system.quantity": qty - take });
        }
    }
}

async function _refundMaterials(actor, materials) {
    for (const req of materials) {
        const existing = actor.items.find(i => i.name.toLowerCase() === req.name.toLowerCase());
        if (existing) await existing.update({ "system.quantity": (existing.system?.quantity ?? 0) + req.qty });
        else await actor.createEmbeddedDocuments("Item", [{
            name: sanitizeHTML(req.name), type: "loot",
            system: { quantity: req.qty },
        }]);
    }
}

function _refreshPanel() {
    const panel = foundry.applications.instances.get("wita-bastion-panel");
    if (panel?.rendered) panel.render(true);
}

// ── Bastion meta-item seeding ─────────────────────────────────

const WITA_BASTION_META_ITEMS = [
    {
        name:        "Bastion Expansion — Tier I",
        img:         "icons/environment/wilderness/arch-stone.webp",
        description: "Expands the bastion to Tier I, unlocking Cramped facilities.",
        metaKey:     "tierUpgrade1",
        category:    "tierUpgrade",
        tier:        1,
    },
    {
        name:        "Bastion Expansion — Tier II",
        img:         "icons/environment/wilderness/arch-stone.webp",
        description: "Expands the bastion to Tier II, unlocking Roomy facilities.",
        metaKey:     "tierUpgrade2",
        category:    "tierUpgrade",
        tier:        2,
    },
    {
        name:        "Bastion Expansion — Tier III",
        img:         "icons/environment/wilderness/arch-stone.webp",
        description: "Expands the bastion to Tier III, unlocking Vast facilities.",
        metaKey:     "tierUpgrade3",
        category:    "tierUpgrade",
        tier:        3,
    },
    {
        name:        "Add Basic Facility Slot",
        img:         "icons/environment/settlement/house-simple.webp",
        description: "Adds one new Basic Facility slot to the bastion.",
        metaKey:     "basicSlot",
        category:    "slotExpansion",
        facilityType:"basic",
    },
    {
        name:        "Add Special Facility Slot",
        img:         "icons/environment/settlement/castle.webp",
        description: "Adds one new Special Facility slot to the bastion.",
        metaKey:     "specialSlot",
        category:    "slotExpansion",
        facilityType:"special",
    },
    {
        name:        "Enlarge Facility",
        img:         "icons/environment/settlement/tower-stone.webp",
        description: "Enlarges an eligible facility up one size (Cramped → Roomy, or Roomy → Vast), increasing its capacity and productivity cap. Requires an available size slot license.",
        metaKey:     "enlarge",
        category:    "enlargement",
    },
    {
        name:        "Roomy Slot License",
        img:         "icons/environment/settlement/house-simple.webp",
        description: "Grants one additional Roomy size slot, allowing one more facility to be enlarged to Roomy beyond the tier default.",
        metaKey:     "roomyLicense",
        category:    "sizeLicense",
        sizeType:    "roomy",
    },
    {
        name:        "Vast Slot License",
        img:         "icons/environment/settlement/castle.webp",
        description: "Grants one additional Vast size slot, allowing one more facility to be enlarged to Vast beyond the tier default.",
        metaKey:     "vastLicense",
        category:    "sizeLicense",
        sizeType:    "vast",
    },
];

/**
 * Seeds the wita.wita-items compendium with Bastion meta-items
 * if they don't already exist. Called from createEngineerVendor.
 * Safe to call multiple times — skips existing items.
 */
export async function seedBastionMetaItems() {
    if (!game.user.isGM) return;

    const pack = game.packs.get("wita.wita-items");
    if (!pack) {
        console.warn("WITA | wita.wita-items compendium not found, skipping meta-item seeding.");
        return;
    }

    const index = await pack.getIndex();
    const toCreate = [];

    for (const meta of WITA_BASTION_META_ITEMS) {
        const exists = index.find(i => i.name === meta.name);
        if (exists) continue;

        toCreate.push({
            name:  meta.name,
            type:  "loot",
            img:   meta.img,
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
                    bastionMetaItem:  true,
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
