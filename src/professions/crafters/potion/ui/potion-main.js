// ============================================================
// WITA — POTION BREWING ENTRY POINT
// Registers actor sheet buttons, token context menu,
// chat commands, and SC Cauldron EXP integration.
// All behaviour is guarded by the enablePotionBrewing setting.
// Requires: potion-crafting-and-gathering (content module)
// ============================================================
import { witaSetting } from "../../../../settings/settings.js";
import { WITA_POTION_CRAFTING, WITA_POTION_EXP_TABLE } from "../data/potion-config.js";
import { WITACompendiumLoader } from "../data/compendium-loader.js";
import { WITABrewingDialog } from "./brewing-dialog.js";
import { WITAGatheringDialog, witaResetNatureChecks } from "./gathering-dialog.js";
import { WITAPotionLevelSheet } from "./potion-level-sheet.js";

// ── Ready ─────────────────────────────────────────────────────
Hooks.once("ready", () => {
    if (!witaSetting("enablePotionBrewing")) return;

    console.log("WITA | Potion Brewing ready.");

    if (!WITACompendiumLoader.isDepReady()) {
        ui.notifications.error(
            "WITA Potion Brewing: The required module 'Potion Crafting & Gathering' is not active. Please install and enable it.",
            { permanent: true }
        );
    }
});

// ── Token right-click context ──────────────────────────────────
Hooks.on("getTokenContextOptions", (html, options) => {
    if (!witaSetting("enablePotionBrewing")) return;
    options.push(
        {
            name: "Gather Ingredients",
            icon: '<i class="fas fa-leaf"></i>',
            condition: li => canvas.tokens.get(li.data("tokenId"))?.actor?.type === "character",
            callback: li => {
                const a = canvas.tokens.get(li.data("tokenId"))?.actor;
                if (a) new WITAGatheringDialog(a).render(true);
            },
        },
        {
            name: "Crafting",
            icon: '<i class="fas fa-mortar-pestle"></i>',
            condition: li => canvas.tokens.get(li.data("tokenId"))?.actor?.type === "character",
            callback: li => {
                const a = canvas.tokens.get(li.data("tokenId"))?.actor;
                if (a) new WITABrewingDialog(a).render(true);
            },
        },
    );
});

// ── SC Cauldron craft EXP integration ─────────────────────────
// Awards Craft EXP when a player successfully crafts via SC Cauldron.
// Rarity is read from the result item's dnd5e rarity field.
// Only awards if the crafting actor is the user's assigned character.
Hooks.on("sc-the-cauldron.recipeCrafted", async (data) => {
    if (!witaSetting("enablePotionBrewing")) return;

    const { sourceActorId, resultEntries } = data;
    if (!sourceActorId || !resultEntries?.length) return;

    const actor = game.actors.get(sourceActorId);
    if (!actor) return;

    if (game.user.character?.id !== actor.id) return;

    const firstResult = resultEntries[0];
    if (!firstResult?.uuid) return;

    const resultItem = await fromUuid(firstResult.uuid);
    const rawRarity  = resultItem?.system?.rarity ?? "common";

    const rarityMap = {
        "common":    "common",
        "uncommon":  "uncommon",
        "rare":      "rare",
        "veryRare":  "veryRare",
        "very rare": "veryRare",
        "legendary": "veryRare",
    };
    const expKey   = rarityMap[rawRarity] ?? "common";
    const expAward = WITA_POTION_EXP_TABLE.produced[expKey] ?? 0;
    if (!expAward) return;

    const recipeName = data.recipe?.name ?? firstResult.name ?? "unknown recipe";
    await WITA_POTION_CRAFTING.awardExp(actor, expAward, `crafting ${recipeName} (SC Cauldron)`);
});

// ── Long rest: reset nature check uses ────────────────────────
Hooks.on("dnd5e.restCompleted", (actor, result) => {
    if (!witaSetting("enablePotionBrewing")) return;
    if (result.longRest) witaResetNatureChecks(actor);
});

