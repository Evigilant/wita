// ============================================================
// WITA — BASTION SETTINGS
// Settings for: Bastion automation (rests, reports, AI)
// ============================================================
import { WITAConfigBase } from "./settings-base.js";

export const WITA_BASTION_SETTINGS = [
    { key: "bastionName",              type: String, default: "Von Valancius Bastion"        },
    { key: "seneschalActorId",         type: String, default: ""                             },
    { key: "questBoardActorId",        type: String, default: ""                             },
    { key: "maxHirelingsOverride",     type: Number, default: 0                              },
    { key: "maxActiveQuestsOverride",  type: Number, default: 0                              },
    { key: "longRestsPerTurn",         type: Number, default: 7                              },
    { key: "maxDetailedReports",       type: Number, default: 2                              },
    { key: "anthropicApiKey",          type: String, default: ""                             },
    { key: "tierRoomyLimits",          type: String, default: '{"1":1,"2":2,"3":4}'          },
    { key: "tierVastLimits",           type: String, default: '{"1":0,"2":1,"3":2}'          },
    { key: "guildhallQuests",          type: Array,  default: []                             },
    { key: "guildhallConfig",          type: Object, default: {}                             },
];

// TODO(v14): migrate to ApplicationV2
export class WITABastionConfig extends WITAConfigBase {
    static DEFAULT_OPTIONS = {
        window:   { resizable: false, title: "🏰 WITA — Bastion Automation" },
        id:       "wita-bastion-config",
        position: { width: 440, height: "auto" },
    };
    get fields() {
        return [
            { type: "section", label: "General" },
            {
                key: "bastionName",
                label: "Bastion Name",
                type: "String",
                hint: "The name displayed in the Bastion Panel header and used to find the bastion journal.",
            },
            {
                key: "seneschalActorId",
                label: "Seneschal Actor ID / UUID",
                type: "String",
                hint: "Actor ID or full UUID of the Seneschal (e.g. Scene.xxx.Token.xxx.Actor.xxx). Players interacting with this actor open the Bastion panel in read-only mode.",
            },
            { type: "section", label: "Size Slot Limits (by Tier)" },
            {
                key: "tierRoomyLimits",
                label: "Max Roomy Slots per Tier (JSON)",
                type: "String",
                hint: "JSON object: {\"1\":1,\"2\":2,\"3\":4} — base Roomy slot count per tier before licenses.",
            },
            {
                key: "tierVastLimits",
                label: "Max Vast Slots per Tier (JSON)",
                type: "String",
                hint: "JSON object: {\"1\":0,\"2\":1,\"3\":2} — base Vast slot count per tier before licenses.",
            },
            {
                key: "longRestsPerTurn",
                label: "Long Rests Per Bastion Turn",
                type: "Number",
                min: 1, max: 30, step: 1,
                hint: "How many long rests trigger a bastion turn. Default 7 = one in-game week.",
            },
            { type: "section", label: "Guildhall & Quest Board" },
            {
                key: "questBoardActorId",
                label: "Quest Board Actor ID / UUID",
                type: "String",
                hint: "Actor ID or full UUID of the NPC that opens the Quest Board when interacted with.",
            },
            {
                key: "maxHirelingsOverride",
                label: "Max Hirelings Out (Override)",
                type: "Number",
                min: 0, max: 50, step: 1,
                hint: "Maximum hirelings dispatched simultaneously. Leave 0 to derive from Guildhall size (Cramped=4, Roomy=8, Vast=12).",
            },
            {
                key: "maxActiveQuestsOverride",
                label: "Max Active Quests (Override)",
                type: "Number",
                min: 0, max: 20, step: 1,
                hint: "Maximum quests active at once. Leave 0 to derive from Guildhall size (Cramped=2, Roomy=4, Vast=6).",
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
