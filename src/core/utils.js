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

console.log("WITA | Utils loaded.");
