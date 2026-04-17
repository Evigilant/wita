// ============================================================
// WITA — SOCKET REGISTRATION
// Registers the socketlib socket and exposes the GM-authority
// executeLootAndHarvest handler for cross-client invocation.
// ============================================================
import { witaPromptGatherEnvironment } from "./crafting/potion/gathering-dialog.js";

export function registerSocket(executeLootAndHarvest) {
    Hooks.once("socketlib.ready", () => {
        const socket = socketlib.registerModule("wita");
        socket.register("executeLootAndHarvest", executeLootAndHarvest);
        socket.register("witaSelectGatherEnv", witaPromptGatherEnvironment);
        globalThis.WITA = { socket };
        console.log("WITA | Whispers in the Abyss module ready.");
    });
}
