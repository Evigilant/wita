// ============================================================
// WITA Guildhall — resolution.js
// Quest resolution at bastion turn
// ============================================================

import {
    MODULE_ID, PARTY_ACTOR_ID, GUILDHALL_ITEM_ID, GUILDHALL_CAPACITY,
    complexityDC, getOutcome, getHirelingHealthResult,
    OUTCOME, OUTCOME_LABELS,
} from "./config.js";
import { witaSetting } from "../../../core/utils.js";
import { getQuests, updateQuest, getGuildhallSettings } from "./quest-data.js";

// ── Capacity ──────────────────────────────────────────────────

export function getGuildhallSlot() {
    try {
        const data = game.settings.get("wita", "bastion") ?? {};
        const slots = [...(data.basicSlots ?? []), ...(data.specialSlots ?? [])];
        return slots.find(s => s.facilityItemId === GUILDHALL_ITEM_ID) ?? null;
    } catch { return null; }
}

export function getCapacity() {
    const settings = getGuildhallSettings();
    if (settings.maxHirelingsOverride) {
        return {
            maxActiveQuests:  settings.maxActiveQuestsOverride ?? 4,
            maxHirelingsOut:  settings.maxHirelingsOverride,
        };
    }
    const slot = getGuildhallSlot();
    const size = slot?.facilitySize ?? "cramped";
    return GUILDHALL_CAPACITY[size] ?? GUILDHALL_CAPACITY.cramped;
}

// ── Actor power rating ────────────────────────────────────────

function actorPowerRating(actor) {
    if (!actor) return 1;
    if (actor.type === "npc") {
        const cr = actor.system?.details?.cr ?? 0;
        // CR to approximate level: CR 1=1, CR 5=5, CR 10=10, CR 20=20 (close enough)
        return Math.max(1, Math.min(20, Math.round(cr)));
    }
    // PC — use character level
    return actor.system?.details?.level ?? actor.system?.attributes?.prof ?? 1;
}

// ── Resolution ────────────────────────────────────────────────

export async function resolveActiveQuests(turnNumber) {
    const activeQuests = getQuests().filter(q => q.status === "active");
    if (!activeQuests.length) return;

    for (const quest of activeQuests) {
        await resolveQuest(quest, turnNumber);
    }
}

export async function resolveQuest(quest, turnNumber) {
    const actors = quest.assignedActorIds
        .map(id => game.actors.get(id))
        .filter(Boolean);

    // ── Step 1: Quest roll ────────────────────────────────────
    const count      = actors.length;
    const avgMorale  = count > 0
        ? actors.reduce((s, a) => s + (a.getFlag?.("wita", "morale") ?? 70), 0) / count
        : 50;
    const avgPower   = count > 0
        ? actors.reduce((s, a) => s + actorPowerRating(a), 0) / count
        : 1;

    const dc         = complexityDC(quest.dangerLevel, quest.rewardLevel);
    const baseDie    = await new Roll("1d20").evaluate();
    const countMod   = count;                            // +1 per hireling
    const moraleMod  = Math.round(avgMorale / 20);       // morale 100=+5, 50=+2
    const powerMod   = Math.round(avgPower / 4);         // power 20=+5, 4=+1
    const total      = baseDie.total + countMod + moraleMod + powerMod;
    const outcome    = getOutcome(total, dc);
    const outcomeInfo = OUTCOME_LABELS[outcome];

    // ── Step 2: Hireling health rolls ─────────────────────────
    const hirelingResults = [];
    for (const actor of actors) {
        const advantage    = outcome === OUTCOME.CRIT_SUCCESS;
        const disadvantage = outcome === OUTCOME.CRIT_FAIL;

        let roll1 = (await new Roll("1d20").evaluate()).total;
        let finalRoll = roll1;

        if (advantage || disadvantage) {
            const roll2 = (await new Roll("1d20").evaluate()).total;
            finalRoll = advantage
                ? Math.max(roll1, roll2)
                : Math.min(roll1, roll2);
        }

        const health = getHirelingHealthResult(finalRoll);
        hirelingResults.push({ actor, roll: finalRoll, ...health });
    }

    // ── Step 3: Apply outcomes ────────────────────────────────
    const rewardDelivered = await applyRewards(quest, outcome);
    await applyHirelingResults(hirelingResults, outcome);

    const finalStatus = [OUTCOME.SUCCESS, OUTCOME.CRIT_SUCCESS, OUTCOME.PARTIAL].includes(outcome)
        ? "completed"
        : "failed";

    await updateQuest(quest.id, {
        status:  finalStatus,
        outcome: {
            type:            outcome,
            roll:            baseDie.total,
            modifiers:       { countMod, moraleMod, powerMod },
            total,
            dc,
            turnResolved:    turnNumber,
            hirelingResults: hirelingResults.map(r => ({
                actorId:   r.actor.id,
                actorName: r.actor.name,
                roll:      r.roll,
                status:    r.status,
                restWeeks: r.restWeeks,
                label:     r.label,
            })),
            rewardDelivered,
        },
    });

    // ── Step 4: Post chat message ─────────────────────────────
    await postResolutionChat(quest, {
        outcome, outcomeInfo, total, dc,
        countMod, moraleMod, powerMod, baseDie: baseDie.total,
        hirelingResults, rewardDelivered, finalStatus,
    });
}

