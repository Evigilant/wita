import { sanitizeHTML, witaCascadePosition }          from "../../../core/utils.js";
import { getBastionData, saveBastionData,
         WITA_MORALE_COLOUR,
         allSlots }                                   from "../../data/data.js";
import { liveDefenderCount,
         createWorker, updateWorker, deleteWorker,
         assignWorkerToSlot,
         addDefender, removeDefender,
         setDefenderAlive, updateDefender,
         WITA_DEFENDER_RANKS,
         WITA_WORKER_PROFESSIONS }                    from "../../../professions/workers/index.js";
import { buildWorkerFormHTML, buildRoleFieldHTML,
         professionChip, rankBadge }                  from "../panel-utils.js";

export function build(panel) {
    const el      = document.createElement("div");
    const data    = getBastionData();
    const workers = data.workers ?? [];
    const slots   = allSlots(data);
    const slotName = wid => slots.find(s => (s.workerIds ?? []).includes(wid))?.facilityName ?? "—";

    const hLabel = document.createElement("div");
    hLabel.className = "wita-section-label";
    hLabel.textContent = "Hirelings";
    el.appendChild(hLabel);

    if (workers.length === 0) {
        el.innerHTML += `<div class="wita-empty">No hirelings yet.${game.user.isGM ? " Add one below." : ""}</div>`;
    } else {
        el.appendChild(_buildWorkerTable(workers, slotName));
    }

    if (game.user.isGM) {
        const btnRow = document.createElement("div");
        btnRow.className = "wita-btn-row";
        btnRow.innerHTML = `<button class="wita-btn" id="wita-add-worker"><i class="fas fa-plus"></i> Add Hireling</button>`;
        el.appendChild(btnRow);

        const hDropZone = document.createElement("div");
        hDropZone.id = "wita-hireling-dropzone";
        hDropZone.className = "wita-facility-dropzone";
        hDropZone.style.marginTop = "0.4rem";
        hDropZone.innerHTML = `<i class="fas fa-arrow-down"></i> Drag an Actor/Token here to add as hireling`;
        hDropZone.addEventListener("dragover", e => { e.preventDefault(); hDropZone.classList.add("drag-over"); }, true);
        hDropZone.addEventListener("dragleave", () => hDropZone.classList.remove("drag-over"), true);
        hDropZone.addEventListener("drop", async e => {
            e.preventDefault(); e.stopPropagation();
            hDropZone.classList.remove("drag-over");
            let dd;
            try { dd = JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return; }
            let name = "Hireling", role = "", actorId = null;
            if (dd.type === "Actor") {
                const actor = dd.uuid ? await fromUuid(dd.uuid) : game.actors.get(dd.id);
                if (actor) { name = actor.name; role = actor.system?.details?.race?.value ?? actor.system?.details?.type?.value ?? ""; actorId = actor.id; }
            } else if (dd.type === "Token") {
                const token = dd.uuid ? await fromUuid(dd.uuid) : null;
                name = token?.name ?? token?.actor?.name ?? "Hireling";
                actorId = token?.actor?.id ?? null;
            }
            await createWorker({ name, role, actorId });
            await panel.render({ force: true });
        }, true);
        el.appendChild(hDropZone);
    }

    const dLabel = document.createElement("div");
    dLabel.className = "wita-section-label";
    dLabel.style.marginTop = "0.75rem";
    dLabel.textContent = "Bastion Defenders";
    el.appendChild(dLabel);

    const defenders = data.defenders ?? [];
    const alive     = defenders.filter(d => d.alive);
    const dead      = defenders.filter(d => !d.alive);

    if (defenders.length === 0) {
        const emptyDiv = document.createElement("div");
        emptyDiv.className = "wita-empty";
        emptyDiv.textContent = "No defenders recruited yet.";
        el.appendChild(emptyDiv);
    } else {
        const defDiv = document.createElement("div");
        defDiv.className = "wita-defender-roster";
        defDiv.innerHTML = `<div class="wita-defender-count"><strong>${alive.length}</strong> alive${dead.length > 0 ? ` · <span style="color:var(--color-form-hint)">${dead.length} fallen</span>` : ""}</div>`;
        const list = document.createElement("div");
        list.className = "wita-defender-list";
        for (const d of defenders) {
            const row = document.createElement("div");
            row.className = `wita-defender-row${d.alive ? "" : " dead"}`;
            if (game.user.isGM) {
                row.innerHTML = `
                    <span>${d.alive ? "⚔️" : "💀"}</span>
                    <input class="wita-inline-name wita-defender-rename" data-id="${d.id}"
                        value="${sanitizeHTML(d.name)}" style="flex:1;background:transparent;border:none;border-bottom:1px solid transparent;color:inherit;font-size:0.8rem;padding:0 0.2rem;min-width:0"
                        title="Click to rename">
                    ${rankBadge(d)}
                    <div class="wita-worker-actions" style="margin-left:0.25rem">
                        <button class="wita-icon-btn wita-edit-defender" data-id="${d.id}" title="Edit"><i class="fas fa-pencil"></i></button>
                        ${d.alive
                            ? `<button class="wita-icon-btn wita-defender-kill"   data-id="${d.id}" title="Mark fallen">💀</button>`
                            : `<button class="wita-icon-btn wita-defender-revive" data-id="${d.id}" title="Mark alive">⚔️</button>`}
                        <button class="wita-icon-btn danger wita-defender-remove" data-id="${d.id}" title="Remove">✕</button>
                    </div>
                `;
            } else {
                row.innerHTML = `
                    <span>${d.alive ? "⚔️" : "💀"}</span>
                    <span style="flex:1;font-size:0.8rem;padding:0 0.2rem">${sanitizeHTML(d.name)}</span>
                    ${rankBadge(d)}
                `;
            }
            list.appendChild(row);
        }
        defDiv.appendChild(list);
        el.appendChild(defDiv);
    }

    if (game.user.isGM) {
        const dropZone = document.createElement("div");
        dropZone.id = "wita-defender-dropzone";
        dropZone.className = "wita-facility-dropzone";
        dropZone.style.marginTop = "0.4rem";
        dropZone.innerHTML = `<i class="fas fa-arrow-down"></i> Drag an Actor/Token here to add as defender`;
        dropZone.addEventListener("dragover", e => { e.preventDefault(); dropZone.classList.add("drag-over"); }, true);
        dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"), true);
        dropZone.addEventListener("drop", async e => {
            e.preventDefault(); e.stopPropagation();
            dropZone.classList.remove("drag-over");
            let dd;
            try { dd = JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return; }
            let name = "Defender";
            if (dd.type === "Actor") {
                const actor = dd.uuid ? await fromUuid(dd.uuid) : game.actors.get(dd.id);
                if (actor) name = actor.name;
            } else if (dd.type === "Token") {
                const token = dd.uuid ? await fromUuid(dd.uuid) : null;
                name = token?.name ?? token?.actor?.name ?? "Defender";
            }
            await addDefender(name);
            await panel.render({ force: true });
        }, true);
        el.appendChild(dropZone);

        const defBtnRow = document.createElement("div");
        defBtnRow.className = "wita-btn-row";
        defBtnRow.style.marginTop = "0.4rem";
        defBtnRow.innerHTML = `<button class="wita-btn" id="wita-add-defender"><i class="fas fa-plus"></i> Add Defender</button>`;
        el.appendChild(defBtnRow);
    }

    return el;
}

