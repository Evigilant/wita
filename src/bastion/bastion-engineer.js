// ============================================================
// WITA — BASTION ENGINEER
// Vendor creation, cost management, purchase interception,
// slot/enlargement dialogs, custom facility creator.
// ============================================================

import { sanitizeHTML, witaSetting }          from "../core/utils.js";
import { getBastionData, saveBastionData,
         getEngineeringData, saveEngineeringData,
         getAllFacilities, WITA_DMG_FACILITIES,
         WITA_TIER_SIZES, WITA_TIER_LABEL,
         createCustomFacility, deleteCustomFacility,
         WITA_SIZES, WITA_ORDERS,
         WITA_SIZE_LABEL, WITA_ORDER_LABEL }  from "./bastion-data.js";
import { assignFacilityToSlot, enlargeSlot,
         setBastionTier, addSlot,
         validateFacilityDrop }               from "./bastion-slots.js";

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

// Meta-items (tier upgrades, slot expansions, enlargements)
export function getMetaCost(key) {
    const data = getEngineeringData();
    const defaults = {
        tierUpgrade1: { gpOnly: 5000,  gpWithMaterials: 2000, materials: [] },
        tierUpgrade2: { gpOnly: 15000, gpWithMaterials: 6000, materials: [] },
        tierUpgrade3: { gpOnly: 40000, gpWithMaterials: 15000, materials: [] },
        basicSlot:    { gpOnly: 500,   gpWithMaterials: 200,  materials: [] },
        specialSlot:  { gpOnly: 2000,  gpWithMaterials: 800,  materials: [] },
        enlarge:      { gpOnly: 2000,  gpWithMaterials: 800,  materials: [] },
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

    // Build all vendor items.
    const itemsToCreate = [];

    // Category A: Tier upgrades
    for (const [tier, label] of [[1, "Tier I — Cramped"], [2, "Tier II — Roomy"], [3, "Tier III — Vast"]]) {
        const key  = `tierUpgrade${tier}`;
        const cost = getMetaCost(key);
        itemsToCreate.push(_metaVendorItem(`Bastion Expansion — ${label}`, cost.gpOnly, key, "tierUpgrade", {
            tier,
            description: `Unlocks ${WITA_SIZE_LABEL[WITA_TIER_SIZES[tier].at(-1)]} facilities for the bastion.`,
        }));
    }

    // Category B: Slot expansions
    for (const [label, key, fType] of [
        ["Add Basic Facility Slot",   "basicSlot",   "basic"],
        ["Add Special Facility Slot", "specialSlot", "special"],
    ]) {
        const cost = getMetaCost(key);
        itemsToCreate.push(_metaVendorItem(label, cost.gpOnly, key, "slotExpansion", { facilityType: fType }));
    }

    // Category C: Enlargement
    {
        const cost = getMetaCost("enlarge");
        itemsToCreate.push(_metaVendorItem("Enlarge Facility (Roomy → Vast)", cost.gpOnly, "enlarge", "enlargement", {}));
    }

    // Category D: DMG facilities
    const pack = game.packs.get(DMG_PACK);
    if (pack) {
        const docs = await pack.getDocuments();
        for (const facilityItem of docs) {
            itemsToCreate.push(_facilityVendorItem(facilityItem));
        }
    }

    // Category E: Custom facilities already created
    for (const item of game.items) {
        if (item.getFlag?.("wita", "customFacility")) {
            itemsToCreate.push(_facilityVendorItem(item));
        }
    }

    await actor.createEmbeddedDocuments("Item", itemsToCreate);

    engData.vendorActorId = actor.id;
    await saveEngineeringData(engData);

    await game.itempiles.API.makeItemPileMerchant?.(actor)
        ?? await game.itempiles.API.turnTokenIntoItemPile?.(actor.getActiveTokens()?.[0] ?? actor);

    ui.notifications.info("WITA | Engineer vendor created.");
    actor.sheet.render(true);
}

function _metaVendorItem(name, gpOnly, metaKey, category, extraFlags) {
    return {
        name,
        type: "loot",
        img:  "icons/svg/castle.svg",
        system: { quantity: 99, price: { value: gpOnly, denomination: "gp" } },
        flags: {
            "item-piles": {
                item: {
                    price:    gpOnly,
                    quantity: 99,
                    macro:    "Compendium.wita.wita-macros.Macro.witaEngineerPurchase",
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
    return foundry.utils.mergeObject(facilityItem.toObject?.() ?? {}, {
        system: { quantity: 99, price: { value: cost.gpOnly, denomination: "gp" } },
        flags: {
            "item-piles": { item: {
                price:    cost.gpOnly,
                quantity: 99,
                macro:    "Compendium.wita.wita-macros.Macro.witaEngineerPurchase",
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

// ── Sync vendor prices ────────────────────────────────────────

export async function syncVendorPrices() {
    if (!game.user.isGM) return;
    const engData = getEngineeringData();
    const vendor  = engData.vendorActorId ? game.actors.get(engData.vendorActorId) : null;
    if (!vendor) return;

    const updates = [];
    for (const item of vendor.items) {
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
            });
        } else if (wf.engineerCategory && wf.engineerMetaKey) {
            const cost = getMetaCost(wf.engineerMetaKey);
            updates.push({
                _id:                           item.id,
                "flags.wita.gpOnly":           cost.gpOnly,
                "flags.item-piles.item.price": cost.gpOnly,
                "system.price.value":          cost.gpOnly,
            });
        }
    }

    if (updates.length) {
        await vendor.updateEmbeddedDocuments("Item", updates);
        console.log(`WITA | Synced ${updates.length} vendor prices.`);
    }
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
    const newTier   = wf.tier;
    const cost      = getMetaCost(wf.engineerMetaKey);

    if (newTier !== curTier + 1) {
        ui.notifications.warn(`WITA | Must purchase Tier ${curTier + 1} before Tier ${newTier}.`);
        return false;
    }

    const confirmed = await Dialog.confirm({
        title:   `Bastion Expansion — ${WITA_TIER_LABEL[newTier]}`,
        content: `<p>Upgrade bastion to <strong>${WITA_TIER_LABEL[newTier]}</strong> for <strong>${cost.gpOnly.toLocaleString()} GP</strong>?</p>`,
    });
    if (!confirmed) return false;

    const gpResult = await game.itempiles.API.removeCurrencies(buyer, `${cost.gpOnly}gp`);
    if (!gpResult) { ui.notifications.error("WITA | Could not charge GP."); return false; }

    await setBastionTier(newTier);
    ui.notifications.info(`WITA | Bastion upgraded to ${WITA_TIER_LABEL[newTier]}!`);
    _refreshPanel();
    return false;
}

async function _handleSlotExpansion(wf, buyer) {
    const fType = wf.facilityType;
    const cost  = getMetaCost(wf.engineerMetaKey);
    const label = fType === "basic" ? "Basic" : "Special";

    const confirmed = await Dialog.confirm({
        title:   `Add ${label} Facility Slot`,
        content: `<p>Add a new ${label} facility slot for <strong>${cost.gpOnly.toLocaleString()} GP</strong>?</p>`,
    });
    if (!confirmed) return false;

    const gpResult = await game.itempiles.API.removeCurrencies(buyer, `${cost.gpOnly}gp`);
    if (!gpResult) { ui.notifications.error("WITA | Could not charge GP."); return false; }

    await addSlot(fType);
    ui.notifications.info(`WITA | New ${label} facility slot added.`);
    _refreshPanel();
    return false;
}

async function _handleEnlargement(wf, buyer) {
    const data    = getBastionData();
    const cost    = getMetaCost("enlarge");
    const allFac  = getAllFacilities();

    // Only Roomy enlargeable facilities qualify.
    const eligible = [...data.specialSlots ?? []]
        .filter(s => s.facilityUuid && s.facilitySize === "roomy" && allFac[s.facilityItemId]?.enlargeable);

    if (!eligible.length) {
        ui.notifications.warn("WITA | No enlargeable Roomy facilities currently in the bastion.");
        return false;
    }

    const options = eligible.map(s =>
        `<option value="${s.id}">${sanitizeHTML(s.facilityName ?? "Unknown")}</option>`
    ).join("");

    const choice = await new Promise(resolve => {
        new Dialog({
            title:   "Enlarge Facility",
            content: `
                <p>Select the facility to enlarge to Vast for <strong>${cost.gpOnly.toLocaleString()} GP</strong>:</p>
                <select name="slotId" style="width:100%;margin-top:0.4rem">${options}</select>
            `,
            buttons: {
                ok:     { label: "Enlarge", callback: html => resolve(html[0].querySelector("[name=slotId]").value) },
                cancel: { label: "Cancel",  callback: () => resolve(null) },
            },
            close: () => resolve(null),
        }).render(true);
    });

    if (!choice) return false;

    const gpResult = await game.itempiles.API.removeCurrencies(buyer, `${cost.gpOnly}gp`);
    if (!gpResult) { ui.notifications.error("WITA | Could not charge GP."); return false; }

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
    const tierErr = meta ? validateFacilityDrop(data, meta) : null;
    if (tierErr) { ui.notifications.warn(`WITA | ${tierErr}`); return false; }

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
                ok:     { label: "Commission", callback: html => resolve(html[0].querySelector("input[name=pt]:checked")?.value ?? "gpOnly") },
                cancel: { label: "Cancel",     callback: () => resolve(null) },
            },
            close: () => resolve(null),
        }).render(true);
    });

    if (!choice) return false;

    const gpCost     = choice === "gpMats" ? gpMats : gpOnly;
    const useMats    = choice === "gpMats" && hasMats;
    const partyActor = game.actors.get(witaSetting("partyActorId"));

    if (useMats) {
        if (!partyActor) { ui.notifications.error("WITA | Party actor not configured."); return false; }
        const missing = _checkMaterials(partyActor, materials);
        if (missing.length) {
            ui.notifications.warn(`WITA | Missing: ${missing.map(m => `${m.qty}× ${m.name}`).join(", ")}`);
            return false;
        }
        await _consumeMaterials(partyActor, materials);
    }

    const gpResult = await game.itempiles.API.removeCurrencies(buyer, `${gpCost}gp`);
    if (!gpResult) {
        if (useMats) await _refundMaterials(partyActor, materials);
        ui.notifications.error(`WITA | Could not charge ${gpCost} GP.`);
        return false;
    }

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
                        const slotId = html[0].querySelector("[name=slotId]").value;
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

    const existing = existingItemId ? game.items.get(existingItemId) : null;
    const ef       = existing?.getFlag("wita", "customFacility") ?? {};

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
                    const f = html[0];
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
                    };

                    if (!opts.name) { ui.notifications.warn("WITA | Name is required."); return; }

                    if (existingItemId) {
                        // Update existing item.
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
                        await syncVendorPrices();
                        ui.notifications.info(`WITA | "${opts.name}" updated.`);
                    } else {
                        const newItem = await createCustomFacility(opts);
                        if (newItem) await addCustomFacilityToVendor(newItem);
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
        const cb     = (html[0] ?? html).querySelector("[name=enlargeable]");
        const fields = (html[0] ?? html).querySelector("#wita-enlarge-fields");
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