// ── Reward delivery ───────────────────────────────────────────

async function applyRewards(quest, outcome) {
    const getsReward = [OUTCOME.SUCCESS, OUTCOME.CRIT_SUCCESS, OUTCOME.PARTIAL].includes(outcome);
    if (!getsReward) return false;

    const rewardMult = outcome === OUTCOME.PARTIAL ? 0.5 : 1;
    const partyActor = game.actors.get(PARTY_ACTOR_ID);
    if (!partyActor) return false;

    // Gold delivery via Item Piles
    if (quest.rewardGold > 0) {
        const gold = Math.floor(quest.rewardGold * rewardMult);
        await game.itempiles?.API?.addCurrencies(partyActor, { gp: gold }).catch(() => {});
    }

    // Item delivery via Item Piles
    if (quest.rewardItems?.length > 0) {
        const items = quest.rewardItems.map(r => ({
            uuid: r.uuid,
            quantity: Math.max(1, Math.floor((r.qty ?? 1) * rewardMult)),
        }));
        await game.itempiles?.API?.addItems(partyActor, items).catch(() => {});
    }

    return true;
}

// ── Hireling result application ───────────────────────────────

async function applyHirelingResults(results, outcome) {
    for (const r of results) {
        if (r.status === "Killed") {
            // Remove actor from world (GM confirmed this is intended)
            // We flag rather than delete — GM can review and delete manually
            await r.actor.setFlag(MODULE_ID, "questResult", {
                status: "Killed", turnKilled: (witaSetting("bastionState")?.turnNumber ?? 0),
            });
            continue;
        }

        // Update morale
        if (r.moraleBonus !== 0) {
            const currentMorale = r.actor.getFlag?.(MODULE_ID, "morale") ?? 70;
            const newMorale = Math.max(0, Math.min(100, currentMorale + r.moraleBonus));
            await r.actor.setFlag(MODULE_ID, "morale", newMorale);
        }

        // Mark injured status
        if (r.restWeeks > 0) {
            await r.actor.setFlag(MODULE_ID, "questResult", {
                status:    r.status,
                restWeeks: r.restWeeks,
                restUntilTurn: ((witaSetting("bastionState")?.turnNumber ?? 0)) + r.restWeeks,
            });
        } else {
            // Clear any previous injury flag
            await r.actor.unsetFlag(MODULE_ID, "questResult").catch(() => {});
        }
    }
}

// ── Chat message ──────────────────────────────────────────────

async function postResolutionChat(quest, data) {
    const { outcome, outcomeInfo, total, dc, countMod, moraleMod, powerMod,
            baseDie, hirelingResults, rewardDelivered, finalStatus } = data;

    const hirelingRows = hirelingResults.map(r => {
        const icon = r.status === "Killed"           ? "💀"
                   : r.status === "Severely Injured" ? "🤕"
                   : r.status === "Injured"          ? "🩹"
                   : r.roll === 20                   ? "⭐"
                   : "✅";
        return `<li>${icon} <strong>${r.actor.name}</strong> — ${r.label} (rolled ${r.roll})</li>`;
    }).join("");

    const rewardLine = rewardDelivered && (quest.rewardGold > 0 || quest.rewardItems?.length > 0)
        ? `<p><strong>Rewards</strong> delivered to party inventory.</p>`
        : quest.rewardNarrative?.length > 0
        ? `<p><strong>Rewards:</strong> ${quest.rewardNarrative.map(r => r.name).join(", ")}</p>`
        : "";

    const content = `
        <div style="font-family:var(--font-primary,Signika);padding:0.5rem">
            <h3 style="margin:0 0 0.4rem;color:${outcomeInfo.colour}">
                <i class="fas ${outcomeInfo.icon}"></i> ${outcomeInfo.label}
            </h3>
            <p style="margin:0 0 0.3rem;font-size:0.85rem">
                <strong>${quest.name}</strong>
            </p>
            <p style="font-size:0.78rem;color:var(--color-form-hint);margin:0 0 0.4rem">
                Roll: ${baseDie} + ${countMod} (count) + ${moraleMod} (morale) + ${powerMod} (power)
                = <strong>${total}</strong> vs DC <strong>${dc}</strong>
            </p>
            ${hirelingRows ? `<ul style="margin:0 0 0.4rem;padding-left:1.2rem;font-size:0.78rem">${hirelingRows}</ul>` : ""}
            ${rewardLine}
        </div>
    `;

    await ChatMessage.create({
        content,
        whisper: [],
        speaker: { alias: "Guildhall" },
    });
}
