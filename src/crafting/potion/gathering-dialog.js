// ============================================================
// WITA — INGREDIENT GATHERING DIALOG
// ============================================================
import { WITACompendiumLoader } from "./compendium-loader.js";
import { WITA_POTION_CRAFTING, WITA_POTION_EXP_TABLE } from "./potion-config.js";
import { WITA_POTION_ENVIRONMENTS } from "./potion-data.js";

// TODO(v14): migrate to ApplicationV2
export class WITAGatheringDialog extends Application {
    constructor(actor, options = {}) {
        super(options);
        this.actor        = actor;
        this._ingredients = [];
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "wita-gathering-dialog",
            title: "Ingredient Gathering",
            template: `modules/wita/templates/potion/gathering.html`,
            width: 700,
            height: "auto",
            resizable: true,
            classes: ["potion-brewing", "gathering-dialog"],
        });
    }

    async getData() {
        if (!WITACompendiumLoader.isDepReady()) return { depMissing: true };
        if (!this._ingredients.length) this._ingredients = await WITACompendiumLoader.loadIngredients();
        const actor     = this.actor;
        const { level, bonus, exp } = WITA_POTION_CRAFTING.getState(actor);
        const profBonus = actor.system.attributes?.prof ?? 2;
        return {
            actor, level, bonus, exp, profBonus,
            environments: WITA_POTION_ENVIRONMENTS,
            ingredients:  this._ingredients,
            stock:        WITA_POTION_CRAFTING.getStock(actor),
        };
    }

    // TODO(v14): activateListeners receives HTMLElement in v14, not jQuery
    activateListeners(html) {
        super.activateListeners(html);
        html.find("#env-filter").on("change", e => {
            const env = e.target.value;
            html.find(".ingredient-row").each((_, row) => {
                const locs = $(row).data("locations") || "";
                $(row).toggle(!env || locs.includes(env));
            });
        });
        html.find(".btn-nature-check").on("click", async () => {
            const extra = parseInt(html.find("#nature-extra").val()) || 0;
            await this._rollNatureCheck(extra);
        });
        html.find(".btn-harvest").on("click", async e => {
            const name = $(e.currentTarget).data("name");
            const ing  = this._ingredients.find(i => i.name === name);
            if (!ing) return;
            const extra = parseInt($(e.currentTarget).closest(".ingredient-row").find(".harvest-extra").val()) || 0;
            await this._rollHarvest(ing, extra);
        });
        html.find(".ing-name").on("click", async e => {
            const uuid = $(e.currentTarget).data("uuid");
            if (!uuid) return;
            const item = await fromUuid(uuid);
            item?.sheet?.render(true);
        });
    }

    async _rollNatureCheck(extraMinutes = 0) {
        const actor      = this.actor;
        const profBonus  = actor.system.attributes?.prof ?? 2;
        const wisMod     = actor.system.abilities?.wis?.mod ?? 0;
        const extraBonus = Math.min(Math.floor(extraMinutes / 15), 2) * 3;
        const roll       = await new Roll(`1d20+${wisMod}+${profBonus}+${extraBonus}`).evaluate();
        const env        = this.element?.find("#env-filter").val() ?? "";
        const visible    = this._ingredients.filter(i => !env || i.locations.includes(env));

        let identified = [];
        if      (roll.total >= 20) identified = visible;
        else if (roll.total >= 15) identified = visible.filter(i => ["common","uncommon"].includes(i.gatherRarity));
        else if (roll.total >= 10) identified = visible.filter(i => i.gatherRarity === "common");

        const known   = WITA_POTION_CRAFTING.getIdentified(actor);
        let expGained = 0;
        const newKeys = [];
        for (const ing of identified) {
            const key = `${env || "any"}:${ing.name}`;
            if (!known.includes(key)) {
                expGained += WITA_POTION_EXP_TABLE.identify[ing.gatherRarity] ?? 0;
                newKeys.push(key);
            }
        }
        if (newKeys.length) {
            await WITA_POTION_CRAFTING.addIdentified(actor, newKeys);
            if (expGained > 0) await WITA_POTION_CRAFTING.awardExp(actor, expGained, "ingredient identification");
        }

        await roll.toMessage({
            flavor: `<h3>🌿 Nature Check — Survey${env ? `: ${env}` : ""}</h3>
                <p><strong>Total:</strong> ${roll.total} (+${extraBonus} from extra time)</p>
                ${identified.length
                    ? `<p><strong>Identified:</strong> ${identified.map(i => `${i.name} <em>(${i.gatherRarity})</em>`).join(", ")}</p>`
                    : `<p>Nothing identified (need 10+).</p>`}
                ${expGained > 0 ? `<p>🌟 +${expGained} Craft EXP for new identifications!</p>` : ""}`,
            speaker: ChatMessage.getSpeaker({ actor }),
        });
        this.render();
    }

    async _rollHarvest(ing, extraTime = 0) {
        const actor      = this.actor;
        const profBonus  = actor.system.attributes?.prof ?? 2;
        const { bonus: pmBonus } = WITA_POTION_CRAFTING.getState(actor);
        const extraBonus = Math.min(Math.floor(extraTime / 10), 2) * 3;
        const roll       = await new Roll(`1d20+${profBonus}+${pmBonus}+${extraBonus}`).evaluate();
        const success    = roll.total >= ing.harvestDC;
        let resultText   = "";
        let expGained    = 0;

        if (success) {
            const qty = (await new Roll(ing.quantity).evaluate()).total;
            await WITA_POTION_CRAFTING.addIngredient(actor, ing.name, qty);
            expGained = (WITA_POTION_EXP_TABLE.gather[ing.gatherRarity] ?? 0) * qty;
            if (expGained > 0) await WITA_POTION_CRAFTING.awardExp(actor, expGained, `harvesting ${ing.name}`);
            resultText = `✅ Harvested <strong>${qty}×</strong> ${ing.name}. Added to stock.`;
        } else {
            const f = (await new Roll("1d4").evaluate()).total;
            resultText = ["❌ Ingredient destroyed.", "⚠️ Quantity halved — none gained.", "⚠️ Quantity quartered — none gained.", "⚠️ Ingredient unaffected."][f - 1];
        }

        await roll.toMessage({
            flavor: `<h3>🌿 Harvest: ${ing.name}</h3>
                <p><strong>DC:</strong> ${ing.harvestDC} | <strong>Roll:</strong> ${roll.total}</p>
                <p>${resultText}</p>
                ${expGained > 0 ? `<p>🌟 +${expGained} Craft EXP!</p>` : ""}`,
            speaker: ChatMessage.getSpeaker({ actor }),
        });
        this.render();
    }
}
