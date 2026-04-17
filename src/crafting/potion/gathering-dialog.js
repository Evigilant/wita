// ============================================================
// WITA — INGREDIENT GATHERING DIALOG
// ============================================================
import { WITACompendiumLoader } from "./compendium-loader.js";
import { WITA_POTION_CRAFTING, WITA_POTION_EXP_TABLE } from "./potion-config.js";
import { WITA_POTION_ENVIRONMENTS } from "./potion-data.js";

// ── Ingredient bag ─────────────────────────────────────────────
export const WITA_INGREDIENT_BAG_UUID = "Compendium.wita.wita-items.Item.xKESGnc6EhdI6r7u";

export function witaFindIngredientBag(actor) {
    const bag = actor.items.contents.find(
        i => i.flags?.wita?.ingredientBag === true
            || i.flags?.core?.sourceId === WITA_INGREDIENT_BAG_UUID
    ) ?? null;
    // Backfill the custom flag on legacy bags found only by sourceId
    if (bag && !bag.flags?.wita?.ingredientBag) {
        bag.setFlag("wita", "ingredientBag", true).catch(() => {});
    }
    return bag;
}

export async function witaGetOrCreateIngredientBag(actor) {
    const existing = witaFindIngredientBag(actor);
    if (existing) return existing;
    const source = await fromUuid(WITA_INGREDIENT_BAG_UUID);
    if (!source) {
        ui.notifications.error("WITA: Ingredient bag not found in compendium.");
        return null;
    }
    const itemData = source.toObject();
    // Set flags explicitly — Foundry only auto-sets sourceId on UI drag-drop, not createEmbeddedDocuments
    foundry.utils.setProperty(itemData, "flags.core.sourceId", WITA_INGREDIENT_BAG_UUID);
    foundry.utils.setProperty(itemData, "flags.wita.ingredientBag", true);
    const [created] = await actor.createEmbeddedDocuments("Item", [itemData]);
    return created ?? null;
}

// ── Nature check uses (per long rest) ─────────────────────────
export const WITA_NATURE_CHECK_MAX = 1;

export function witaGetNatureChecksUsed(actor) {
    return actor.getFlag("wita", "natureChecksUsed") ?? 0;
}

export async function witaResetNatureChecks(actor) {
    await actor.unsetFlag("wita", "natureChecksUsed");
}

// ── Environment prompt (runs on GM client via executeAsGM) ────
export function witaPromptGatherEnvironment() {
    return new Promise(resolve => {
        const options = WITA_POTION_ENVIRONMENTS.map(e => `<option value="${e}">${e}</option>`).join("");
        new Dialog({
            title: "Select Survey Environment",
            content: `<div style="padding:8px 4px">
                <p style="margin:0 0 6px">Choose the environment the party is currently in:</p>
                <select id="wita-env-select" style="width:100%">
                    <option value="">— All / Unspecified —</option>
                    ${options}
                </select>
            </div>`,
            buttons: {
                roll:   { icon: '<i class="fas fa-dice-d20"></i>', label: "Roll",   callback: html => resolve(html.find("#wita-env-select").val() ?? "") },
                cancel: { icon: '<i class="fas fa-times"></i>',    label: "Cancel", callback: () => resolve(null) },
            },
            default: "roll",
            close: () => resolve(null),
        }).render(true);
    });
}

// ── Inventory helpers ──────────────────────────────────────────
function _witaIngredientStock(actor) {
    const bag = witaFindIngredientBag(actor);
    const containerId = bag?._id ?? null;
    return actor.items.contents
        .filter(i => containerId ? i.system?.container === containerId : false)
        .reduce((acc, item) => {
            acc[item.name] = (acc[item.name] ?? 0) + (item.system?.quantity ?? 1);
            return acc;
        }, {});
}

async function _witaAddIngredientToInventory(actor, ing, qty, containerId) {
    const existing = actor.items.contents.find(
        i => i.name === ing.name && (containerId ? i.system?.container === containerId : true)
    );
    if (existing) {
        await existing.update({ "system.quantity": (existing.system?.quantity ?? 1) + qty });
    } else {
        const source = await fromUuid(ing.uuid);
        if (!source) return;
        const itemData = source.toObject();
        foundry.utils.setProperty(itemData, "system.quantity", qty);
        if (containerId) foundry.utils.setProperty(itemData, "system.container", containerId);
        await actor.createEmbeddedDocuments("Item", [itemData]);
    }
}

