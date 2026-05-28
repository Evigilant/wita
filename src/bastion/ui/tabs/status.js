import { sanitizeHTML, witaSetting }          from "../../../core/utils.js";
import { getBastionData, saveBastionData,
         WITA_TIER_ICON, WITA_TIER_LABEL }    from "../../data/data.js";
import { getSizeLimits, setBastionTier }       from "../../data/slots.js";
import { liveDefenderCount }                   from "../../data/workers/index.js";
import { getBastionState, saveBastionState }   from "../../data/state.js";

export async function build(panel) {
    const el        = document.createElement("div");
    const data      = getBastionData();
    const bst       = await getBastionState();
    const threshold = witaSetting("longRestsPerTurn") ?? 7;
    const restCount = bst.longRestCount ?? 0;
    const pct       = Math.min(Math.round((restCount / threshold) * 100), 100);
    const workers   = data.workers ?? [];
    const active    = workers.filter(w => w.status === "Active").length;
    const defCount  = liveDefenderCount(data);
    const avgMorale = workers.length
        ? Math.round(workers.reduce((s, w) => s + (w.morale ?? 50), 0) / workers.length)
        : "—";
    const occupied   = (data.basicSlots ?? []).filter(s => s.facilityUuid).length
                     + (data.specialSlots ?? []).filter(s => s.facilityUuid).length;
    const totalSlots = (data.basicSlots?.length ?? 0) + (data.specialSlots?.length ?? 0);
    const tier       = data.bastionTier ?? 0;
    const limits     = getSizeLimits(data);

    el.innerHTML = `
        <div class="wita-section-label">Bastion</div>
        <div class="wita-stat-grid">
            <div class="wita-stat-card">
                <div class="wita-stat-value">${WITA_TIER_ICON[tier]}</div>
                <div class="wita-stat-label">${WITA_TIER_LABEL[tier]}</div>
            </div>
            <div class="wita-stat-card">
                <div class="wita-stat-value">${bst.turnNumber ?? 0}</div>
                <div class="wita-stat-label">Turn</div>
            </div>
            <div class="wita-stat-card">
                <div class="wita-stat-value">${occupied}/${totalSlots}</div>
                <div class="wita-stat-label">Facilities</div>
            </div>
            <div class="wita-stat-card">
                <div class="wita-stat-value">${defCount}</div>
                <div class="wita-stat-label">Defenders</div>
            </div>
        </div>
        <div class="wita-section-label">Size Slots</div>
        <div class="wita-stat-grid">
            <div class="wita-stat-card">
                <div class="wita-stat-value">${limits.usedRoomy}/${limits.maxRoomy}</div>
                <div class="wita-stat-label">Roomy Used</div>
            </div>
            <div class="wita-stat-card">
                <div class="wita-stat-value">${limits.availRoomy}</div>
                <div class="wita-stat-label">Roomy Free</div>
            </div>
            <div class="wita-stat-card">
                <div class="wita-stat-value">${limits.usedVast}/${limits.maxVast}</div>
                <div class="wita-stat-label">Vast Used</div>
            </div>
            <div class="wita-stat-card">
                <div class="wita-stat-value">${limits.availVast}</div>
                <div class="wita-stat-label">Vast Free</div>
            </div>
        </div>
        ${game.user.isGM ? `
        <div style="display:flex;gap:0.5rem;margin-top:0.4rem;align-items:center;flex-wrap:wrap">
            <span style="font-size:0.72rem;color:var(--color-form-label);white-space:nowrap">Roomy Licenses: ${data.roomyLicenses ?? 0}</span>
            <button class="wita-btn wita-size-license-btn" data-type="roomy" data-delta="1"  style="font-size:0.65rem;padding:0.1rem 0.4rem">+</button>
            <button class="wita-btn wita-size-license-btn" data-type="roomy" data-delta="-1" style="font-size:0.65rem;padding:0.1rem 0.4rem">−</button>
            <span style="font-size:0.72rem;color:var(--color-form-label);white-space:nowrap;margin-left:0.5rem">Vast Licenses: ${data.vastLicenses ?? 0}</span>
            <button class="wita-btn wita-size-license-btn" data-type="vast" data-delta="1"  style="font-size:0.65rem;padding:0.1rem 0.4rem">+</button>
            <button class="wita-btn wita-size-license-btn" data-type="vast" data-delta="-1" style="font-size:0.65rem;padding:0.1rem 0.4rem">−</button>
        </div>` : ""}
        <div class="wita-section-label">Hirelings</div>
        <div class="wita-stat-grid">
            <div class="wita-stat-card">
                <div class="wita-stat-value">${active}</div>
                <div class="wita-stat-label">Active</div>
            </div>
            <div class="wita-stat-card">
                <div class="wita-stat-value">${avgMorale}</div>
                <div class="wita-stat-label">Avg Morale</div>
            </div>
        </div>
        <div class="wita-section-label">Rest Progress</div>
        <div class="wita-progress-row">
            <div class="wita-progress-bar-wrap">
                <div class="wita-progress-bar" style="width:${pct}%"></div>
            </div>
            <span class="wita-progress-label">${restCount} / ${threshold}</span>
            ${game.user.isGM ? `
            <button class="wita-cap-btn wita-rest-adj" data-delta="-1" title="Remove rest">−</button>
            <button class="wita-cap-btn wita-rest-adj" data-delta="1"  title="Add rest">+</button>
            ` : ""}
        </div>
        ${bst.pendingFluctuationType ? `
        <div class="wita-section-label">Pending Action</div>
        <p style="font-size:0.72rem;margin:0 0 0.4rem">Collect Earnings type:<br>
            <span class="wita-badge">${sanitizeHTML(bst.pendingFluctuationType)}</span></p>` : ""}
        ${game.user.isGM ? `
        <div class="wita-section-label">GM Controls</div>
        <div class="wita-btn-row">
            <button class="wita-btn" id="wita-trigger-turn"><i class="fas fa-dice-d20"></i> Trigger Turn</button>
            <button class="wita-btn" id="wita-open-journal"><i class="fas fa-book-open"></i> Journal</button>
        </div>
        <div class="wita-btn-row" style="align-items:center;gap:0.5rem;margin-top:0.4rem">
            <label style="font-size:0.72rem;color:var(--color-form-label);white-space:nowrap">Bastion Tier</label>
            <select id="wita-tier-select" style="flex:1;background:var(--color-cool-5);color:var(--color-text-primary);border:1px solid var(--color-fieldset-border);border-radius:3px;padding:0.15rem 0.3rem;font-size:0.72rem">
                <option value="0" ${tier === 0 ? "selected" : ""}>0 — Unbuilt</option>
                <option value="1" ${tier === 1 ? "selected" : ""}>I — Cramped</option>
                <option value="2" ${tier === 2 ? "selected" : ""}>II — Roomy</option>
                <option value="3" ${tier === 3 ? "selected" : ""}>III — Vast</option>
            </select>
        </div>` : ""}
    `;
    return el;
}

