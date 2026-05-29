// ============================================================
// WITA — UTILS
// ============================================================
import { WITA_DRAGON_AGES } from "./config.js";

// Race condition lock — shared by loot.js and future systems
export const WITA_LOCKS = new Set();

// Fixes Math.ceil(0) bias bug in naive 1dN implementations
export function witaRoll(n) {
    return Math.floor(Math.random() * n) + 1;
}

export function sanitizeHTML(str) {
    if (str === null || str === undefined) return "";
    if (typeof str !== "string") str = String(str);
    if (typeof foundry !== "undefined" && foundry.utils?.escapeHTML) {
        return foundry.utils.escapeHTML(str);
    }
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function getImperialDate() {
    try {
        const cal = game.modules.get("wgtgm-mini-calendar");
        if (!cal?.active) return null;
        const api  = cal.api ?? globalThis.MiniCalendar;
        if (!api) return null;
        const date = api.currentDate?.() ?? api.getDate?.();
        if (!date) return null;
        return `${date.day} ${date.month} ${date.year}`;
    } catch (e) {
        console.warn("WITA | Could not get imperial date:", e);
        return null;
    }
}

/**
 * Returns a { top, left } position offset from the most relevant open WITA window,
 * so popup dialogs don't stack directly on top of their parent.
 * Reads from the actual DOM rect — ApplicationV2 position.top/left is unreliable
 * until the user drags the window. Call setPosition() with the result AFTER render.
 */
export function witaCascadePosition(parentAppId = "wita-bastion-panel") {
    const parent = foundry.applications.instances.get(parentAppId)
                ?? [...foundry.applications.instances.values()]
                      .find(a => a.id?.startsWith("wita-") && a.rendered);
    if (!parent) return {};

    // getBoundingClientRect is reliable regardless of how Foundry tracks position internally
    const rect = parent.element?.getBoundingClientRect?.();
    if (rect?.width > 0) {
        return {
            top:  Math.min(Math.max(rect.top  + 40, 20), window.innerHeight - 250),
            left: Math.min(Math.max(rect.left + 55, 20), window.innerWidth  - 350),
        };
    }

    // Fallback: use stored position object
    const { top, left } = parent.position ?? {};
    if (top !== undefined) {
        return {
            top:  Math.min(Math.max(top  + 40, 20), window.innerHeight - 250),
            left: Math.min(Math.max(left + 55, 20), window.innerWidth  - 350),
        };
    }

    return {};
}

export function normalizeName(name) {
    name = name.replace(/\bOrk\b/gi, "Orc");
    const words = name.split(" ");
    if (words[words.length - 1] === "Dragon" && WITA_DRAGON_AGES.includes(words[0])) {
        const age   = words[0];
        const color = words.slice(1, -1).join(" ");
        return `${age} Dragon, ${color}`;
    }
    return name;
}

export function isDefeated(token) {
    const hp    = token.actor?.system?.attributes?.hp?.value;
    const isDead = token.actor?.statuses?.has("dead");
    return hp === 0 || isDead;
}

export function whisperMessage(content, userId) {
    const gmId = game.users.find(u => u.isGM && u.active)?.id;
    ChatMessage.create({
        content,
        speaker: { alias: "Whispers in the Abyss" },
        whisper: [userId, gmId].filter(Boolean),
    });
}

export function rollEquipmentFate(cr) {
    const roll = witaRoll(6);
    let destroyedMax, salvageableMax;
    if      (cr < 4)  { destroyedMax = 3; salvageableMax = 5; }
    else if (cr < 10) { destroyedMax = 2; salvageableMax = 4; }
    else if (cr < 16) { destroyedMax = 1; salvageableMax = 3; }
    else              { destroyedMax = 0; salvageableMax = 2; }

    if (roll <= destroyedMax)   return { result: "destroyed",   roll };
    if (roll <= salvageableMax) return { result: "salvageable", roll };
    return { result: "intact", roll };
}

export function witaSetting(key) {
   return game.settings.get("wita", key);
}

console.log("WITA | Utils loaded.");

/**
 * Get the text color for a rarity from SC Item Rarity Colors module settings.
 * Falls back to null if the module isn't active or the setting is disabled.
 * rarity: "common" | "uncommon" | "rare" | "veryrare" | "legendary"
 */
export function getRarityColor(rarity) {
    try {
        if (!game.modules.get("sc-item-rarity-colors")?.active) return null;
        // SC uses "veryRare" not "veryrare"
        const key = rarity === "veryrare" ? "veryRare" : rarity;
        const enabled = game.settings.get("sc-item-rarity-colors", `${key}-enable-text-color`);
        if (!enabled) return null;
        return game.settings.get("sc-item-rarity-colors", `${key}-text-color`) ?? null;
    } catch { return null; }
}