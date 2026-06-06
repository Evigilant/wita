// ============================================================
// WITA — BASTION STATE
// Manages bastion turn state, long rest tracking,
// and the main runBastionTurn orchestration function.
// ============================================================
import { sanitizeHTML, getImperialDate } from "../../core/utils.js";
import { witaSetting } from "../../settings/settings.js";
import { getOrCreateBastionConfigJournal } from "./rollgen.js";
import { rollBastionEvent, processFacilities } from "./rollgen.js";
import { getFinancialSummary, deductBankFunds, getWorkerWagesSummary } from "./finance.js";
import { getBastionData, saveBastionData, allSlots } from "./data.js";
import {
    generateAssetNarratives,
    generateReportHTML,
    sendBastionActionMessage,
    saveReportToPanel,
} from "./journal.js";
import { checkAndCompleteConstruction } from "./slots.js";
import { applyMoraleTick } from "../../professions/workers/morale.js";
import { WITAWorkerProfession, awardDefenderXP } from "../../professions/workers/level.js";
import { getProfessionForFacility } from "../../professions/workers/config.js";

// ── Reentrancy guard ───────────────────────────────────────────
let WITA_BASTION_RUNNING = false;

// ── Rest debounce ──────────────────────────────────────────────
// dnd5e fires restCompleted once per character. A party long rest
// (all characters resting together) fires N hooks in the same tick
// but represents one day, not N days. Only the first fires counts.
let _restDebounceId = null;

async function _witaBastionRun(fn) {
    if (WITA_BASTION_RUNNING) return false;
    WITA_BASTION_RUNNING = true;
    try { await fn(); return true; }
    finally { WITA_BASTION_RUNNING = false; }
}

// ── State persistence ──────────────────────────────────────────
export async function getBastionState() {
    try {
        return game.settings.get("wita", "bastionState") ?? {
            longRestCount:          0,
            turnNumber:             0,
            pendingFluctuationType: null,
        };
    } catch (e) {
        console.warn("WITA | Could not read bastion state:", e);
        return { longRestCount: 0, turnNumber: 0, pendingFluctuationType: null };
    }
}

export async function saveBastionState(state) {
    if (game.user.isGM) return game.settings.set("wita", "bastionState", state);
    return globalThis.WITA?.socket?.executeAsGM("witaSetSetting", "bastionState", state);
}

// ── Long Rest Handler ──────────────────────────────────────────
export async function onLongRestCompleted(actor, result) {
    if (!result.longRest) return;
    if (!game.user.isGM) return;
    if (actor.type !== "character") return;
    if (!witaSetting("enableBastionAutomation")) return;

    if (_restDebounceId !== null) return;
    _restDebounceId = setTimeout(() => { _restDebounceId = null; }, 30000);

    console.log(`WITA | Long rest completed for ${sanitizeHTML(actor.name)} — counting as 1 day`);

    const state = await getBastionState();
    state.longRestCount = (state.longRestCount ?? 0) + 1;
    await saveBastionState(state);

    console.log(`WITA | Long rest count: ${state.longRestCount}/${witaSetting("longRestsPerTurn")}`);

    if (state.longRestCount >= witaSetting("longRestsPerTurn")) {
        await _witaBastionRun(async () => {
            state.longRestCount = 0;
            state.turnNumber    = (state.turnNumber ?? 0) + 1;
            await saveBastionState(state);
            await runBastionTurn(state.turnNumber);
        });
    }
}

// ── Hook registration ──────────────────────────────────────────
Hooks.on("dnd5e.restCompleted", onLongRestCompleted);

