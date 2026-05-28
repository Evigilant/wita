import { sanitizeHTML, getRarityColor } from "../../core/utils.js";
import { WITA_WORKER_STATUSES, getFacilityRoles } from "../data/data.js";
import { WITA_WORKER_PROFESSIONS, WITA_DEFENDER_RANKS } from "../data/workers/professions/config.js";
import { WITAWorkerProfession } from "../data/workers/professions/level.js";

export function moraleChip(morale) {
    const level = morale >= 80 ? "high" : morale >= 60 ? "mid" : "low";
    return `<span class="wita-detail-hireling-morale" data-level="${level}">♥ ${morale}</span>`;
}

export function rarityBadge(rarity, label) {
    const c = getRarityColor(rarity);
    const style = c ? `color:${c};border-color:${c}` : "";
    return `<span class="wita-smithy-rarity-badge" style="${style}">${sanitizeHTML(label)}</span>`;
}

// Full label for popup/detail views
export function timeLabel(restsLeft, hasOrder) {
    if (!hasOrder) return "";
    return restsLeft === 0
        ? `<span style="color:var(--color-level-success);font-weight:600">✓ Ready this turn</span>`
        : `<span style="color:var(--color-highlights);font-weight:600">~${restsLeft} day${restsLeft !== 1 ? "s" : ""}</span>`;
}

// Compact label for slot cards
export function timeLabelCompact(restsLeft, hasOrder) {
    if (!hasOrder) return "";
    return restsLeft === 0
        ? `<span style="color:var(--color-level-success);font-size:0.65rem">✓ This turn</span>`
        : `<span style="color:var(--color-form-hint);font-size:0.65rem">~${restsLeft}d</span>`;
}

/**
 * Small chip showing a worker's primary profession title + level.
 * Returns empty string if worker has no primaryProfession set.
 */
export function professionChip(worker) {
    const key = worker?.primaryProfession;
    if (!key || !WITA_WORKER_PROFESSIONS[key]) return "";
    const cfg  = WITA_WORKER_PROFESSIONS[key];
    const prof = new WITAWorkerProfession(key);
    const { level, title } = prof.getState(worker);
    return `<span class="wita-prof-chip" title="${cfg.label} Lv${level}">
        <i class="${cfg.icon}"></i> ${title} Lv${level}
    </span>`;
}

/**
 * Colored rank badge for a defender (Recruit / Soldier / Veteran).
 */
export function rankBadge(defender) {
    const rank  = defender?.rank ?? "recruit";
    const row   = WITA_DEFENDER_RANKS.find(r => r.rank === rank) ?? WITA_DEFENDER_RANKS[0];
    const color = rank === "veteran" ? "var(--color-level-warning,#e8a23a)"
                : rank === "soldier" ? "var(--color-highlights,cornflowerblue)"
                : "var(--color-form-hint)";
    return `<span class="wita-rank-badge" style="color:${color};font-size:0.65rem;font-weight:700">${row.label}</span>`;
}

export function buildRoleFieldHTML(facilityName, currentRole) {
    const roles = getFacilityRoles(facilityName);
    const inputStyle = "font-size:0.78rem;padding:0.2rem 0.35rem;border:1px solid var(--color-fieldset-border);border-radius:3px";
    if (roles.length) {
        const hasCustom = currentRole && !roles.includes(currentRole);
        const opts = [
            `<option value="">— Unset —</option>`,
            ...roles.map(r => `<option value="${r}" ${currentRole === r ? "selected" : ""}>${r}</option>`),
            hasCustom ? `<option value="${sanitizeHTML(currentRole)}" selected>${sanitizeHTML(currentRole)}</option>` : "",
        ].join("");
        return `<select name="role" style="${inputStyle}">${opts}</select>`;
    }
    return `<input type="text" name="role" value="${sanitizeHTML(currentRole ?? "")}" placeholder="Flavor description" style="${inputStyle}">`;
}

export function buildWorkerFormHTML(worker, slots, curSlot) {
    const slotOpts = slots.map(s =>
        `<option value="${s.id}" ${curSlot === s.id ? "selected" : ""}>${sanitizeHTML(s.facilityName ?? "")}</option>`
    ).join("");
    const statusOpts = WITA_WORKER_STATUSES.map(st =>
        `<option value="${st}" ${(worker?.status ?? "Active") === st ? "selected" : ""}>${st}</option>`
    ).join("");
    const profOpts = Object.entries(WITA_WORKER_PROFESSIONS).map(([key, cfg]) =>
        `<option value="${key}" ${(worker?.primaryProfession ?? "") === key ? "selected" : ""}>${cfg.label}</option>`
    ).join("");
    const curFacilityName = slots.find(s => s.id === curSlot)?.facilityName ?? "";
    const roleField = buildRoleFieldHTML(curFacilityName, worker?.role ?? "");
    return `
        <div style="display:flex;flex-direction:column;gap:0.5rem;padding:0.25rem;font-family:var(--font-primary)">
            <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                Name <input type="text" name="name" value="${sanitizeHTML(worker?.name ?? "")}" placeholder="Hireling name"
                      style="font-size:0.8rem;padding:0.2rem 0.35rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
            </label>
            <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                Role <div class="wita-role-field-wrap">${roleField}</div>
            </label>
            <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                Primary Profession
                <select name="primaryProfession" style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                    <option value="">— None —</option>${profOpts}
                </select>
            </label>
            <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                Facility <select name="slotId" style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                    <option value="">— Unassigned —</option>${slotOpts}
                </select>
            </label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem">
                <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                    Status <select name="status" style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">${statusOpts}</select>
                </label>
                <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                    Morale <input type="number" name="morale" min="0" max="100" value="${worker?.morale ?? 70}"
                            style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                </label>
            </div>
        </div>
    `;
}