// TODO(v14): migrate to ApplicationV2
export class WITAGatheringDialog extends Application {
    constructor(actor, options = {}) {
        super(options);
        this.actor              = actor;
        this._ingredients       = [];
        this._currentEnv        = "";
        this._harvestSlots      = 0;
        this._selected          = new Set();
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "wita-gathering-dialog",
            title: "Ingredient Gathering",
            template: `modules/wita/templates/potion/gathering.html`,
            width: 650,
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
        const profBonus  = actor.system.attributes?.prof ?? 2;
        const natureMod  = actor.system.skills?.nat?.total ?? actor.system.abilities?.wis?.mod ?? 0;

        const natureChecksUsed      = witaGetNatureChecksUsed(actor);
        const natureChecksMax       = WITA_NATURE_CHECK_MAX;
        const natureChecksExhausted = natureChecksUsed >= natureChecksMax;

        const env = this._currentEnv;
        const ingredients = (env
            ? this._ingredients.filter(i => i.locations?.includes(env))
            : this._ingredients
        ).map(i => ({
            ...i,
            selected: this._selected.has(i.name),
        }));

        return {
            actor, level, bonus, exp, profBonus, natureMod,
            isGM:         game.user.isGM,
            currentEnv:   env || "",
            ingredients,
            stock:        _witaIngredientStock(actor),
            natureChecksUsed,
            natureChecksMax,
            natureChecksExhausted,
            harvestSlots:  this._harvestSlots,
            selectedCount: this._selected.size,
            slotsLocked:   this._harvestSlots === 0,
        };
    }

    // TODO(v14): activateListeners receives HTMLElement in v14, not jQuery
    activateListeners(html) {
        super.activateListeners(html);

        html.find(".btn-reset-uses").on("click", async () => {
            await witaResetNatureChecks(this.actor);
            this.render();
        });

        html.find(".btn-nature-check").on("click", async () => {
            const extra = parseInt(html.find("#nature-extra").val()) || 0;
            await this._rollNatureCheck(extra);
        });

        html.find(".ing-checkbox").on("change", e => {
            const name    = e.currentTarget.dataset.name;
            const checked = e.currentTarget.checked;
            if (checked) {
                if (this._selected.size >= this._harvestSlots) {
                    e.currentTarget.checked = false;
                    ui.notifications.warn(`WITA: You can only select ${this._harvestSlots} ingredient(s) this harvest.`);
                    return;
                }
                this._selected.add(name);
            } else {
                this._selected.delete(name);
            }
            const count = this._selected.size;
            html.find(".harvest-selected-count").text(`${count}/${this._harvestSlots}`);
            html.find(".btn-harvest-selected").prop("disabled", count === 0);
        });

        html.find(".btn-harvest-selected").on("click", async () => {
            const extra = parseInt(html.find("#harvest-extra").val()) || 0;
            await this._harvestSelected(extra);
        });

        html.find(".ing-name").on("click", async e => {
            const uuid = $(e.currentTarget).data("uuid");
            if (!uuid) return;
            const item = await fromUuid(uuid);
            item?.sheet?.render(true);
        });
    }

