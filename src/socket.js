// ============================================================
// WITA — SOCKET REGISTRATION
// Registers the socketlib socket and exposes the GM-authority
// executeLootAndHarvest handler for cross-client invocation.
// ============================================================
import { witaPromptGatherEnvironment } from "./professions/crafters/potion/ui/gathering-dialog.js";

const _SOCKET_SETTING_ALLOWLIST = new Set([
    "bastion", "bastionState", "guildhallQuests", "guildhallConfig", "bastionReports",
]);

export function registerSocket(executeLootAndHarvest) {
    Hooks.once("socketlib.ready", () => {
        const socket = socketlib.registerModule("wita");
        socket.register("executeLootAndHarvest", executeLootAndHarvest);
        socket.register("witaSelectGatherEnv", witaPromptGatherEnvironment);
        socket.register("witaSetSetting", (key, value) => {
            if (!_SOCKET_SETTING_ALLOWLIST.has(key))
                throw new Error(`WITA | Socket: setting '${key}' not in allowlist.`);
            return game.settings.set("wita", key, value);
        });
        globalThis.WITA = { socket };
        console.log("WITA | Whispers in the Abyss module ready.");
    });
}

/**
 * Set a world setting, routing through GM socket when called by a non-GM.
 * Replaces direct game.settings.set("wita", key, value) for mutable game state.
 */
export async function witaSaveSettingAsGM(key, value) {
    if (game.user.isGM) return game.settings.set("wita", key, value);
    return globalThis.WITA?.socket?.executeAsGM("witaSetSetting", key, value);
}
