// ============================================================
// WITA — SETTINGS ORCHESTRATOR
// Registers all settings from descriptor arrays, registers
// feature toggles and internal state, then injects the main
// settings panel via renderSettingsConfig hook.
// ============================================================
import { WITACoreConfig,     WITA_CORE_SETTINGS     } from "./core-settings.js";
import { WITABastionConfig,  WITA_BASTION_SETTINGS  } from "./bastion-settings.js";
import { WITAFinancialConfig, WITA_FINANCIAL_SETTINGS } from "./financial-settings.js";
import { WITACombatConfig,   WITA_COMBAT_SETTINGS   } from "./combat-settings.js";
import { WITAPotionConfig,   WITA_POTION_SETTINGS   } from "./potion-settings.js";

// ── Register All Settings ──────────────────────────────────────
Hooks.once("init", () => {

    // Placeholder so the WITA category appears in the settings list
    game.settings.register("wita", "_placeholder", {
        scope: "world", config: true, type: Boolean, default: false, name: " ", hint: " ",
    });

    // Feature toggles
    for (const [key, def] of [
        ["enableBastionAutomation", true],
        ["enableFinancialSystem",   true],
        ["enableCombatLogging",     true],
        ["enablePotionBrewing",     true],
    ]) {
        game.settings.register("wita", key, { scope: "world", config: false, type: Boolean, default: def });
    }

    // Descriptor-array settings
    for (const s of [
        ...WITA_CORE_SETTINGS,
        ...WITA_BASTION_SETTINGS,
        ...WITA_FINANCIAL_SETTINGS,
        ...WITA_COMBAT_SETTINGS,
        ...WITA_POTION_SETTINGS,
    ]) {
        game.settings.register("wita", s.key, {
            scope: "world", config: false, type: s.type, default: s.default,
        });
    }

    // Internal bastion state
    game.settings.register("wita", "bastionState", {
        scope: "world",
        config: false,
        default: { longRestCount: 0, turnNumber: 0, pendingFluctuationType: null },
    });

    console.log("WITA | Settings registered.");
});

// ── Settings Accessor ──────────────────────────────────────────
export function witaSetting(key) {
    return game.settings.get("wita", key);
}

// ── Inject Main Panel UI ───────────────────────────────────────
Hooks.on("renderSettingsConfig", (app, html) => {
    if (!game.user.isGM) return;

    // v13+: html is a plain HTMLElement; earlier versions wrap it in jQuery
    const root = html instanceof HTMLElement ? html : html[0];
    const section = root.querySelector(`section[data-category="wita"]`);
    if (!section) return;

    section.querySelectorAll(".form-group").forEach(el => el.remove());

    const enableBastion   = witaSetting("enableBastionAutomation");
    const enableFinancial = witaSetting("enableFinancialSystem");
    const enableCombat    = witaSetting("enableCombatLogging");
    const enablePotion    = witaSetting("enablePotionBrewing");

    const panel = document.createElement("div");
    panel.innerHTML = `
        <div class="wita-settings-panel">
            <div class="form-group wita-full-btn">
                <button type="button" class="wita-btn" data-window="core">⚙️ Core Configuration</button>
            </div>
            <hr class="wita-hr">
            <div class="form-group wita-toggle-row">
                <label class="wita-toggle-label">
                    <input type="checkbox" class="wita-toggle" data-key="enableBastionAutomation" ${enableBastion ? "checked" : ""}>
                    Enable Bastion Automation
                </label>
                <button type="button" class="wita-btn wita-icon-btn" data-window="bastion">🏰</button>
            </div>
            <div class="form-group wita-toggle-row">
                <label class="wita-toggle-label">
                    <input type="checkbox" class="wita-toggle" data-key="enableFinancialSystem" ${enableFinancial ? "checked" : ""}>
                    Enable Financial System
                </label>
                <button type="button" class="wita-btn wita-icon-btn" data-window="financial">💰</button>
            </div>
            <div class="form-group wita-toggle-row">
                <label class="wita-toggle-label">
                    <input type="checkbox" class="wita-toggle" data-key="enableCombatLogging" ${enableCombat ? "checked" : ""}>
                    Enable Combat Logging
                </label>
                <button type="button" class="wita-btn wita-icon-btn" data-window="combat">⚔️</button>
            </div>
            <div class="form-group wita-toggle-row">
                <label class="wita-toggle-label">
                    <input type="checkbox" class="wita-toggle" data-key="enablePotionBrewing" ${enablePotion ? "checked" : ""}>
                    Enable Potion Brewing
                </label>
                <button type="button" class="wita-btn wita-icon-btn" data-window="potion">⚗️</button>
            </div>
        </div>
        <style>
            .wita-settings-panel { padding: 0.25rem 0.5rem 0.5rem; }
            .wita-hr { margin: 0.5rem 0; border-color: var(--color-border-light-2); }
            .wita-full-btn { margin-bottom: 0.5rem; }
            .wita-btn {
                background: var(--color-bg-btn);
                border: 1px solid var(--color-border-light-2);
                border-radius: 4px;
                padding: 0.35rem 0.7rem;
                cursor: pointer;
                font-size: 13px;
                width: 100%;
            }
            .wita-btn:hover { background: var(--color-bg-btn-hover); }
            .wita-toggle-row { display:flex;align-items:center;justify-content:space-between;gap:0.5rem;margin-bottom:0.35rem; }
            .wita-toggle-label { display:flex;align-items:center;gap:0.4rem;font-size:13px;cursor:pointer;flex:1;margin:0; }
            .wita-icon-btn { width:auto !important;padding:0.25rem 0.55rem !important;font-size:15px !important;flex-shrink:0; }
        </style>
    `;
    section.append(panel);

    panel.querySelectorAll(".wita-toggle").forEach(el => {
        el.addEventListener("change", async (e) => {
            const key     = e.currentTarget.dataset.key;
            const enabled = e.currentTarget.checked;
            await game.settings.set("wita", key, enabled);
            ui.notifications.info(
                `WITA | ${key.replace("enable", "").replace(/([A-Z])/g, " $1").trim()} ${enabled ? "enabled" : "disabled"}.`
            );
        });
    });

    panel.querySelectorAll(".wita-btn[data-window]").forEach(el => {
        el.addEventListener("click", (e) => {
            switch (e.currentTarget.dataset.window) {
                case "core":      new WITACoreConfig().render(true);      break;
                case "bastion":   new WITABastionConfig().render(true);   break;
                case "financial": new WITAFinancialConfig().render(true); break;
                case "combat":    new WITACombatConfig().render(true);    break;
                case "potion":    new WITAPotionConfig().render(true);    break;
            }
        });
    });
});
