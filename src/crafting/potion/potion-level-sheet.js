// ============================================================
// WITA — CRAFT LEVEL SHEET
// Shows per-actor Craft EXP, level, stock, and recipe knowledge.
// ============================================================
import {
    WITA_POTION_CRAFTING,
    WITA_POTION_MAKING_LEVELS,
    WITA_POTION_EXP_TABLE,
} from "./potion-config.js";

// TODO(v14): migrate to ApplicationV2
export class WITAPotionLevelSheet extends Application {
    constructor(actor, options = {}) {
        super(options);
        this.actor = actor;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "wita-potion-level-sheet",
            title: "Craft Level",
            template: `modules/wita/templates/potion/potion-level.html`,
            width: 500,
            height: "auto",
            resizable: false,
            classes: ["potion-brewing", "potion-level-sheet"],
        });
    }

    getData() {
        const actor = this.actor;
        const { exp, level, bonus, next: nextLevelExp, curExp: curLevelExp, pct: progress } =
            WITA_POTION_CRAFTING.getState(actor);
        const knownRecipes = WITA_POTION_CRAFTING.getKnownRecipes(actor);
        const stock        = WITA_POTION_CRAFTING.getStock(actor);
        const stockEntries = Object.entries(stock).sort((a, b) => a[0].localeCompare(b[0]));
        return {
            actor, exp, level, bonus, nextLevelExp, curLevelExp, progress,
            knownRecipes, stockEntries,
            levelTable: WITA_POTION_MAKING_LEVELS,
            expTable:   WITA_POTION_EXP_TABLE,
            isGM:       game.user.isGM,
        };
    }

    // TODO(v14): activateListeners receives HTMLElement in v14, not jQuery
    activateListeners(html) {
        super.activateListeners(html);
        html.find(".btn-add-exp").on("click", async () => {
            const amount = parseInt(html.find("#manual-exp").val()) || 0;
            if (amount <= 0) return;
            await WITA_POTION_CRAFTING.awardExp(this.actor, amount, "manual GM award");
            this.render();
        });
        html.find(".btn-remove-ingredient").on("click", async e => {
            await WITA_POTION_CRAFTING.removeIngredient(this.actor, $(e.currentTarget).data("name"), 1);
            this.render();
        });
        html.find(".btn-add-ingredient").on("click", async e => {
            await WITA_POTION_CRAFTING.addIngredient(this.actor, $(e.currentTarget).data("name"), 1);
            this.render();
        });
        html.find(".btn-add-stock").on("click", async () => {
            const name = html.find("#stock-name").val()?.trim();
            const qty  = parseInt(html.find("#stock-qty").val()) || 1;
            if (!name) return ui.notifications.warn("Enter an ingredient name.");
            await WITA_POTION_CRAFTING.addIngredient(this.actor, name, qty);
            this.render();
        });
    }
}
