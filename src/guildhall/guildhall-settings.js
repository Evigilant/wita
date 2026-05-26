// ============================================================
// WITA Guildhall — guildhall-settings.js
// Settings registration integrated into wita module
// ============================================================

export function registerGuildhallSettings() {
    // Quest data store — keyed under wita namespace
    game.settings.register("wita", "guildhallQuests", {
        name:    "Guildhall Quests",
        scope:   "world",
        config:  false,
        type:    Array,
        default: [],
    });

    game.settings.register("wita", "guildhallConfig", {
        name:    "Guildhall Configuration",
        scope:   "world",
        config:  false,
        type:    Object,
        default: {},
    });

    game.settings.register("wita", "questBoardActorId", {
        name:    "Quest Board Actor",
        hint:    "Actor ID of the NPC that opens the Quest Board when interacted with.",
        scope:   "world",
        config:  true,
        type:    String,
        default: "",
    });

    game.settings.register("wita", "maxHirelingsOverride", {
        name:    "Max Hirelings Out (Override)",
        hint:    "Leave 0 to derive from Guildhall facility size. Set to override.",
        scope:   "world",
        config:  true,
        type:    Number,
        default: 0,
    });

    game.settings.register("wita", "maxActiveQuestsOverride", {
        name:    "Max Active Quests (Override)",
        hint:    "Leave 0 to derive from Guildhall facility size. Set to override.",
        scope:   "world",
        config:  true,
        type:    Number,
        default: 0,
    });
}
