// ============================================================
// WITA — COMPENDIUM ORGANIZER
// Organises wita.wita-items into Rarity → Kit folder hierarchy.
// Call once from the FoundryVTT console:
//   await game.wita.organizeRecipeCompendium()
// ============================================================
import { WITA_RECIPE_META } from "./potion-data.js";

const PACK_ID = "wita.wita-items";

const RARITY_ORDER = ["common", "uncommon", "rare", "veryRare", "legendary", "artifact"];
const RARITY_LABEL = {
    common:   "Common",
    uncommon: "Uncommon",
    rare:     "Rare",
    veryRare: "Very Rare",
    legendary:"Legendary",
    artifact: "Artifact",
};

const KIT_ORDER = ["alchemist", "herbalism", "poisoner"];
const KIT_LABEL = {
    alchemist: "Alchemy",
    herbalism: "Herbalism",
    poisoner:  "Poison",
};

export async function organizeRecipeCompendium() {
    if (!game.user.isGM) { ui.notifications.warn("GM only."); return; }

    const pack = game.packs.get(PACK_ID);
    if (!pack) { ui.notifications.error(`WITA | Pack "${PACK_ID}" not found.`); return; }

    const wasLocked = pack.locked;
    if (wasLocked) await pack.configure({ locked: false });

    ui.notifications.info("WITA | Loading compendium items…");
    const docs = await pack.getDocuments();

    // Map each known recipe doc to its rarity + kit
    const itemMeta = {};   // docId → { rarity, kit }
    const neededGroups = new Set();  // "rarity/kit"

    for (const doc of docs) {
        const meta = WITA_RECIPE_META[doc.name];
        if (!meta || !RARITY_LABEL[meta.rarity] || !KIT_LABEL[meta.kit]) continue;
        itemMeta[doc.id] = { rarity: meta.rarity, kit: meta.kit };
        neededGroups.add(`${meta.rarity}/${meta.kit}`);
    }

    const raritiesNeeded = [...new Set(Object.values(itemMeta).map(v => v.rarity))]
        .sort((a, b) => RARITY_ORDER.indexOf(a) - RARITY_ORDER.indexOf(b));

    // ── Create / find rarity root folders ────────────────────
    const rarityFolders = {};
    for (let i = 0; i < raritiesNeeded.length; i++) {
        const rarity = raritiesNeeded[i];
        const label  = RARITY_LABEL[rarity];
        let folder   = pack.folders.find(f => f.name === label && !f.folder);
        if (!folder) {
            folder = await Folder.create(
                { name: label, type: "Item", folder: null, sort: i * 1000 },
                { pack: PACK_ID }
            );
        }
        rarityFolders[rarity] = folder;
    }

    // ── Create / find kit subfolders ──────────────────────────
    const kitFolders = {};
    for (const key of neededGroups) {
        const [rarity, kit] = key.split("/");
        const parentFolder  = rarityFolders[rarity];
        const parentId      = parentFolder.id;
        const label         = KIT_LABEL[kit];
        const sortIdx       = KIT_ORDER.indexOf(kit);
        let folder          = pack.folders.find(f =>
            f.name === label && (f.folder?.id ?? f.folder) === parentId
        );
        if (!folder) {
            folder = await Folder.create(
                { name: label, type: "Item", folder: parentId, sort: sortIdx * 100 },
                { pack: PACK_ID }
            );
        }
        kitFolders[key] = folder;
    }

    // ── Move items into their folders ─────────────────────────
    let moved = 0;
    for (const doc of docs) {
        const meta = itemMeta[doc.id];
        if (!meta) continue;
        const folder = kitFolders[`${meta.rarity}/${meta.kit}`];
        if (!folder) continue;
        if (doc.folder?.id === folder.id) continue;
        await doc.update({ folder: folder.id });
        moved++;
    }

    if (wasLocked) await pack.configure({ locked: true });
    ui.notifications.info(`WITA | Done — moved ${moved} item${moved !== 1 ? "s" : ""} into rarity/kit folders.`);
    console.log(`WITA | organizeRecipeCompendium complete. ${moved} items moved.`);
}
