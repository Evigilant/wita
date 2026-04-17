// ============================================================
// WITA — CRAFT LEVEL SHEET
// Shows per-actor Craft EXP, level, and progression.
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
        return {
            actor, exp, level, bonus, nextLevelExp, curLevelExp, progress,
            levelTable: WITA_POTION_MAKING_LEVELS,
            expTable:   WITA_POTION_EXP_TABLE,
            isGM:       game.user.isGM,
        };
    }

    // TODO(v14): activateListeners receives HTMLElement in v14, not jQuery
    activateListeners(html) {
        super.activateListeners(html);

        html.find(".btn-sc-recipes").on("click", () => this._openRecipes());

        html.find(".btn-add-exp").on("click", async () => {
            const amount = parseInt(html.find("#manual-exp").val()) || 0;
            if (amount <= 0) return;
            await WITA_POTION_CRAFTING.awardExp(this.actor, amount, "manual GM award");
            this.render();
        });

        html.find(".btn-reset-craft").on("click", async () => {
            const confirmed = await Dialog.confirm({
                title: "Reset Craft XP & Level",
                content: `<p>Reset <strong>${this.actor.name}</strong>'s Craft EXP to 0 and return them to Level 1?</p>
                    <p style="color:var(--color-level-error,#e07575)">This cannot be undone.</p>`,
            });
            if (!confirmed) return;
            await WITA_POTION_CRAFTING.setExp(this.actor, 0);
            this.render();
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
}
