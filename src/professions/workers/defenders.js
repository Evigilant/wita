// ============================================================
// WITA — DEFENDER ROSTER
// ============================================================

import { sanitizeHTML }                    from "../../core/utils.js";
import { getBastionData, saveBastionData } from "../../bastion/data/data.js";

export async function addDefender(name) {
    if (!game.user.isGM) return;
    const data = getBastionData();
    data.defenders = [...(data.defenders ?? []), {
        id:      foundry.utils.randomID(8),
        name:    sanitizeHTML(name ?? `Defender ${(data.defenders?.length ?? 0) + 1}`),
        alive:   true,
        rank:    "recruit",
        guardXP: 0,
    }];
    await saveBastionData(data);
}

export async function removeDefender(defenderId) {
    if (!game.user.isGM) return;
    const data = getBastionData();
    data.defenders = (data.defenders ?? []).filter(d => d.id !== defenderId);
    await saveBastionData(data);
}

export async function updateDefender(defenderId, updates) {
    if (!game.user.isGM) return;
    const data = getBastionData();
    const d    = (data.defenders ?? []).find(d => d.id === defenderId);
    if (!d) return;
    if (updates.name              !== undefined) d.name              = sanitizeHTML(updates.name);
    if (updates.rank              !== undefined) d.rank              = updates.rank;
    if (updates.alive             !== undefined) d.alive             = updates.alive;
    if (updates.guardXP           !== undefined) d.guardXP           = updates.guardXP;
    if (updates.primaryProfession !== undefined) d.primaryProfession = updates.primaryProfession || null;
    await saveBastionData(data);
}

export async function setDefenderAlive(defenderId, alive) {
    if (!game.user.isGM) return;
    const data = getBastionData();
    const d    = (data.defenders ?? []).find(d => d.id === defenderId);
    if (d) { d.alive = alive; await saveBastionData(data); }
}

export function liveDefenderCount(data) {
    return (data.defenders ?? []).filter(d => d.alive).length;
}
