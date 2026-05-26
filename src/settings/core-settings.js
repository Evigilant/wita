// ============================================================
// WITA — CORE SETTINGS
// Settings for: Loot & Harvest, Party, Bastion identity
// ============================================================
import { WITAConfigBase } from "./settings-base.js";

export const WITA_CORE_SETTINGS = [
    { key: "harvesterPackId",          type: String, default: "wita.wita-harvester" },
    { key: "harvestItemsPackId",       type: String, default: "wita.wita-harvest-items" },
    { key: "lootTablePrefix",          type: String, default: "Generate Loot CR" },
    { key: "partyActorId",             type: String, default: "DCLpjkoEgT2owczH" },
    { key: "bastionPartyName",         type: String, default: "Claw & Order" },
    { key: "bastionJournalName",       type: String, default: "Von Valancius Bastion" },
    { key: "bastionConfigJournalName", type: String, default: "⚙️ Bastion Config" },
    { key: "bastionLocation",          type: String, default: "Fields of the Dead" },
];

// TODO(v14): migrate to ApplicationV2
export class WITACoreConfig extends WITAConfigBase {
    static DEFAULT_OPTIONS = {
        window:   { resizable: false, title: "⚙️ WITA — Core Configuration" },
        id:       "wita-core-config",
        position: { width: 480, height: "auto" },
    };

    get fields() {
        return [
            { type: "section", label: "Loot & Harvest" },
            {
                key: "harvesterPackId",
                label: "Harvester Pack ID",
                type: "String",
                hint: "Compendium pack ID for Harvester roll tables. Format: module.packname",
            },
            {
                key: "harvestItemsPackId",
                label: "Harvest Items Pack ID",
                type: "String",
                hint: "Compendium pack ID for harvest item documents. Format: module.packname",
            },
            {
                key: "lootTablePrefix",
                label: "Loot Table Name Prefix",
                type: "String",
                hint: "Prefix for CR-based Generate Loot world tables. CR suffix appended automatically.",
            },

            { type: "section", label: "Party" },
            {
                key: "partyActorId",
                label: "Party Actor ID",
                type: "String",
                hint: "ID of the party group actor sheet. Used to identify friendly combatants in combat logs.",
            },
            {
                key: "bastionPartyName",
                label: "Party Name",
                type: "String",
                hint: "Name of the adventuring party. Used in Seneschal reports.",
            },

            { type: "section", label: "Bastion" },
            {
                key: "bastionJournalName",
                label: "Bastion Journal Name",
                type: "String",
                hint: "Seneschal report journal. Created automatically if missing.",
            },
            {
                key: "bastionConfigJournalName",
                label: "Bastion Config Journal Name",
                type: "String",
                hint: "GM-only config journal for facilities and events. Created automatically if missing.",
            },
            {
                key: "bastionLocation",
                label: "Bastion Location",
                type: "String",
                hint: "Location of the bastion. Used in Seneschal reports.",
            },
        ];
    }
}
