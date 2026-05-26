// ============================================================
// WITA — POTION BREWING SETTINGS
// All runtime data lives on actor flags under the "wita" namespace.
// This window is read-only informational.
// ============================================================
import { WITAConfigBase } from "./settings-base.js";

export const WITA_POTION_SETTINGS = [];

// TODO(v14): migrate to ApplicationV2
export class WITAPotionConfig extends WITAConfigBase {
    static DEFAULT_OPTIONS = {
        window:   { resizable: false, title: "⚗️ WITA — Potion Brewing" },
        id:       "wita-potion-config",
        position: { width: 480, height: "auto" },
    };

    get fields() {
        return [
            { type: "section", label: "Craft Level Gates" },
            {
                type: "info",
                html: `
                    <p style="font-size:12px;color:var(--color-text-light-6);margin:0 0 0.4rem">
                        Players may attempt to craft potions above their Craft Level
                        but receive a <strong>−5 penalty</strong> to their roll. On failure,
                        they roll 1d2: on a <strong>1</strong> ingredients are lost; on a
                        <strong>2</strong> ingredients are returned.
                    </p>
                    <table style="font-size:12px;width:100%;border-collapse:collapse">
                        <tr style="border-bottom:1px solid var(--color-border-light-2)">
                            <th style="text-align:left;padding:2px 4px">Rarity</th>
                            <th style="text-align:left;padding:2px 4px">Min Craft Level</th>
                        </tr>
                        <tr><td style="padding:2px 4px">Common</td><td style="padding:2px 4px">1</td></tr>
                        <tr><td style="padding:2px 4px">Uncommon</td><td style="padding:2px 4px">3</td></tr>
                        <tr><td style="padding:2px 4px">Rare</td><td style="padding:2px 4px">6</td></tr>
                        <tr><td style="padding:2px 4px">Very Rare</td><td style="padding:2px 4px">9</td></tr>
                    </table>
                `,
            },
            { type: "section", label: "Dependency" },
            {
                type: "info",
                html: `<p style="font-size:12px;color:var(--color-text-light-6);margin:0">
                    Item data (ingredients, recipes) is sourced from the
                    <strong>potion-crafting-and-gathering</strong> module by theripper93.
                    All actor data is stored under the <strong>wita</strong> flag namespace.
                    Recipe knowledge is sourced from <strong>SC - The Cauldron</strong>
                    via Item Piles merchant purchases.
                </p>`,
            },
        ];
    }

    async _updateObject() {}
}
