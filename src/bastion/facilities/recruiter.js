// ============================================================
// WITA — RECRUITER FACILITY
// Wires the recruiter profession into the bastion turn loop.
// resolveNow() generates candidate pools for all slots with
// facilityOrder === "recruit" that have a recruiter assigned.
// ============================================================

import { getBastionData, allSlots }         from "../data/data.js";
import { generateCandidates }               from "../../professions/recruiter/data/recruiter-data.js";
import { RARITY_LABELS, RARITY_COLOURS }    from "../../professions/recruiter/data/recruiter-config.js";
import { WITACandidatesDialog }             from "../../professions/recruiter/ui/candidates-dialog.js";
import { witaSaveSettingAsGM }              from "../../socket.js";
import { sanitizeHTML }                     from "../../core/utils.js";
import { WITA_WORKER_PROFESSIONS }          from "../../professions/workers/config.js";

export function registerRecruiter() {
    _registerTurnHook();
    _registerPublicAPI();
    console.log("WITA | Recruiter profession ready.");
}

// ── Bastion panel refresh on candidate change ─────────────────

function _registerTurnHook() {
    Hooks.on("updateSetting", (setting) => {
        if (setting.namespace !== "wita") return;
        if (setting.key !== "bastionRecruitCandidates") return;
        const panel = foundry.applications.instances.get("wita-bastion-panel");
        if (panel?.rendered) panel.render({ force: true });
    });
}

// ── Public API ────────────────────────────────────────────────

function _registerPublicAPI() {
    if (!game.wita) game.wita = {};
    game.wita.recruiter = {
        resolveNow:           resolveNow,
        openCandidatesDialog: (slotId) => WITACandidatesDialog.open(slotId),
    };
}

// ── Turn resolution ───────────────────────────────────────────

export async function resolveNow(turnNumber) {
    if (!game.user.isGM) return;

    const data  = getBastionData();
    const slots = allSlots(data);

    // Any slot with facilityOrder "recruit"; a recruiter worker improves quality but is not required
    const recruiterSlots = slots.filter(s => s.facilityOrder === "recruit");

    if (!recruiterSlots.length) return;

    // Load existing candidates and expire any from previous turns
    let candidates = {};
    try { candidates = game.settings.get("wita", "bastionRecruitCandidates") ?? {}; } catch { /**/ }

    for (const slotId of Object.keys(candidates)) {
        if (candidates[slotId].turnGenerated !== turnNumber) delete candidates[slotId];
    }

    for (const slot of recruiterSlots) {
        const slotWorkers     = (data.workers ?? []).filter(w => (slot.workerIds ?? []).includes(w.id));
        const recruiterWorker = slotWorkers.find(w => w.primaryProfession === "recruiter") ?? null;

        const { candidates: newCandidates, rollSummary } = generateCandidates(slot, recruiterWorker);

        const profData = (recruiterWorker?.professions ?? {}).recruiter ?? { xp: 0, level: 1 };
        candidates[slot.id] = {
            turnGenerated:     turnNumber,
            recruiterWorkerId: recruiterWorker?.id ?? null,
            recruiterLevel:    profData.level ?? 1,
            facilityName:      slot.facilityName ?? "Unknown",
            slotId:            slot.id,
            candidates:        newCandidates,
        };

        _postRecruitChatCard(slot, recruiterWorker, newCandidates, rollSummary);
        globalThis.WITA?.socket?.executeForEveryone("witaOpenCandidatesDialog", slot.id);
    }

    await witaSaveSettingAsGM("bastionRecruitCandidates", candidates);
}

// ── GM chat card ──────────────────────────────────────────────

function _postRecruitChatCard(slot, recruiterWorker, candidates, rollSummary) {
    const { r6Raw, r6Total, matchCount, isCrit, totalCount, modifier, level } = rollSummary;
    const titleRow = WITA_WORKER_PROFESSIONS.recruiter?.levelTable?.find(r => r.level === level)?.title
                  ?? `Level ${level}`;

    const rows = candidates.map(c => {
        const rLabel    = sanitizeHTML(RARITY_LABELS[c.rarity] ?? c.rarity);
        const rColour   = RARITY_COLOURS[c.rarity] ?? "";
        const profLabel = sanitizeHTML(WITA_WORKER_PROFESSIONS[c.primaryProfession]?.label ?? c.primaryProfession);
        return `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:0.1rem 0;font-size:0.75rem">
                <span>${sanitizeHTML(c.name)}
                    <span style="color:var(--color-form-hint)">(${profLabel})</span>
                    ${c.matchesFacility ? `<span style="color:var(--color-level-success)">&#10003;</span>` : ""}
                </span>
                <span style="color:${sanitizeHTML(rColour)};font-weight:600">${rLabel}</span>
            </div>`;
    }).join("");

    ChatMessage.create({
        content: `
            <div style="font-family:var(--font-primary,Signika);padding:0.5rem">
                <h3 style="margin:0 0 0.35rem">&#9876; Recruit Report — ${sanitizeHTML(slot.facilityName ?? "Facility")}</h3>
                <p style="margin:0 0 0.3rem;font-size:0.75rem">
                    ${recruiterWorker
                        ? `<strong>${sanitizeHTML(recruiterWorker.name)}</strong> (${sanitizeHTML(titleRow)})`
                        : `<em style="color:var(--color-form-hint)">No recruiter assigned</em>`}
                    rolled
                    <strong>${r6Raw}</strong>${modifier ? `+${modifier}` : ""} = <strong>${r6Total}</strong>
                    &rarr; ${matchCount} facility match${matchCount !== 1 ? "es" : ""}
                    ${isCrit ? `<span style="color:var(--color-level-success)"> + 1 crit bonus</span>` : ""}
                </p>
                <div style="border-top:1px solid var(--color-fieldset-border);padding-top:0.25rem;margin-top:0.1rem">
                    ${rows}
                </div>
                <p style="font-size:0.65rem;color:var(--color-form-hint);margin:0.35rem 0 0;font-style:italic">
                    ${totalCount} candidate${totalCount !== 1 ? "s" : ""} available — check Status tab to hire.
                </p>
            </div>
        `,
        whisper: ChatMessage.getWhisperRecipients("GM"),
        speaker: { alias: "Recruiter" },
    });
}