// ── Run Bastion Turn ───────────────────────────────────────────
export async function runBastionTurn(turnNumber) {
    console.log(`WITA | Running bastion turn #${turnNumber}`);

    try {
        // Complete any facilities whose construction timer has elapsed.
        const justBuilt = await checkAndCompleteConstruction(turnNumber);
        if (justBuilt.length) {
            ui.notifications.info(`WITA | Construction complete: ${justBuilt.join(", ")}.`);
        }

        const date       = getImperialDate() ?? "Unknown Date";
        const event      = rollBastionEvent();

        if (!event) {
            ui.notifications.error(`WITA | Bastion Turn #${turnNumber} failed — could not roll event. Check config journal.`);
            return;
        }

        const facilities = processFacilities();
        if (!facilities.length) {
            ui.notifications.error(`WITA | Bastion Turn #${turnNumber} failed — no facilities found. Check config journal.`);
            return;
        }

        const financialEnabled = witaSetting("enableFinancialSystem");
        const financial        = financialEnabled ? getFinancialSummary() : null;
        const narratives = financialEnabled ? await generateAssetNarratives(event, financial) : [];
        const reportHTML = generateReportHTML(turnNumber, date, event, facilities, financial, narratives);

        await saveReportToPanel(turnNumber, date, reportHTML, event, financial);

        const state = await getBastionState();
        state.pendingFluctuationType = event.fluctuationType;
        await saveBastionState(state);

        if (financialEnabled) {
            sendBastionActionMessage(turnNumber, event, financial);
        }

        // Award worker XP and apply morale ticks
        await _awardTurnXP(event, facilities);

        // Deduct worker wages
        if (financialEnabled) {
            const wages = getWorkerWagesSummary();
            if (wages.totalWeeklyWage > 0) {
                const currency = financial?.currency ?? "GP";
                const result   = await deductBankFunds(wages.totalWeeklyWage);
                const content  = result.success
                    ? `<p><strong>Worker Wages Paid:</strong> ${wages.totalWeeklyWage} ${currency} to ${wages.workers.length} hireling${wages.workers.length !== 1 ? "s" : ""}.</p>`
                    : `<p><strong>Worker Wages Overdue:</strong> ${wages.totalWeeklyWage} ${currency} due — shortfall of ${result.shortfall} ${currency}. Morale may suffer.</p>`;
                ChatMessage.create({
                    content,
                    whisper:  ChatMessage.getWhisperRecipients("GM"),
                    speaker:  { alias: "Seneschal" },
                });
            }
        }

        // Resolve active guildhall quests
        await game.wita?.guildhall?.resolveNow?.();

        // Resolve recruiter candidate pools
        await game.wita?.recruiter?.resolveNow?.(turnNumber);

        ui.notifications.info(`WITA | Bastion Turn #${turnNumber} complete. Check GM chat for instructions.`);
        console.log(`WITA | Bastion turn #${turnNumber} done. Report dated: ${date}`);

    } catch (e) {
        console.error(`WITA | Bastion turn #${turnNumber} failed:`, e);
        ui.notifications.error(`WITA | Bastion turn #${turnNumber} failed — check console (F12) for details.`);
    }
}

// ── Per-turn XP awards ────────────────────────────────────────

async function _awardTurnXP(event, facilityResults) {
    if (!game.user.isGM) return;
    const data    = getBastionData();
    const slots   = allSlots(data);
    const isCrisis = event?.categoryName === "Crisis";

    // Workers — award XP in their assigned facility's profession
    for (const worker of (data.workers ?? [])) {
        if (worker.status !== "Active") continue;
        const workerSlot = slots.find(s => (s.workerIds ?? []).includes(worker.id));
        const profKey    = workerSlot ? getProfessionForFacility(workerSlot.facilityName) : null;
        if (!profKey) continue;
        new WITAWorkerProfession(profKey).awardXP(worker, "bastionTurnActive", data);
    }

    // Apply morale ticks (mutates data.workers)
    applyMoraleTick(data, event, facilityResults);

    // Defenders — patrol XP on non-crisis turns, crisis survival XP on crisis
    for (const defender of (data.defenders ?? [])) {
        if (!defender.alive) continue;
        awardDefenderXP(defender, isCrisis ? "crisisSurvival" : "turnPatrol");
    }

    await saveBastionData(data);
}

// ── Debug Tools ────────────────────────────────────────────────
globalThis.WITA_BASTION = {

    triggerTurn: async () => {
        if (!game.user.isGM) { ui.notifications.warn("GM only."); return; }
        const ran = await _witaBastionRun(async () => {
            const state = await getBastionState();
            state.turnNumber = (state.turnNumber ?? 0) + 1;
            await saveBastionState(state);
            await runBastionTurn(state.turnNumber);
        });
        if (!ran) ui.notifications.warn("WITA | Bastion turn already running.");
    },

    getRestProgress: async () => {
        const state     = await getBastionState();
        const threshold = witaSetting("longRestsPerTurn");
        console.log("=== WITA Bastion Rest Progress ===");
        console.log(`Turn #${state.turnNumber} complete`);
        console.log(`Long rests: ${state.longRestCount ?? 0} / ${threshold}`);
        console.log(`Until next turn: ${Math.max(0, threshold - (state.longRestCount ?? 0))}`);
        if (state.pendingFluctuationType) {
            console.log(`Pending fluctuation: ${state.pendingFluctuationType}`);
        }
    },

    resetState: async () => {
        if (!game.user.isGM) return;
        await saveBastionState({ longRestCount: 0, turnNumber: 0, pendingFluctuationType: null });
        ui.notifications.info("WITA | Bastion state reset.");
    },

    getState: getBastionState,
};