function _buildWorkerTable(workers, slotName) {
    const isGM = game.user.isGM;
    const tbl  = document.createElement("table");
    tbl.className = "wita-workers-table";
    tbl.innerHTML = `
        <thead><tr>
            <th>Name</th><th>Role</th><th>Profession</th><th>Facility</th>
            <th>Status</th><th>Morale</th>
            ${isGM ? "<th></th>" : ""}
        </tr></thead>
    `;
    const tbody = document.createElement("tbody");
    for (const w of workers) {
        const tr = document.createElement("tr");
        tr.dataset.workerId = w.id;
        tr.innerHTML = `
            <td><input class="wita-inline-name wita-worker-rename" data-worker-id="${w.id}"
                value="${sanitizeHTML(w.name)}" style="width:100%;background:transparent;border:none;border-bottom:1px solid transparent;color:inherit;font-weight:600;font-size:0.8rem;padding:0;min-width:0"
                title="Click to rename"></td>
            <td style="font-size:0.72rem">${sanitizeHTML(w.role ?? "")}</td>
            <td style="font-size:0.65rem">${professionChip(w)}</td>
            <td style="font-size:0.65rem">${sanitizeHTML(slotName(w.id))}</td>
            <td>${sanitizeHTML(w.status ?? "Active")}</td>
            <td>
                <div class="wita-morale-bar-wrap">
                    <div class="wita-morale-bar-bg">
                        <div class="wita-morale-bar-fill" style="width:${w.morale ?? 50}%;background:${WITA_MORALE_COLOUR(w.morale ?? 50)}"></div>
                    </div>
                    <span class="wita-morale-num">${w.morale ?? 50}</span>
                </div>
            </td>
            ${isGM ? `<td><div class="wita-worker-actions">
                <button class="wita-icon-btn wita-edit-worker"   data-worker-id="${w.id}"><i class="fas fa-pencil"></i></button>
                <button class="wita-icon-btn danger wita-delete-worker" data-worker-id="${w.id}"><i class="fas fa-trash"></i></button>
            </div></td>` : ""}
        `;
        tbody.appendChild(tr);
    }
    tbl.appendChild(tbody);
    return tbl;
}

