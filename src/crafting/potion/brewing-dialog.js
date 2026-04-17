// ============================================================
// WITA — POTION BREWING DIALOG
// Includes level gate check, -5 roll penalty when under level,
// and 1d2 ingredient fate roll on failure.
// ============================================================
import { WITACompendiumLoader } from "./compendium-loader.js";
import {
    WITA_POTION_CRAFTING,
    WITA_RARITY_LEVEL_GATES,
    WITA_POTION_CRAFTING_RULES,
    WITA_POTION_EXP_TABLE,
} from "./potion-config.js";

// TODO(v14): migrate to ApplicationV2
export class WITABrewingDialog extends Application {
    constructor(actor, options = {}) {
        super(options);
        this.actor          = actor;
        this.selectedKit    = "alchemist";
        this.selectedRecipe = null;
        this._allRecipes    = [];
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "wita-brewing-dialog",
            title: "Potion Brewing",
            template: `modules/wita/templates/potion/brewing.html`,
            width: 700,
            height: "auto",
            resizable: true,
            classes: ["potion-brewing", "brewing-dialog"],
        });
    }

    async getData() {
        if (!WITACompendiumLoader.isDepReady()) return { depMissing: true };
        if (!this._allRecipes.length) this._allRecipes = await WITACompendiumLoader.loadRecipes();

        const actor        = this.actor;
        const { level, bonus, exp } = WITA_POTION_CRAFTING.getState(actor);
        const profBonus    = actor.system.attributes?.prof ?? 2;
        const stock        = WITA_POTION_CRAFTING.getStock(actor);
        const knownRecipes = WITA_POTION_CRAFTING.getKnownRecipes(actor);
        const kitRecipes   = this._allRecipes.filter(r => r.kit === this.selectedKit);

        const annotated = kitRecipes.map(r => ({
            ...r,
            requiredLevel: WITA_RARITY_LEVEL_GATES[r.rarity] ?? 1,
            underLevel:    level < (WITA_RARITY_LEVEL_GATES[r.rarity] ?? 1),
        }));

        return {
            actor, level, bonus, exp, profBonus, stock,
            selectedKit: this.selectedKit,
            allRecipes: annotated,
            knownRecipes,
            selectedRecipe: this.selectedRecipe,
            crafting: WITA_POTION_CRAFTING_RULES,
            levelGates: WITA_RARITY_LEVEL_GATES,
        };
    }

    // TODO(v14): activateListeners receives HTMLElement in v14, not jQuery
    activateListeners(html) {
        super.activateListeners(html);
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
        html.find(".btn-learn-recipe").on("click", async () => {
            if (this.selectedRecipe) await this._learnRecipe(this.selectedRecipe);
        });
        html.find(".btn-brew").on("click", async () => {
            if (this.selectedRecipe) await this._brewPotion(this.selectedRecipe);
        });
        html.find(".recipe-result-link").on("click", async e => {
            const uuid = $(e.currentTarget).data("uuid");
            if (uuid) (await fromUuid(uuid))?.sheet?.render(true);
        });
    }

    async _learnRecipe(recipe) {
        const actor = this.actor;
        if (WITA_POTION_CRAFTING.knowsRecipe(actor, recipe.name))
            return ui.notifications.info(`${actor.name} already knows ${recipe.name}.`);

        const rules     = WITA_POTION_CRAFTING_RULES[recipe.rarity] ?? WITA_POTION_CRAFTING_RULES.common;
        const expReward = WITA_POTION_EXP_TABLE.recipe[recipe.rarity] ?? 0;

        const ok = await Dialog.confirm({
            title: `Learn Recipe: ${recipe.name}`,
            content: `<p>Spend <strong>${rules.workHours} hours</strong> and <strong>${rules.baseCost} gp</strong> learning
                <strong>${recipe.name}</strong>?</p>
                <p>Always succeeds; no product produced.</p>
                ${expReward > 0 ? `<p>Reward: <strong>${expReward} Craft EXP</strong></p>` : ""}`,
        });
        if (!ok) return;

        await WITA_POTION_CRAFTING.learnRecipe(actor, recipe.name);
        if (expReward > 0) await WITA_POTION_CRAFTING.awardExp(actor, expReward, `learning: ${recipe.name}`);
        ChatMessage.create({
            content: `📜 ${actor.name} learned the recipe for <strong>${recipe.name}</strong>!`,
            speaker: ChatMessage.getSpeaker({ actor }),
        });
        this.render();
    }

    async _brewPotion(recipe) {
        const actor     = this.actor;
        const profBonus = actor.system.attributes?.prof ?? 2;
        const { bonus: pmBonus, level: pmLevel } = WITA_POTION_CRAFTING.getState(actor);
        const rules     = WITA_POTION_CRAFTING_RULES[recipe.rarity] ?? WITA_POTION_CRAFTING_RULES.common;

        if (!WITA_POTION_CRAFTING.knowsRecipe(actor, recipe.name))
            return ui.notifications.warn(`${actor.name} hasn't learned ${recipe.name} yet.`);

        const requiredLevel = WITA_RARITY_LEVEL_GATES[recipe.rarity] ?? 1;
        const underLevel    = pmLevel < requiredLevel;
        const rollPenalty   = underLevel ? -5 : 0;
        const totalBonus    = profBonus + pmBonus + rollPenalty;

        const required = {};
        for (const name of recipe.ingredients) required[name] = (required[name] ?? 0) + 1;
        const parsed   = Object.entries(required).map(([name, qty]) => ({ name, qty }));
        const stock    = WITA_POTION_CRAFTING.getStock(actor);
        const missing  = parsed.filter(({ name, qty }) => (stock[name] ?? 0) < qty);

        const levelWarning = underLevel
            ? `<p style="color:#e8a23a;border:1px solid #e8a23a;padding:6px;border-radius:4px;margin:8px 0">
                ⚠️ <strong>Crafting above your level!</strong><br>
                Requires Craft Level <strong>${requiredLevel}</strong> — you are Level <strong>${pmLevel}</strong>.<br>
                Penalty: <strong>−5 to your roll</strong>. On failure, roll 1d2: on a 1 your ingredients are lost.
               </p>`
            : "";

        const rollDisplay = totalBonus >= 0
            ? `1d20+${profBonus}(prof)+${pmBonus}(PM)${underLevel ? `<strong style="color:#e8a23a"> −5(level penalty)</strong>` : ""} = 1d20+${totalBonus}`
            : `1d20+${profBonus}(prof)+${pmBonus}(PM)<strong style="color:#e8a23a"> −5(level penalty)</strong> = 1d20−${Math.abs(totalBonus)}`;

        const ok = await Dialog.confirm({
            title: `Brew: ${recipe.name}`,
            content: `<p>Brew <strong>${recipe.name}</strong>?</p>
                ${levelWarning}
                <ul>
                    <li><strong>Kit:</strong> ${recipe.kit} &nbsp;|&nbsp; <strong>DC:</strong> ${rules.dc} &nbsp;|&nbsp; <strong>Hours:</strong> ${rules.workHours}</li>
                    <li><strong>Cost:</strong> ${rules.baseCost} gp &nbsp;|&nbsp; <strong>Value:</strong> ${recipe.value} gp</li>
                    <li><strong>Roll:</strong> ${rollDisplay}</li>
                </ul>
                <p><strong>Ingredients:</strong><br>${parsed.map(i => `${i.name} ×${i.qty}`).join("<br>")}</p>
                ${missing.length
                    ? `<p style="color:#e87a7a">⚠️ Missing: ${missing.map(i => `${i.name} (need ${i.qty}, have ${stock[i.name] ?? 0})`).join(", ")}</p>`
                    : `<p style="color:#6abf69">✅ All ingredients available.</p>`}`,
        });
        if (!ok) return;

        for (const { name, qty } of parsed) {
            if (!await WITA_POTION_CRAFTING.removeIngredient(actor, name, qty))
                return ui.notifications.error(`Could not consume ${name} — brewing cancelled.`);
        }

        const rollFormula = totalBonus >= 0 ? `1d20+${totalBonus}` : `1d20-${Math.abs(totalBonus)}`;
        const roll        = await new Roll(rollFormula).evaluate();
        const success     = roll.total >= rules.dc;
        const expReward   = success ? (WITA_POTION_EXP_TABLE.produced[recipe.rarity] ?? 0) : 0;

        let ingredientFateMsg = "";
        if (success) {
            await WITA_POTION_CRAFTING.awardExp(actor, expReward, `crafting ${recipe.name}`);
        } else {
            const fateRoll = await new Roll("1d2").evaluate();
            if (fateRoll.total === 1) {
                ingredientFateMsg = `<p>🎲 Ingredient fate: <strong>${fateRoll.total}/2 — Ingredients LOST.</strong> The batch was ruined beyond recovery.</p>`;
            } else {
                for (const { name, qty } of parsed) await WITA_POTION_CRAFTING.addIngredient(actor, name, qty);
                ingredientFateMsg = `<p>🎲 Ingredient fate: <strong>${fateRoll.total}/2 — Ingredients returned.</strong> The batch failed but ingredients were salvaged.</p>`;
            }
        }

        await roll.toMessage({
            flavor: `<h3>⚗️ Brewing: ${recipe.name}</h3>
                <p><strong>DC:</strong> ${rules.dc} | <strong>Roll:</strong> ${roll.total}${underLevel ? ` <em>(includes −5 level penalty)</em>` : ""}</p>
                ${success
                    ? `<p>✅ <strong>Success!</strong> ${recipe.name} crafted! Worth ${recipe.value} gp.</p>
                       <p>🌟 +${expReward} Craft EXP</p>`
                    : `<p>❌ <strong>Failed.</strong> Gold lost.</p>${ingredientFateMsg}`}`,
            speaker: ChatMessage.getSpeaker({ actor }),
        });
        this.render();
    }
}