export function bindListeners(el, panel) {
    el.querySelectorAll(".wita-rest-adj").forEach(btn =>
        btn.addEventListener("click", async () => {
            if (!game.user.isGM) return;
            const delta     = parseInt(btn.dataset.delta);
            const threshold = witaSetting("longRestsPerTurn") ?? 7;
            const state     = await getBastionState();
            state.longRestCount = Math.min(Math.max((state.longRestCount ?? 0) + delta, 0), threshold);
            await saveBastionState(state);
            await panel.render({ force: true });
        })
    );

    el.querySelectorAll(".wita-size-license-btn").forEach(btn =>
        btn.addEventListener("click", async () => {
            const key  = btn.dataset.type === "roomy" ? "roomyLicenses" : "vastLicenses";
            const data = getBastionData();
            data[key]  = Math.max(0, (data[key] ?? 0) + parseInt(btn.dataset.delta));
            await saveBastionData(data);
            await panel.render({ force: true });
        })
    );

    el.querySelector("#wita-trigger-turn")?.addEventListener("click", async () => {
        await globalThis.WITA_BASTION?.triggerTurn?.();
    });

    el.querySelector("#wita-open-journal")?.addEventListener("click", () => {
        game.journal.getName(witaSetting("bastionName") ?? "")?.sheet.render({ force: true });
    });

    el.querySelector("#wita-tier-select")?.addEventListener("change", async (e) => {
        await setBastionTier(parseInt(e.target.value));
        await panel.render({ force: true });
    });
}
