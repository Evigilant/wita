// ============================================================
// WITA — ENGINEER COSTS
// Cost getters/setters for facilities and meta-items.
// ============================================================
import { getEngineeringData, saveEngineeringData } from "../../../bastion/data/data.js";

const DEFAULT_GP_ONLY = 1000;
const DEFAULT_GP_MATS = 400;

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
        defaults[key] ?? { gpOnly: DEFAULT_GP_ONLY, gpWithMaterials: DEFAULT_GP_MATS, materials: [] },
        data.metaItems?.[key] ?? {}
    );
}

export async function setMetaCost(key, cost) {
    if (!game.user.isGM) return;
    const data = getEngineeringData();
    data.metaItems       = data.metaItems ?? {};
    data.metaItems[key]  = cost;
    await saveEngineeringData(data);
}
