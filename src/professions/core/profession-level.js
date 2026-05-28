// ============================================================
// WITA — PROFESSION LEVEL
// Generic configurable leveling class for actor-based crafting
// professions. Stores EXP, level, recipe knowledge, ingredient
// stock, and identified-ingredient dedup tracking on actor flags.
//
// Constructor options:
//   namespace  — Foundry flag namespace (default: "wita")
//   prefix     — flag key prefix: "craft", "smith", etc.
//   label      — display name for chat messages ("Craft Level")
//   levelTable — [{ level, exp, bonus }, ...]
//   expTable   — { produced: { common, uncommon, ... }, ... }
//   levelGates — { common: 1, uncommon: 3, ... }
// ============================================================

export class WITACraftingLevel {
    constructor({
        namespace  = "wita",
        prefix,
        label      = "Craft Level",
        levelTable = [],
        expTable   = {},
        levelGates = {},
    }) {
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

    getLevel(actor) {
        const exp = this.getExp(actor);
        let level = 1;
        for (const row of this.levelTable) { if (exp >= row.exp) level = row.level; }
        return level;
    }

    getBonus(actor) {
        return this.levelTable.find(r => r.level === this.getLevel(actor))?.bonus ?? 0;
    }

    getExpForNextLevel(actor) {
        const lvl  = this.getLevel(actor);
        const next = this.levelTable.find(r => r.level === lvl + 1);
        return next?.exp ?? null;
    }

    // Returns { exp, level, bonus, next, curExp, pct } in one call.
    // Used by the renderActorSheet craft pill to avoid multiple flag reads.
    getState(actor) {
        const exp    = this.getExp(actor);
        const level  = this.getLevel(actor);
        const bonus  = this.getBonus(actor);
        const next   = this.getExpForNextLevel(actor);
        const curExp = this.levelTable.find(r => r.level === level)?.exp ?? 0;
        const pct    = next ? Math.min(100, Math.floor(((exp - curExp) / (next - curExp)) * 100)) : 100;
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
            const row = this.levelTable.find(r => r.level === newLevel);
            ChatMessage.create({
                content: `🎉 ${actor.name} reached <strong>${this.label} ${newLevel}</strong>! Crafting bonus is now +${row?.bonus ?? 0}.`,
                speaker: ChatMessage.getSpeaker({ actor }),
            });
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