export function bindListeners(el, panel) {
    el.querySelectorAll(".wita-edit-worker").forEach(btn =>
        btn.addEventListener("click", () => panel._openWorkerDialog(btn.dataset.workerId))
    );
    el.querySelectorAll(".wita-delete-worker").forEach(btn =>
        btn.addEventListener("click", async () => {
            const ok = await Dialog.confirm({ title: "Remove Hireling", content: "<p>Permanently remove this hireling?</p>" });
            if (!ok) return;
            await deleteWorker(btn.dataset.workerId);
            await panel.render({ force: true });
        })
    );
    el.querySelector("#wita-add-worker")?.addEventListener("click", () => panel._openWorkerDialog(null));

    el.querySelectorAll(".wita-worker-rename").forEach(input => {
        input.addEventListener("focus", () => input.style.borderBottomColor = "var(--color-highlights)");
        input.addEventListener("blur", async () => {
            input.style.borderBottomColor = "transparent";
            const newName = input.value.trim();
            if (!newName) return;
            await updateWorker(input.dataset.workerId, { name: newName });
        });
        input.addEventListener("keydown", e => { if (e.key === "Enter") input.blur(); });
    });

    el.querySelectorAll(".wita-edit-defender").forEach(btn =>
        btn.addEventListener("click", () => openDefenderDialog(panel, btn.dataset.id))
    );

    el.querySelectorAll(".wita-defender-rename").forEach(input => {
        input.addEventListener("focus", () => input.style.borderBottomColor = "var(--color-highlights)");
        input.addEventListener("blur", async () => {
            input.style.borderBottomColor = "transparent";
            const newName = input.value.trim();
            if (!newName) return;
            const data = getBastionData();
            const d = (data.defenders ?? []).find(d => d.id === input.dataset.id);
            if (d) { d.name = newName; await saveBastionData(data); }
        });
        input.addEventListener("keydown", e => { if (e.key === "Enter") input.blur(); });
    });

    el.querySelectorAll(".wita-defender-kill").forEach(btn =>
        btn.addEventListener("click", async () => { await setDefenderAlive(btn.dataset.id, false); await panel.render({ force: true }); })
    );
    el.querySelectorAll(".wita-defender-revive").forEach(btn =>
        btn.addEventListener("click", async () => { await setDefenderAlive(btn.dataset.id, true);  await panel.render({ force: true }); })
    );
    el.querySelectorAll(".wita-defender-remove").forEach(btn =>
        btn.addEventListener("click", async () => {
            const ok = await Dialog.confirm({ title: "Remove Defender", content: "<p>Remove from roster?</p>" });
            if (!ok) return;
            await removeDefender(btn.dataset.id);
            await panel.render({ force: true });
        })
    );
    el.querySelector("#wita-add-defender")?.addEventListener("click", async () => {
        await addDefender();
        await panel.render({ force: true });
    });
}

export async function openDefenderDialog(panel, defenderId) {
    if (!game.user.isGM) return;
    const data     = getBastionData();
    const defender = (data.defenders ?? []).find(d => d.id === defenderId);
    if (!defender) return;

    const rankOptions = WITA_DEFENDER_RANKS.map(r =>
        `<option value="${r.rank}" ${defender.rank === r.rank ? "selected" : ""}>${r.label}</option>`
    ).join("");
    const profOptions = Object.entries(WITA_WORKER_PROFESSIONS).map(([key, cfg]) =>
        `<option value="${key}" ${(defender.primaryProfession ?? "") === key ? "selected" : ""}>${cfg.label}</option>`
    ).join("");

    const content = `
        <div style="display:flex;flex-direction:column;gap:0.5rem;padding:0.25rem;font-family:var(--font-primary)">
            <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                Name
                <input name="name" type="text" value="${sanitizeHTML(defender.name)}"
                    style="font-size:0.8rem;padding:0.2rem 0.35rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
            </label>
            <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                Rank
                <select name="rank" style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                    ${rankOptions}
                </select>
            </label>
            <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                Primary Profession
                <select name="primaryProfession" style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                    <option value="">— None —</option>${profOptions}
                </select>
            </label>
            <div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.1rem">
                <input name="alive" type="checkbox" id="def-alive-chk" ${defender.alive ? "checked" : ""}>
                <label for="def-alive-chk" style="font-size:0.8rem;font-weight:600">Alive</label>
            </div>
        </div>
    `;

    const _defPos = witaCascadePosition("wita-bastion-panel");
    if (_defPos.top !== undefined) Hooks.once("renderDialogV2", (app) => app.setPosition(_defPos));
    await foundry.applications.api.DialogV2.prompt({
        window:  { title: `Edit Defender — ${defender.name}` },
        content,
        ok: {
            label: "Save",
            callback: async (event, button) => {
                const f = button.form;
                await updateDefender(defenderId, {
                    name:              f.querySelector("[name=name]").value.trim() || defender.name,
                    rank:              f.querySelector("[name=rank]").value,
                    primaryProfession: f.querySelector("[name=primaryProfession]").value,
                    alive:             f.querySelector("[name=alive]").checked,
                });
                await panel.render({ force: true });
            },
        },
    });
}

