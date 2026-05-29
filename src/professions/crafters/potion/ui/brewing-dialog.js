// ============================================================
// WITA — POTION BREWING DIALOG
// Recipe selection with craft roll, then hands off to SC Cauldron
// for ingredient assembly and delivery on success.
// EXP awarded via sc-the-cauldron.recipeCrafted hook.
// Recipe learning managed entirely by SC Cauldron.
// Ingredient stock read from actor inventory only (no flags).
// ============================================================
import { WITACompendiumLoader } from "../data/compendium-loader.js";
import { witaFindIngredientBag } from "./gathering-dialog.js";
import {
    WITA_POTION_CRAFTING,
    WITA_RARITY_LEVEL_GATES,
    WITA_POTION_CRAFTING_RULES,
} from "../data/potion-config.js";
import { getRecipeMaterialCost, getIngredientCost } from "../data/potion-data.js";

// TODO(v14): migrate to ApplicationV2
export class WITABrewingDialog extends Application {
    static _scFlagLogged = false;

    constructor(actor, options = {}) {
        super(options);
        this.actor          = actor;
        this.selectedKit    = "alchemist";
        this.selectedRecipe = null;
        this._allRecipes    = [];
        this._ingredients   = [];
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "wita-brewing-dialog",
            title: "Crafting",
            template: `modules/wita/templates/potion/brewing.html`,
            width: 700,
            height: "auto",
            resizable: true,
            classes: ["potion-brewing", "brewing-dialog"],
        });
    }

    async getData() {
        if (!WITACompendiumLoader.isDepReady()) return { depMissing: true };
        if (!this._allRecipes.length)  this._allRecipes  = await WITACompendiumLoader.loadRecipes();
        if (!this._ingredients.length) this._ingredients = await WITACompendiumLoader.loadIngredients();

        const actor     = this.actor;
        const { level, bonus, exp } = WITA_POTION_CRAFTING.getState(actor);
        const profBonus = actor.system.attributes?.prof ?? 2;

        // Filter recipes by SC Cauldron "Known Players" config stored on each recipe item.
        // If SC Cauldron is inactive or the actor has no assigned player, show all recipes.
        const scActive   = game.modules.get("sc-the-cauldron")?.active === true;
        const actorOwner = game.users.find(u => !u.isGM && u.character?.id === actor.id) ?? null;

        // SC Cauldron stores known-player IDs on the recipe item flags.
        // Log the flag shape once so we can verify the key if needed.
        if (scActive && this._allRecipes.length && !WITABrewingDialog._scFlagLogged) {
            WITABrewingDialog._scFlagLogged = true;
            const sample = this._allRecipes.find(r => Object.keys(r.scFlags).length > 0);
            console.log("WITA | SC Cauldron recipe flags sample:", sample?.name, sample?.scFlags);
        }

        const kitRecipes = this._allRecipes.filter(r => {
            if (r.kit !== this.selectedKit) return false;
            if (!scActive || !actorOwner) return true;
            // Try all plausible SC Cauldron flag shapes for known-player lists.
            const flags = r.scFlags ?? {};
            const playerList =
                flags.knownPlayers      ??   // array of user IDs (string)
                flags.knownPlayerIds    ??   // alternative key
                flags.players           ??   // may be array of objects {id}
                [];
            const ids = Array.isArray(playerList)
                ? playerList.map(p => (typeof p === "object" ? p.id ?? p._id : p))
                : [];
            return ids.includes(actorOwner.id);
        });
        const annotated  = kitRecipes.map(r => ({
            ...r,
            requiredLevel: WITA_RARITY_LEVEL_GATES[r.rarity] ?? 1,
            underLevel:    level < (WITA_RARITY_LEVEL_GATES[r.rarity] ?? 1),
        }));

        const ingByName = Object.fromEntries(this._ingredients.map(i => [i.name, i]));

        let selectedRecipeDetail = null;
        if (this.selectedRecipe) {
            const required = {};
            for (const name of this.selectedRecipe.ingredients) required[name] = (required[name] ?? 0) + 1;
            selectedRecipeDetail = {
                ...this.selectedRecipe,
                ingredientDetails: Object.entries(required).map(([name, qty]) => ({
                    name, qty,
                    img:  ingByName[name]?.img  ?? "icons/containers/bags/pack-simple-leather-tan.webp",
                    uuid: ingByName[name]?.uuid ?? null,
                })),
            };
        }

        const ingredientNames = new Set(this._ingredients.map(i => i.name));
        const bag = witaFindIngredientBag(actor);
        const containerId = bag?._id ?? null;
        const stockItems = actor.items.contents
            .filter(i => ingredientNames.has(i.name) && (!containerId || i.system?.container === containerId))
            .map(i => ({ name: i.name, img: i.img, uuid: i.uuid, quantity: i.system?.quantity ?? 1 }))
            .sort((a, b) => a.name.localeCompare(b.name));

        // Annotate each required ingredient with how many the actor currently holds
        if (selectedRecipeDetail) {
            const stockByName = Object.fromEntries(stockItems.map(i => [i.name, i.quantity]));
            selectedRecipeDetail.ingredientDetails = selectedRecipeDetail.ingredientDetails.map(ing => {
                const have      = stockByName[ing.name] ?? 0;
                const missing   = Math.max(0, ing.qty - have);
                const unitCost  = getIngredientCost(ing.name);
                return { ...ing, have, missing, unitCost, totalCost: unitCost * ing.qty };
            });
            selectedRecipeDetail.canCraft = selectedRecipeDetail.ingredientDetails.every(i => i.missing === 0);

            const rules        = WITA_POTION_CRAFTING_RULES[selectedRecipeDetail.rarity] ?? {};
            const materialCost = getRecipeMaterialCost(selectedRecipeDetail.name);
            const recipeFee    = rules.baseCost ?? 0;
            selectedRecipeDetail.materialCost  = materialCost;
            selectedRecipeDetail.recipeFee     = recipeFee;
            selectedRecipeDetail.totalCraftCost = materialCost + recipeFee;
            selectedRecipeDetail.productValue  = rules.productValue ?? 0;
        }

        return {
            actor, level, bonus, exp, profBonus,
            selectedKit:    this.selectedKit,
            allRecipes:     annotated,
            selectedRecipe: selectedRecipeDetail,
            crafting:       WITA_POTION_CRAFTING_RULES,
            levelGates:     WITA_RARITY_LEVEL_GATES,
            stockItems,
            hasStock:       stockItems.length > 0,
            stockCount:     stockItems.reduce((s, i) => s + i.quantity, 0),
        };
    }

    // TODO(v14): activateListeners receives HTMLElement in v14, not jQuery
    activateListeners(html) {
        super.activateListeners(html);

        html.find(".btn-sc-recipes").on("click", () => this._openRecipes());

        html.find(".kit-tab").on("click", e => {
            this.selectedKit    = $(e.currentTarget).data("kit");
            this.selectedRecipe = null;
            this.render();
        });
        html.find(".recipe-select").on("change", e => {
            const val = e.target.value;
            this.selectedRecipe = val ? (this._allRecipes.find(r => r.name === val) ?? null) : null;
            this.render();
        });
        html.find(".btn-brew").on("click", async () => {
            if (this.selectedRecipe) await this._brewPotion(this.selectedRecipe);
        });

        html.find(".ing-inspect").on("click", async e => {
            const uuid = $(e.currentTarget).data("uuid");
            if (uuid) (await fromUuid(uuid))?.sheet?.render(true);
        });

        html.find(".pbg-stock-item[data-uuid]").each((_, el) => {
            el.addEventListener("dragstart", ev => {
                ev.dataTransfer.setData("text/plain", JSON.stringify({
                    type: "Item",
                    uuid: el.dataset.uuid,
                }));
            });
        });
    }

    _openRecipes() {
        const sheet = this.actor.sheet;
        if (sheet?.rendered) {
            const root = sheet.element instanceof HTMLElement ? sheet.element : sheet.element?.[0];
            const cauldronBtns = Array.from(
                root?.querySelectorAll?.("button i.fa-cauldron, button i.fa-solid.fa-cauldron, [data-action] i.fa-cauldron") ?? []
            ).map(i => i.closest("button") ?? i.closest("[data-action]")).filter(Boolean);
            if (cauldronBtns.length) { cauldronBtns[0].click(); return; }
        }
        game.modules.get("sc-the-cauldron")?.api?.openCauldronForDocument(this.actor);
    }

    async _brewPotion(recipe) {
        const actor     = this.actor;
        const profBonus = actor.system.attributes?.prof ?? 2;
        const { bonus: pmBonus, level: pmLevel } = WITA_POTION_CRAFTING.getState(actor);
        const rules     = WITA_POTION_CRAFTING_RULES[recipe.rarity] ?? WITA_POTION_CRAFTING_RULES.common;

        const requiredLevel = WITA_RARITY_LEVEL_GATES[recipe.rarity] ?? 1;
        const underLevel    = pmLevel < requiredLevel;
        const rollPenalty   = underLevel ? -5 : 0;
        const totalBonus    = profBonus + pmBonus + rollPenalty;

        const required = {};
        for (const name of recipe.ingredients) required[name] = (required[name] ?? 0) + 1;
        const parsed   = Object.entries(required).map(([name, qty]) => ({ name, qty }));

        const levelWarning = underLevel
            ? `<p style="color:#e8a23a;border:1px solid #e8a23a;padding:6px;border-radius:4px;margin:8px 0">
                ⚠️ <strong>Crafting above your level!</strong><br>
                Requires Craft Level <strong>${requiredLevel}</strong> — you are Level <strong>${pmLevel}</strong>.<br>
                Penalty: <strong>−5 to your roll</strong>. On failure, roll 1d2: on a 1 your ingredients are lost.
               </p>`
            : "";

        const rollDisplay = totalBonus >= 0
            ? `1d20+${profBonus}(prof)+${pmBonus}(PM)${underLevel ? `<strong style="color:#e8a23a"> −5(level)</strong>` : ""} = 1d20+${totalBonus}`
            : `1d20+${profBonus}(prof)+${pmBonus}(PM)<strong style="color:#e8a23a"> −5(level)</strong> = 1d20−${Math.abs(totalBonus)}`;

        const ok = await Dialog.confirm({
            title: `Brew: ${recipe.name}`,
            content: `<p>Attempt to brew <strong>${recipe.name}</strong>?</p>
                ${levelWarning}
                <ul>
                    <li><strong>Kit:</strong> ${recipe.kit} &nbsp;|&nbsp; <strong>DC:</strong> ${rules.dc} &nbsp;|&nbsp; <strong>Hours:</strong> ${rules.workHours}</li>
                    <li><strong>Cost:</strong> ${rules.baseCost} gp &nbsp;|&nbsp; <strong>Value:</strong> ${recipe.value} gp</li>
                    <li><strong>Roll:</strong> ${rollDisplay}</li>
                </ul>
                <p><strong>Required ingredients:</strong><br>${parsed.map(i => `${i.name} ×${i.qty}`).join("<br>")}</p>
                <p style="color:#8ab4f8">On success, SC Cauldron will open — drag your ingredients in to complete the craft.</p>`,
        });
        if (!ok) return;

        const rollFormula = totalBonus >= 0 ? `1d20+${totalBonus}` : `1d20-${Math.abs(totalBonus)}`;
        const roll        = await new Roll(rollFormula).evaluate();
        const success     = roll.total >= rules.dc;

        if (success) {
            await roll.toMessage({
                flavor: `<h3>⚗️ Brewing: ${recipe.name}</h3>
                    <p><strong>DC:</strong> ${rules.dc} | <strong>Roll:</strong> ${roll.total}${underLevel ? ` <em>(includes −5 level penalty)</em>` : ""}</p>
                    <p>✅ <strong>Success!</strong> Drag your ingredients into SC Cauldron to complete the craft.</p>`,
                speaker: ChatMessage.getSpeaker({ actor }),
            });
            this.render();
            game.modules.get("sc-the-cauldron")?.api?.openCauldronForDocument(actor);
        } else {
            const fateRoll = await new Roll("1d2").evaluate();
            const ingredientFateMsg = fateRoll.total === 1
                ? `<p>🎲 Ingredient fate: <strong>${fateRoll.total}/2 — Ingredients LOST.</strong> The batch was ruined.</p>`
                : `<p>🎲 Ingredient fate: <strong>${fateRoll.total}/2 — Ingredients salvaged.</strong> You may return them to storage.</p>`;

            await roll.toMessage({
                flavor: `<h3>⚗️ Brewing: ${recipe.name}</h3>
                    <p><strong>DC:</strong> ${rules.dc} | <strong>Roll:</strong> ${roll.total}${underLevel ? ` <em>(includes −5 level penalty)</em>` : ""}</p>
                    <p>❌ <strong>Failed.</strong> Gold and work hours lost.</p>${ingredientFateMsg}`,
                speaker: ChatMessage.getSpeaker({ actor }),
            });
            this.render();
        }
    }
}
