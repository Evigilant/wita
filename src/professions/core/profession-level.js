// ============================================================
// WITA — CRAFTING PROFESSION LEVEL
// Actor-based crafting profession class. Stores EXP, level,
// recipe knowledge, ingredient stock, and identified-ingredient
// dedup tracking on actor flags.
//
// Constructor options:
//   namespace  — Foundry flag namespace (default: "wita")
//   prefix     — flag key prefix: "craft", "smith", etc.
//   label      — display name for chat messages ("Craft Level")
//   levelTable — [{ level, exp, bonus }, ...]
//   expTable   — { produced: { common, uncommon, ... }, ... }
//   levelGates — { common: 1, uncommon: 3, ... }
// ============================================================

import { WITABaseProfession } from "./base-level.js";

export class WITACraftingLevel extends WITABaseProfession {
    constructor({
        namespace  = "wita",
        prefix,
        label      = "Craft Level",
        levelTable = [],
        expTable   = {},
        levelGates = {},
    }) {
        super();
        this.namespace  = namespace;
        this.prefix     = prefix;
        this.label      = label;
        this.levelTable = levelTable;
        this.expTable   = expTable;
        this.levelGates = levelGates;
    }

    // ── Private helper ────────────────────────────────────────
    #flagKey(suffix) { return `${this.prefix}${suffix}`; }

    // ── EXP & Level ───────────────────────────────────────────
    getExp(actor)   { return actor.getFlag(this.namespace, this.#flagKey("Exp")) ?? 0; }
    async setExp(actor, v) { return actor.setFlag(this.namespace, this.#flagKey("Exp"), v); }

    getLevel(actor) { return this._levelForXP(this.getExp(actor)); }

    getBonus(actor) {
        return this.levelTable.find(r => r.level === this.getLevel(actor))?.bonus ?? 0;
    }

    getExpForNextLevel(actor) {
        const lvl  = this.getLevel(actor);
        const next = this.levelTable.find(r => r.level === lvl + 1);
        return next?.exp ?? null;
    }

    // Returns { exp, level, bonus, next, curExp, pct } — field names match pre-refactor API.
    getState(actor) {
        const { xp: exp, level, bonus, next, curXP: curExp, pct } = this._getState(this.getExp(actor));
        return { exp, level, bonus, next, curExp, pct };
    }

    async awardExp(actor, amount, reason = "") {
        if (amount <= 0) return;
        const oldLevel = this.getLevel(actor);
        const newTotal = this.getExp(actor) + amount;
        await this.setExp(actor, newTotal);
        const newLevel = this.getLevel(actor);
        const tag      = reason ? ` (${reason})` : "";
        ChatMessage.create({
            content: `🌟 ${actor.name} earned <strong>${amount} ${this.label} EXP</strong>${tag}. Total: ${newTotal}.<br>
                      <em style="font-size:11px;color:var(--color-text-light-6)">Type /craftlevel or click Craft Level on your character sheet to check your level.</em>`,
            speaker: ChatMessage.getSpeaker({ actor }),
        });
        if (newLevel > oldLevel) {
            this._postLevelUpChat(actor.name, newLevel, { speakerAlias: actor.name });
        }
        return newTotal;
    }

    // ── Recipe knowledge ──────────────────────────────────────
    getKnownRecipes(actor)   { return actor.getFlag(this.namespace, this.#flagKey("KnownRecipes")) ?? []; }
    knowsRecipe(actor, name) { return this.getKnownRecipes(actor).includes(name); }
    async learnRecipe(actor, name) {
        const known = this.getKnownRecipes(actor);
        if (!known.includes(name)) {
            await actor.setFlag(this.namespace, this.#flagKey("KnownRecipes"), [...known, name]);
        }
    }

    // ── Ingredient stock ──────────────────────────────────────
    getStock(actor) { return actor.getFlag(this.namespace, this.#flagKey("IngredientStock")) ?? {}; }

    async addIngredient(actor, name, qty = 1) {
        const s = this.getStock(actor);
        s[name] = (s[name] ?? 0) + qty;
        await actor.setFlag(this.namespace, this.#flagKey("IngredientStock"), s);
    }

    async removeIngredient(actor, name, qty = 1) {
        const s = this.getStock(actor);
        if ((s[name] ?? 0) < qty) return false;
        s[name] -= qty;
        if (s[name] === 0) delete s[name];
        await actor.setFlag(this.namespace, this.#flagKey("IngredientStock"), s);
        return true;
    }

    // ── Identified ingredients (EXP dedup) ───────────────────
    getIdentified(actor) { return actor.getFlag(this.namespace, this.#flagKey("IdentifiedIngredients")) ?? []; }
    async addIdentified(actor, keys) {
        const known = this.getIdentified(actor);
        await actor.setFlag(this.namespace, this.#flagKey("IdentifiedIngredients"), [...known, ...keys]);
    }
}