function _attachRoleListener(slots) {
    Hooks.once("renderDialogV2", (_app, element) => {
        const slotSel = element.querySelector("[name=slotId]");
        if (!slotSel) return;
        slotSel.addEventListener("change", () => {
            const slotId = slotSel.value;
            const facilityName = slots.find(s => s.id === slotId)?.facilityName ?? "";
            const roleWrap = element.querySelector(".wita-role-field-wrap");
            if (!roleWrap) return;
            const curRole = roleWrap.querySelector("[name=role]")?.value ?? "";
            roleWrap.innerHTML = buildRoleFieldHTML(facilityName, curRole);
        });
    });
}

// Exported so panel can use for worker dialogs
export async function openWorkerDialog(panel, workerId) {
    if (!game.user.isGM) return;
    const data    = getBastionData();
    const worker  = workerId ? (data.workers ?? []).find(w => w.id === workerId) : null;
    const slots   = allSlots(data).filter(s => s.facilityUuid);
    const curSlot = workerId
        ? slots.find(s => (s.workerIds ?? []).includes(workerId))?.id ?? ""
        : "";

    _attachRoleListener(slots);
    const _wPos = witaCascadePosition("wita-bastion-panel");
    if (_wPos.top !== undefined) Hooks.once("renderDialogV2", (app) => app.setPosition(_wPos));
    await foundry.applications.api.DialogV2.prompt({
        window:  { title: workerId ? `Edit Hireling — ${worker?.name ?? ""}` : "Add Hireling" },
        content: buildWorkerFormHTML(worker, slots, curSlot),
        ok: {
            label: workerId ? "Save" : "Add",
            callback: async (event, button) => {
                const f      = button.form;
                const name              = f.querySelector("[name=name]").value.trim();
                if (!name) { ui.notifications.warn("WITA | Name is required."); return; }
                const role              = f.querySelector("[name=role]").value.trim();
                const status            = f.querySelector("[name=status]").value;
                const morale            = parseInt(f.querySelector("[name=morale]").value) || 70;
                const slotId            = f.querySelector("[name=slotId]").value || null;
                const primaryProfession = f.querySelector("[name=primaryProfession]").value || null;
                if (workerId) {
                    await updateWorker(workerId, { name, role, status, morale, primaryProfession });
                    await assignWorkerToSlot(workerId, slotId);
                } else {
                    const newId = await createWorker({ name, role, status, morale });
                    if (newId) {
                        if (primaryProfession) await updateWorker(newId, { primaryProfession });
                        if (slotId) await assignWorkerToSlot(newId, slotId);
                    }
                }
                await panel.render({ force: true });
            },
        },
    });
}

export async function openWorkerDialogForSlot(panel, slotId) {
    if (!game.user.isGM) return;
    const data  = getBastionData();
    const slots = allSlots(data).filter(s => s.facilityUuid);

    _attachRoleListener(slots);
    const _wsPos = witaCascadePosition("wita-bastion-panel");
    if (_wsPos.top !== undefined) Hooks.once("renderDialogV2", (app) => app.setPosition(_wsPos));
    await foundry.applications.api.DialogV2.prompt({
        window:  { title: "Add Hireling" },
        content: buildWorkerFormHTML(null, slots, slotId ?? ""),
        ok: {
            label: "Add",
            callback: async (event, button) => {
                const f      = button.form;
                const name              = f.querySelector("[name=name]").value.trim();
                if (!name) { ui.notifications.warn("WITA | Name is required."); return; }
                const role              = f.querySelector("[name=role]").value.trim();
                const status            = f.querySelector("[name=status]").value;
                const morale            = parseInt(f.querySelector("[name=morale]").value) || 70;
                const sid               = f.querySelector("[name=slotId]").value || null;
                const primaryProfession = f.querySelector("[name=primaryProfession]").value || null;
                const newId  = await createWorker({ name, role, status, morale });
                if (newId) {
                    if (primaryProfession) await updateWorker(newId, { primaryProfession });
                    if (sid) await assignWorkerToSlot(newId, sid);
                }
                await panel.render({ force: true });
            },
        },
    });
}
