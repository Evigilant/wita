// ============================================================
// WITA — BASTION SETTINGS
// Settings for: Bastion automation (rests, reports, AI)
// ============================================================
import { WITAConfigBase } from "./settings-base.js";

export const WITA_BASTION_SETTINGS = [
    { key: "longRestsPerTurn",   type: Number, default: 7  },
    { key: "maxDetailedReports", type: Number, default: 2  },
    { key: "anthropicApiKey",    type: String, default: "" },
];

// TODO(v14): migrate to ApplicationV2
export class WITABastionConfig extends WITAConfigBase {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            title: "🏰 WITA — Bastion Automation",
            id: "wita-bastion-config",
            width: 440,
        });
    }

    get fields() {
        return [
            { type: "section", label: "Rests" },
            {
                key: "longRestsPerTurn",
                label: "Long Rests Per Bastion Turn",
                type: "Number",
                min: 1, max: 30, step: 1,
                hint: "How many long rests trigger a bastion turn. Default 7 = one in-game week.",
            },

            { type: "section", label: "Reports" },
            {
                key: "maxDetailedReports",
                label: "Max Detailed Bastion Reports",
                type: "Number",
                min: 1, max: 10, step: 1,
                hint: "Detailed Seneschal reports to keep before archiving older ones into the Summary page.",
            },
            {
                key: "anthropicApiKey",
                label: "Anthropic API Key",
                type: "String",
                password: true,
                hint: "From console.anthropic.com — used for AI-generated asset narratives. Format: sk-ant-api03-...",
            },
        ];
    }
}
