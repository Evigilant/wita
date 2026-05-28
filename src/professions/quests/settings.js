// ============================================================
// WITA Guildhall — guildhall-settings.js
// Data store settings only — UI settings are in bastion-settings.js
// ============================================================

export function registerGuildhallSettings() {
    // Quest data store
    game.settings.register("wita", "guildhallQuests", {
        name:    "Guildhall Quests",
        scope:   "world",
        config:  false,
        type:    Array,
        default: [],
    });

    // Guildhall config store
    game.settings.register("wita", "guildhallConfig", {
        name:    "Guildhall Configuration",
        scope:   "world",
        config:  false,
        type:    Object,
        default: {},
    });

    // NOTE: questBoardActorId, maxHirelingsOverride, maxActiveQuestsOverride
    // are registered by WITA_BASTION_SETTINGS in bastion-settings.js
    // and displayed in the WITABastionConfig panel under "Guildhall & Quest Board"
}
