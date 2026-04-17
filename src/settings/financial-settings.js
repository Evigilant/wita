// ============================================================
// WITA — FINANCIAL SETTINGS
// Settings for: Financial System integration
// ============================================================
import { WITAConfigBase } from "./settings-base.js";

export const WITA_FINANCIAL_SETTINGS = [
    { key: "bankerActorId", type: String, default: "5AkN1RG1IeKNymXy" },
    { key: "economyId",     type: String, default: "soa09mHQZfiys5AK" },
];

// TODO(v14): migrate to ApplicationV2
export class WITAFinancialConfig extends WITAConfigBase {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            title: "💰 WITA — Financial System",
            id: "wita-financial-config",
            width: 440,
        });
    }

    get fields() {
        return [
            {
                key: "bankerActorId",
                label: "Banker Actor ID",
                type: "String",
                hint: "Actor ID of the bastion banker. Used to read Financial System property and stock data.",
            },
            {
                key: "economyId",
                label: "Financial System Economy ID",
                type: "String",
                hint: "Economy ID from the Financial System module. Run: game.settings.get('financial-system', 'economies')[0].id in the console to find it.",
            },
        ];
    }
}