// ── Craft Level badge on actor sheet ──────────────────────────
// TODO(v14): html arg becomes HTMLElement in v14, not jQuery
Hooks.on("renderCharacterActorSheet", (sheet, html) => {
    if (!witaSetting("enablePotionBrewing")) return;

    const actor = sheet.document ?? sheet.actor;
    if (!actor || actor.type !== "character") return;
    if (!actor.isOwner) return;

    const root = html instanceof HTMLElement ? html : html[0];
    const { level, bonus, exp, next, curExp: curLevelExp, pct } = WITA_POTION_CRAFTING.getState(actor);

    // ── Header buttons (Craft Level, Brew, Gather) ───────────
    // ApplicationV2 controls use { action } strings — not hookable with onclick.
    // DOM injection into .window-header is the correct approach for v13.
    const header = root.querySelector(".window-header");
    if (header && !header.querySelector(".wita-brew-btn")) {
        const ellipsis = header.querySelector(".fa-ellipsis-vertical")?.closest("button");
        const mkBtn = (cssClass, tooltip, icon, handler) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = `header-control ${cssClass} icon`;
            btn.setAttribute("data-tooltip", tooltip);
            btn.innerHTML = `<i class="${icon}"></i>`;
            btn.addEventListener("click", handler);
            if (ellipsis) header.insertBefore(btn, ellipsis);
            else header.appendChild(btn);
        };
        mkBtn("wita-gather-btn", "Gather Ingredients", "fas fa-leaf",          () => new WITAGatheringDialog(actor).render(true));
        mkBtn("wita-brew-btn",   "Crafting",           "fas fa-mortar-pestle", () => new WITABrewingDialog(actor).render(true));
    }

    // ── Features tab craft pill ───────────────────────────────
    const classSection = root.querySelector("section.classes");
    if (classSection && !root.querySelector(".wita-craft-pill")) {
        const existingPill = classSection.querySelector(".pill-lg");
        const pillStyle    = existingPill ? window.getComputedStyle(existingPill) : null;
        const bgColor   = pillStyle?.backgroundColor ?? "rgb(37,40,48)";
        const shadow    = pillStyle?.boxShadow ?? "rgba(0,0,0,0.15) 0px 0px 12px 0px";
        const txtColor  = pillStyle?.color ?? "rgb(207,210,218)";
        const fontSize  = pillStyle?.fontSize ?? "13px";
        const fontFam   = pillStyle?.fontFamily ?? "\"Work Sans\",Arial,sans-serif";

        const sheetStyle  = window.getComputedStyle(root);
        const mutedColor  = sheetStyle.getPropertyValue("--color-form-hint").trim() || "rgb(150,153,161)";
        const accentColor = sheetStyle.getPropertyValue("--color-highlights").trim() || "cornflowerblue";

        const pill = document.createElement("div");
        pill.className = "wita-craft-pill pill-lg";
        pill.style.cssText = `background:${bgColor};box-shadow:${shadow};border-radius:5px;padding:8px;cursor:pointer;display:flex;align-items:center;gap:8px;font:500 ${fontSize} ${fontFam};color:${txtColor};min-width:120px;`;
        pill.setAttribute("data-tooltip", `Craft EXP: ${exp}${next ? ` / ${next} (${pct}%)` : " (Max)"}`);
        pill.innerHTML = `
            <div style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <i class="fa-solid fa-flask" style="font-size:14px;color:${txtColor}"></i>
            </div>
            <div style="display:flex;flex-direction:column;flex:1;min-width:0">
                <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:${mutedColor}">Craft</span>
                <div style="display:flex;align-items:baseline;gap:4px">
                    <span style="font-size:15px;font-weight:700">Lv ${level}</span>
                    <span style="font-size:11px;color:${mutedColor}">+${bonus}</span>
                </div>
                <div style="height:3px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;margin-top:3px">
                    <div style="width:${pct}%;height:100%;background:${accentColor};border-radius:2px"></div>
                </div>
            </div>
        `;
        pill.addEventListener("click", () => new WITAPotionLevelSheet(actor).render(true));
        classSection.appendChild(pill);
    }
});

// ── Chat commands ──────────────────────────────────────────────
Hooks.on("chatMessage", (log, message) => {
    if (!witaSetting("enablePotionBrewing")) return;
    const lower = message.trim().toLowerCase();
    const actor = _witaPotionSelected();
    if (lower === "/gather") {
        if (!actor) { ui.notifications.warn("Select a token first."); return false; }
        new WITAGatheringDialog(actor).render(true); return false;
    }
    if (lower === "/brew") {
        if (!actor) { ui.notifications.warn("Select a token first."); return false; }
        new WITABrewingDialog(actor).render(true); return false;
    }
    if (lower === "/craftlevel") {
        if (!actor) { ui.notifications.warn("Select a token first."); return false; }
        new WITAPotionLevelSheet(actor).render(true); return false;
    }
});

// ── Helpers ────────────────────────────────────────────────────
function _witaPotionSelected() {
    const controlled = canvas?.tokens?.controlled;
    return (controlled?.length === 1 ? controlled[0].actor : null) ?? game.user.character ?? null;
}

export function witaPotionOpen(actor, fn) {
    const a = actor ?? _witaPotionSelected();
    if (!a) return ui.notifications.warn("Select a token or actor first.");
    fn(a);
}
