// ============================================================
// WITA — COMBAT LOG SETTINGS
// Settings for: Combat logging
// ============================================================
import { WITAConfigBase } from "./settings-base.js";

export const WITA_COMBAT_SETTINGS = [
    { key: "combatLogJournalName",       type: String, default: "⚔️ Combat Log" },
    { key: "combatLogMaxDetailedRounds", type: Number, default: 2 },
];

// TODO(v14): migrate to ApplicationV2
export class WITACombatConfig extends WITAConfigBase {
    static DEFAULT_OPTIONS = {
        window:   { resizable: false, title: "⚔️ WITA — Combat Logging" },
        id:       "wita-combat-config",
        position: { width: 440, height: "auto" },
    };

    get fields() {
        return [
            {
                key: "combatLogJournalName",
                label: "Combat Log Journal Name",
                type: "String",
                hint: "Master journal for all combat encounter logs. Created automatically if missing.",
            },
            {
                key: "combatLogMaxDetailedRounds",
                label: "Max Detailed Combat Rounds",
                type: "Number",
                min: 1, max: 10, step: 1,
                hint: "Full round logs to keep per encounter before archiving older rounds into the summary.",
            },
        ];
    }
}
