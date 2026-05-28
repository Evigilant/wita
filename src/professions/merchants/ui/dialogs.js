// ============================================================
// WITA — ENGINEER DIALOGS
// Custom facility creator dialog and slot assignment dialog.
// ============================================================
import { sanitizeHTML }                              from "../../../core/utils.js";
import { getBastionData, getEngineeringData,
         saveEngineeringData,
         createCustomFacility,
         WITA_SIZES, WITA_ORDERS,
         WITA_SIZE_LABEL, WITA_ORDER_LABEL }          from "../../../bastion/data/data.js";
import { assignFacilityToSlot }                      from "../../../bastion/data/slots.js";
import { getMetaCost }                               from "../data/costs.js";
import { _addFacilityToStock, syncVendorPrices,
         _refreshPanel }                             from "../data/vendor.js";

// ── Custom facility creator ───────────────────────────────────

export async function openCustomFacilityDialog(existingItemId = null) {
    if (!game.user.isGM) return;

    let existing = existingItemId ? game.items.get(existingItemId) : null;
    if (existingItemId && !existing) {
        const pack = game.packs.get("wita.wita-items");
        if (pack) existing = await pack.getDocument(existingItemId).catch(() => null);
    }
    const ef      = existing?.getFlag?.("wita", "customFacility") ?? {};
    const engData = getEngineeringData();
    const ec      = engData.facilities?.[existingItemId] ?? { gpOnly: 1000, gpWithMaterials: 400, materials: [] };

    const sizeOptions  = WITA_SIZES.map(s =>
        `<option value="${s}" ${(ef.size ?? "cramped") === s ? "selected" : ""}>${WITA_SIZE_LABEL[s]}</option>`
    ).join("");
    const orderOptions = WITA_ORDERS.map(o =>
        `<option value="${o}" ${(ef.order ?? "") === o ? "selected" : ""}>${WITA_ORDER_LABEL[o]}</option>`
    ).join("");

    const content = `
        <div style="display:flex;flex-direction:column;gap:0.5rem;padding:0.25rem;font-family:var(--font-primary)">

            <label style="display:flex;flex-direction:column;gap:0.15rem;font-size:0.75rem;font-weight:600">
                Name <input type="text" name="name" value="${sanitizeHTML(existing?.name ?? "")}" placeholder="e.g. Brewery" required
                      style="font-size:0.8rem;padding:0.2rem 0.35rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
            </label>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem">
                <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                    Type <select name="type" style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                        <option value="basic"   ${(ef.type ?? "special") === "basic"   ? "selected" : ""}>Basic</option>
                        <option value="special" ${(ef.type ?? "special") === "special" ? "selected" : ""}>Special</option>
                    </select>
                </label>
                <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                    Subtype <input type="text" name="subtype" value="${sanitizeHTML(ef.subtype ?? "")}" placeholder="e.g. brewery"
                             style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                </label>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem">
                <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                    Size <select name="size" style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                        ${sizeOptions}
                    </select>
                </label>
                <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                    Level Req <input type="number" name="level" value="${ef.level ?? 5}" min="1" max="20"
                              style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                </label>
            </div>

            <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                Order <select name="order" style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                    ${orderOptions}
                </select>
            </label>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem">
                <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                    Hirelings <input type="number" name="hirelings" value="${ef.hirelings ?? 1}" min="0" max="20"
                              style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                </label>
                <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                    Defenders <input type="number" name="defenders" value="${ef.defenders ?? 0}" min="0" max="50"
                              style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                </label>
            </div>

            <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                Prerequisite <input type="text" name="prereq" value="${sanitizeHTML(ef.prereq ?? "None")}" placeholder="e.g. Proficiency in Brewer's Supplies"
                             style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
            </label>

            <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.75rem;font-weight:600;cursor:pointer">
                <input type="checkbox" name="enlargeable" ${ef.enlargeable ? "checked" : ""}> Enlargeable (Roomy → Vast)
            </label>

            <div id="wita-enlarge-fields" style="display:${ef.enlargeable ? "grid" : "none"};grid-template-columns:1fr 1fr;gap:0.4rem">
                <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                    +Hirelings on Enlarge <input type="number" name="enlargeHirelings" value="${ef.enlargeHirelings ?? 0}" min="0"
                                          style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                </label>
                <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                    Defenders after Enlarge <input type="number" name="enlargeDefenders" value="${ef.enlargeDefenders ?? 0}" min="0"
                                            style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                </label>
            </div>

            <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                Description <textarea name="description" rows="3" placeholder="Flavour text and mechanical effects…"
                             style="font-size:0.75rem;padding:0.2rem 0.35rem;border:1px solid var(--color-fieldset-border);border-radius:3px;resize:vertical">${sanitizeHTML(ef.description ?? "")}</textarea>
            </label>

            <div style="border-top:1px solid var(--color-fieldset-border);margin-top:0.25rem;padding-top:0.4rem">
                <div style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--color-form-hint);margin-bottom:0.35rem">Construction Costs</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem">
                    <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                        GP Only <input type="number" name="gpOnly" value="${ec.gpOnly ?? 1000}" min="0"
                                 style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                    </label>
                    <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                        GP with Materials <input type="number" name="gpWithMaterials" value="${ec.gpWithMaterials ?? 400}" min="0"
                                          style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                    </label>
                </div>
                <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600;margin-top:0.35rem">
                    Materials <input type="text" name="materialsLabel" value="${sanitizeHTML((ec.materials ?? []).map(m => m.qty + '×' + m.name).join(', '))}"
                               placeholder="e.g. 50× Stone, 20× Timber"
                               style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                    <span style="font-size:0.65rem;color:var(--color-form-hint)">Format: qty× Name, qty× Name</span>
                </label>
            </div>
        </div>
    `;

    const dlg = new Dialog({
        title:   existingItemId ? `Edit Facility — ${existing?.name}` : "Create Custom Facility",
        content,
        default: "ok",
        buttons: {
            ok: {
                label: existingItemId ? "Save Changes" : "Create",
                callback: async html => {
                    const f = html instanceof jQuery ? html[0] : html;
                    const matStr    = f.querySelector("[name=materialsLabel]")?.value.trim() ?? "";
                    const materials = matStr ? matStr.split(",").map(s => {
                        const m = s.trim().match(/^(\d+)[×x]\s*(.+)$/);
                        return m ? { qty: parseInt(m[1]), name: m[2].trim() } : null;
                    }).filter(Boolean) : [];

                    const opts = {
                        name:             f.querySelector("[name=name]").value.trim(),
                        subtype:          f.querySelector("[name=subtype]").value.trim(),
                        type:             f.querySelector("[name=type]").value,
                        size:             f.querySelector("[name=size]").value,
                        level:            parseInt(f.querySelector("[name=level]").value) || 5,
                        order:            f.querySelector("[name=order]").value,
                        hirelings:        parseInt(f.querySelector("[name=hirelings]").value) || 0,
                        defenders:        parseInt(f.querySelector("[name=defenders]").value) || 0,
                        prereq:           f.querySelector("[name=prereq]").value.trim(),
                        enlargeable:      f.querySelector("[name=enlargeable]").checked,
                        enlargeHirelings: parseInt(f.querySelector("[name=enlargeHirelings]").value) || 0,
                        enlargeDefenders: parseInt(f.querySelector("[name=enlargeDefenders]").value) || 0,
                        description:      f.querySelector("[name=description]").value.trim(),
                        img:              existing?.img ?? "icons/svg/castle.svg",
                        gpOnly:           parseInt(f.querySelector("[name=gpOnly]").value) || 1000,
                        gpWithMaterials:  parseInt(f.querySelector("[name=gpWithMaterials]").value) || 400,
                        materials,
                    };

                    if (!opts.name) { ui.notifications.warn("WITA | Name is required."); return; }

                    if (existingItemId) {
                        await existing.update({
                            name:   opts.name,
                            img:    opts.img,
                            system: {
                                description: { value: `<p>${opts.description}</p>` },
                                type:      { value: opts.type, subtype: opts.subtype },
                                size:      opts.size,
                                level:     opts.level,
                                order:     opts.order,
                                hirelings: { value: [], max: opts.hirelings || null },
                                defenders: { value: [], max: opts.defenders || null },
                            },
                            flags: { wita: { customFacility: { ...opts } } },
                        });
                        const ed = getEngineeringData();
                        ed.facilities = ed.facilities ?? {};
                        ed.facilities[existingItemId] = {
                            ...(ed.facilities[existingItemId] ?? {}),
                            name:            opts.name,
                            gpOnly:          opts.gpOnly,
                            gpWithMaterials: opts.gpWithMaterials,
                            materials:       opts.materials,
                        };
                        await saveEngineeringData(ed);
                        await syncVendorPrices();
                        ui.notifications.info(`WITA | "${opts.name}" updated.`);
                    } else {
                        const newItem = await createCustomFacility(opts);
                        if (newItem) {
                            await _addFacilityToStock(newItem.uuid);
                            const ed  = getEngineeringData();
                            const nid = newItem.id;
                            if (ed.facilities?.[nid]) {
                                ed.facilities[nid].gpOnly          = opts.gpOnly;
                                ed.facilities[nid].gpWithMaterials = opts.gpWithMaterials;
                                ed.facilities[nid].materials       = opts.materials;
                                await saveEngineeringData(ed);
                            }
                        }
                    }

                    _refreshPanel();
                },
            },
            cancel: { label: "Cancel" },
        },
    });

    dlg.render(true);

    Hooks.once("renderDialog", (app, html) => {
        if (app !== dlg) return;
        const cb     = (html instanceof jQuery ? html[0] : html).querySelector("[name=enlargeable]");
        const fields = (html instanceof jQuery ? html[0] : html).querySelector("#wita-enlarge-fields");
        if (cb && fields) {
            cb.addEventListener("change", () => {
                fields.style.display = cb.checked ? "grid" : "none";
            });
        }
    });
}
