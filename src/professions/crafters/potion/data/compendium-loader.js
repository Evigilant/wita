// ============================================================
// WITA — COMPENDIUM LOADER
// Loads and caches ingredient + recipe items from the upstream
// "potion-crafting-and-gathering" module packs.
// Resolves by name — no hardcoded IDs required.
// ============================================================
import {
    WITA_DEP_MODULE_ID, WITA_DEP_PACKS,
    WITA_INGREDIENT_META, WITA_RECIPE_META, WITA_RECIPE_INGREDIENTS,
} from "./potion-data.js";
import { WITA_POTION_CRAFTING_RULES } from "./potion-config.js";

export class WITACompendiumLoader {
    static #ingredientCache = null;
    static #recipeCache     = null;

    static isDepReady() {
        return game.modules.get(WITA_DEP_MODULE_ID)?.active === true;
    }

    static async loadIngredients() {
        if (WITACompendiumLoader.#ingredientCache) return WITACompendiumLoader.#ingredientCache;

        const pack = game.packs.get(WITA_DEP_PACKS.ingredients);
        if (!pack) {
            ui.notifications.error("WITA Potion Brewing: Cannot find 'potion-crafting-and-gathering' ingredients pack. Is the module installed and active?");
            return [];
        }

        const docs = await pack.getDocuments();
        WITACompendiumLoader.#ingredientCache = docs
            .map(doc => {
                const meta = WITA_INGREDIENT_META[doc.name];
                if (!meta) return null;
                return {
                    _id:          doc._id,
                    name:         doc.name,
                    img:          doc.img,
                    uuid:         doc.uuid,
                    description:  doc.system?.description?.value ?? "",
                    price:        doc.system?.price?.value ?? 5,
                    gatherRarity: meta.gatherRarity,
                    gatherDC:     meta.gatherDC,
                    harvestDC:    meta.harvestDC,
                    quantity:     meta.quantity,
                    locations:    meta.locations,
                };
            })
            .filter(Boolean)
            .sort((a, b) => {
                const o = { common:0, uncommon:1, rare:2, veryRare:3, legendary:4 };
                return (o[a.gatherRarity] ?? 9) - (o[b.gatherRarity] ?? 9) || a.name.localeCompare(b.name);
            });

        return WITACompendiumLoader.#ingredientCache;
    }

    static async loadRecipes() {
        if (WITACompendiumLoader.#recipeCache) return WITACompendiumLoader.#recipeCache;

        const packKeys = [WITA_DEP_PACKS.alchemy, WITA_DEP_PACKS.herbalism, WITA_DEP_PACKS.poisons];
        const allDocs  = [];
        for (const key of packKeys) {
            const pack = game.packs.get(key);
            if (!pack) { console.warn(`WITA | Potion pack not found: ${key}`); continue; }
            allDocs.push(...await pack.getDocuments());
        }

        const pv = { common:50, uncommon:200, rare:1000, veryRare:2000 };
        WITACompendiumLoader.#recipeCache = allDocs
            .map(doc => {
                const meta = WITA_RECIPE_META[doc.name];
                if (!meta) return null;
                const scFlags = doc.flags?.["sc-the-cauldron"] ?? {};
                return {
                    _id:         doc._id,
                    name:        doc.name,
                    img:         doc.img,
                    uuid:        doc.uuid,
                    description: doc.system?.description?.value ?? "",
                    value:       doc.system?.price?.value ?? pv[meta.rarity] ?? 50,
                    kit:         meta.kit,
                    rarity:      meta.rarity,
                    dc:          WITA_POTION_CRAFTING_RULES[meta.rarity]?.dc ?? 8,
                    workHours:   WITA_POTION_CRAFTING_RULES[meta.rarity]?.workHours ?? 8,
                    baseCost:    WITA_POTION_CRAFTING_RULES[meta.rarity]?.baseCost ?? 25,
                    ingredients: WITA_RECIPE_INGREDIENTS[doc.name] ?? [],
                    scFlags,
                };
            })
            .filter(Boolean)
            .sort((a, b) => {
                const kitO = { alchemist:0, herbalism:1, poisoner:2 };
                const rarO = { common:0, uncommon:1, rare:2, veryRare:3 };
                return (kitO[a.kit] ?? 9) - (kitO[b.kit] ?? 9)
                    || (rarO[a.rarity] ?? 9) - (rarO[b.rarity] ?? 9)
                    || a.name.localeCompare(b.name);
            });

        return WITACompendiumLoader.#recipeCache;
    }

    static clearCaches() {
        WITACompendiumLoader.#ingredientCache = null;
        WITACompendiumLoader.#recipeCache     = null;
    }
}
