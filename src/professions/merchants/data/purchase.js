// ============================================================
// WITA — ENGINEER PURCHASE HANDLER
// Item Piles purchase interception, sub-handlers for all
// engineer item categories, material check/consume/refund.
// ============================================================
import { sanitizeHTML, witaSetting }          from "../../../core/utils.js";
import { getBastionData, saveBastionData,
         getAllFacilities, WITA_TIER_LABEL }  from "../../../bastion/data/data.js";
import { assignFacilityToSlot, enlargeSlot,
         setBastionTier, addSlot,
         getSizeLimits,
         validateFacilityDrop }               from "../../../bastion/data/slots.js";
import { getFacilityCost, getMetaCost }       from "./costs.js";
import { _refreshPanel }                      from "./vendor.js";

const DMG_PACK        = "dnd-dungeon-masters-guide.bastions";
const DEFAULT_GP_ONLY = 1000;

// ── Main purchase router ──────────────────────────────────────

export async function handleEngineerPurchase({ seller, buyer, item, quantity, userId }) {
    if (game.user.id !== userId) return false;

    const wf = item.flags?.wita ?? {};

    switch (wf.engineerCategory) {
        case "tierUpgrade":   return _handleTierUpgrade(wf, buyer);
        case "slotExpansion": return _handleSlotExpansion(wf, buyer);
        case "enlargement":   return _handleEnlargement(wf, buyer);
        case "sizeLicense":   return _handleSizeLicense(wf, buyer);
        case "facility":      return _handleFacilityPurchase(item, wf, buyer);
        default:
            ui.notifications.warn(`WITA | Unknown engineer category: ${wf.engineerCategory}`);
            return false;
    }
}

// ── Sub-handlers ──────────────────────────────────────────────

async function _handleTierUpgrade(wf, buyer) {
    const data    = getBastionData();
    const curTier = data.bastionTier ?? 0;
    const newTier = parseInt(wf.tier);

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

    await setBastionTier(newTier);
    ui.notifications.info(`WITA | Bastion upgraded to ${WITA_TIER_LABEL[newTier]}!`);
    _refreshPanel();
    return false;
}

async function _handleSlotExpansion(wf, buyer) {
    const fType = wf.facilityType;
    const label = fType === "basic" ? "Basic" : "Special";
    await addSlot(fType);
    ui.notifications.info(`WITA | New ${label} facility slot added.`);
    _refreshPanel();
    return false;
}

async function _handleSizeLicense(wf, buyer) {
    const sizeType = wf.sizeType;
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
    const data = getBastionData();
    const cost = getMetaCost("enlarge");

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
        if (cost?.gpOnly) await game.itempiles.API.addCurrencies(buyer, `${cost.gpOnly}gp`);
        return false;
    }

    await enlargeSlot(choice);
    _refreshPanel();
    return false;
}

async function _handleFacilityPurchase(item, wf, buyer) {
    const itemId    = wf.engineerItemId;
    const gpOnly    = wf.gpOnly         ?? DEFAULT_GP_ONLY;
    const gpMats    = wf.gpWithMaterials ?? 400;
    const materials = wf.materials       ?? [];
    const hasMats   = materials.length > 0;
    const name      = sanitizeHTML(item.name);

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
            await game.itempiles.API.addCurrencies(buyer, `${gpOnly}gp`);
            return false;
        }
        await _consumeMaterials(partyActor, materials);
        const refund = gpOnly - gpMats;
        if (refund > 0) await game.itempiles.API.addCurrencies(buyer, `${refund}gp`);
    }

    await _openSlotDialog(itemId, item, meta);
    return false;
}

// ── Slot assignment dialog ────────────────────────────────────

async function _openSlotDialog(facilityItemId, item, meta) {
    const data    = getBastionData();
    const poolKey = meta?.type === "basic" ? "basicSlots" : "specialSlots";
    const empty   = (data[poolKey] ?? []).filter(s => !s.facilityUuid);

    if (!empty.length) {
        ui.notifications.warn(`WITA | No empty ${meta?.type ?? ""} slots. Add a slot first.`);
        return;
    }

    const slots   = data[poolKey] ?? [];
    const options = empty.map(s =>
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

export async function _refundMaterials(actor, materials) {
    for (const req of materials) {
        const existing = actor.items.find(i => i.name.toLowerCase() === req.name.toLowerCase());
        if (existing) await existing.update({ "system.quantity": (existing.system?.quantity ?? 0) + req.qty });
        else await actor.createEmbeddedDocuments("Item", [{
            name: sanitizeHTML(req.name), type: "loot",
            system: { quantity: req.qty },
        }]);
    }
}