    async _rollNatureCheck(extraMinutes = 0) {
        const actor = this.actor;
        const used  = witaGetNatureChecksUsed(actor);
        if (used >= WITA_NATURE_CHECK_MAX) {
            ui.notifications.warn("WITA: No nature check uses remaining. Take a long rest to recover.");
            return;
        }

        const env = await globalThis.WITA?.socket?.executeAsGM("witaSelectGatherEnv");
        if (env === null || env === undefined) return;

        // Clear selections that fall outside the new environment
        if (env) {
            const envNames = new Set(this._ingredients.filter(i => i.locations?.includes(env)).map(i => i.name));
            for (const name of this._selected) {
                if (!envNames.has(name)) this._selected.delete(name);
            }
        }
        this._currentEnv = env;

        const profBonus  = actor.system.attributes?.prof ?? 2;
        const wisMod     = actor.system.abilities?.wis?.mod ?? 0;
        const natureMod  = actor.system.skills?.nat?.total ?? wisMod;
        const extraBonus = Math.min(Math.floor(extraMinutes / 15), 2) * 3;

        // Survey roll (identification)
        const surveyRoll = await new Roll(`1d20+${wisMod}+${profBonus}+${extraBonus}`).evaluate();
        const visible    = env
            ? this._ingredients.filter(i => i.locations?.includes(env))
            : this._ingredients;

        let identified = [];
        if      (surveyRoll.total >= 20) identified = visible;
        else if (surveyRoll.total >= 15) identified = visible.filter(i => ["common","uncommon"].includes(i.gatherRarity));
        else if (surveyRoll.total >= 10) identified = visible.filter(i => i.gatherRarity === "common");

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

        // Harvest slots roll (1d6 + nature mod)
        const slotsRoll = await new Roll(`1d6+${natureMod}`).evaluate();
        this._harvestSlots = Math.max(1, slotsRoll.total);

        // Clamp existing selections to new slot count
        if (this._selected.size > this._harvestSlots) {
            const keep = [...this._selected].slice(0, this._harvestSlots);
            this._selected = new Set(keep);
        }

        await actor.setFlag("wita", "natureChecksUsed", used + 1);

        await surveyRoll.toMessage({
            flavor: `<h3>🌿 Nature Check — Survey${env ? `: ${env}` : ""}</h3>
                <p><strong>Survey roll:</strong> ${surveyRoll.total} (+${extraBonus} from extra time)</p>
                ${identified.length
                    ? `<p><strong>Identified:</strong> ${identified.map(i => `${i.name} <em>(${i.gatherRarity})</em>`).join(", ")}</p>`
                    : `<p>Nothing identified (need 10+).</p>`}
                ${expGained > 0 ? `<p>🌟 +${expGained} Craft EXP for new identifications!</p>` : ""}
                <hr>
                <p><strong>Harvest slots (1d6+${natureMod}):</strong> ${slotsRoll.total} — you may attempt <strong>${this._harvestSlots}</strong> ingredient(s).</p>`,
            speaker: ChatMessage.getSpeaker({ actor }),
        });
        this.render();
    }

    async _harvestSelected(extraTime = 0) {
        const actor   = this.actor;
        const targets = this._ingredients.filter(i => this._selected.has(i.name));
        if (!targets.length) {
            ui.notifications.warn("WITA: No ingredients selected.");
            return;
        }

        const profBonus   = actor.system.attributes?.prof ?? 2;
        const { bonus: pmBonus } = WITA_POTION_CRAFTING.getState(actor);
        const extraBonus  = Math.min(Math.floor(extraTime / 10), 2) * 3;

        // Resolve (or create) the ingredient bag once before the loop
        const bag         = await witaGetOrCreateIngredientBag(actor);
        const containerId = bag?._id ?? null;

        let totalExp = 0;
        const results = [];

        for (const ing of targets) {
            const roll    = await new Roll(`1d20+${profBonus}+${pmBonus}+${extraBonus}`).evaluate();
            const success = roll.total >= ing.harvestDC;
            if (success) {
                const qty = (await new Roll(ing.quantity).evaluate()).total;
                await _witaAddIngredientToInventory(actor, ing, qty, containerId);
                const exp = (WITA_POTION_EXP_TABLE.gather[ing.gatherRarity] ?? 0) * qty;
                totalExp += exp;
                results.push(`✅ <strong>${ing.name}</strong> — rolled ${roll.total} vs DC ${ing.harvestDC}: harvested ${qty}×`);
            } else {
                const f = (await new Roll("1d4").evaluate()).total;
                const fateMsg = ["destroyed", "qty ÷2 (none gained)", "qty ÷4 (none gained)", "unaffected"][f - 1];
                results.push(`❌ <strong>${ing.name}</strong> — rolled ${roll.total} vs DC ${ing.harvestDC}: ${fateMsg}`);
            }
        }

        if (totalExp > 0) await WITA_POTION_CRAFTING.awardExp(actor, totalExp, "harvest");

        const env = this._currentEnv;
        await ChatMessage.create({
            flavor: `<h3>🌾 Harvest${env ? ` — ${env}` : ""}</h3>
                <ul style="margin:6px 0 6px 16px">${results.map(r => `<li>${r}</li>`).join("")}</ul>
                ${totalExp > 0 ? `<p>🌟 +${totalExp} Craft EXP total!</p>` : ""}`,
            speaker: ChatMessage.getSpeaker({ actor }),
        });

        // Reset selections after harvesting
        this._selected.clear();
        this._harvestSlots = 0;
        this.render();
    }
}
