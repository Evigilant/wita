import { sanitizeHTML, witaCascadePosition }          from "../../../core/utils.js";
import { getEngineeringData, saveEngineeringData,
         getAllFacilities,
         WITA_DMG_FACILITIES,
         WITA_SIZE_LABEL, WITA_ORDER_LABEL,
         deleteCustomFacility }                       from "../../data/data.js";
import { getFacilityCost, setFacilityCost,
         getMetaCost, setMetaCost }                  from "../../../professions/merchants/data/costs.js";
import { createEngineerVendor, syncVendorPrices,
         _addFacilityToStock, _removeFacilityFromStock,
         seedBastionMetaItems }                       from "../../../professions/merchants/data/vendor.js";
import { openCustomFacilityDialog }                  from "../../../professions/merchants/ui/dialogs.js";

const META_LOOKUP = {
    "Bastion Expansion — Tier I":      { key: "tierUpgrade1" },
    "Bastion Expansion — Tier II":     { key: "tierUpgrade2" },
    "Bastion Expansion — Tier III":    { key: "tierUpgrade3" },
    "Add Basic Facility Slot":         { key: "basicSlot" },
    "Add Special Facility Slot":       { key: "specialSlot" },
    "Enlarge Facility":                { key: "enlarge" },
    "Enlarge Facility (Roomy → Vast)": { key: "enlarge" },
    "Roomy Slot License":              { key: "roomyLicense" },
    "Vast Slot License":               { key: "vastLicense" },
};

export function build(panel) {
    const el      = document.createElement("div");
    const isGM    = game.user.isGM;
    const engData = getEngineeringData();

    if (isGM) {
        const hasVendor = !!engData.vendorActorId && !!game.actors.get(engData.vendorActorId);
        const btnRow = document.createElement("div");
        btnRow.className = "wita-btn-row";
        btnRow.innerHTML = `
            <button class="wita-btn" id="wita-create-vendor"><i class="fas fa-hammer"></i> ${hasVendor ? "Open Vendor" : "Create Engineer Vendor"}</button>
            ${hasVendor ? `<button class="wita-btn" id="wita-sync-vendor"><i class="fas fa-rotate"></i> Sync Prices</button>` : ""}
        `;
        el.appendChild(btnRow);
    }

    // ── Bastion Items ─────────────────────────────────────────────
    const metaLabel = document.createElement("div");
    metaLabel.className = "wita-section-label";
    metaLabel.style.cssText = "display:flex;align-items:center";
    metaLabel.innerHTML = `<span style="flex:1">Bastion Items</span>
        ${isGM ? `<button class="wita-btn" id="wita-browse-meta-items" style="font-size:0.65rem;padding:0.15rem 0.5rem"><i class="fas fa-book"></i> Browse</button>` : ""}`;
    el.appendChild(metaLabel);

    if (isGM) {
        el.appendChild(_buildMetaDropZone());
    }

    const stockedMeta = engData.stockedMetaItems ?? [];
    if (stockedMeta.length === 0) {
        const d = document.createElement("div");
        d.innerHTML = `<div class="wita-empty" style="padding:0.4rem 0">No bastion items added yet. Drag from the compendium above.</div>`;
        el.appendChild(d);
    } else {
        const metaRows = stockedMeta.map(entry => {
            const lookup = META_LOOKUP[entry.name] ?? {};
            return {
                id:        entry.metaKey ?? lookup.key ?? entry.name,
                name:      entry.name,
                meta:      true,
                cost:      getMetaCost(entry.metaKey ?? lookup.key ?? "enlarge"),
                removable: true,
            };
        });
        el.appendChild(_buildCostTable(metaRows, false, false, true));
    }

    // ── Facilities ────────────────────────────────────────────────
    const facLabel = document.createElement("div");
    facLabel.className = "wita-section-label";
    facLabel.style.cssText = "display:flex;align-items:center";
    facLabel.innerHTML = `<span style="flex:1">Facilities</span>
        ${isGM ? `
            <button class="wita-btn" id="wita-new-facility"       style="font-size:0.65rem;padding:0.15rem 0.5rem;margin-right:0.25rem"><i class="fas fa-plus"></i> New</button>
            <button class="wita-btn" id="wita-clear-facilities"   style="font-size:0.65rem;padding:0.15rem 0.5rem"><i class="fas fa-trash"></i> Clear All</button>
        ` : ""}`;
    el.appendChild(facLabel);

    if (isGM) {
        el.appendChild(_buildFacilityDropZone());
    }

    const stocked = engData.stockedFacilities ?? [];
    if (stocked.length === 0) {
        const d = document.createElement("div");
        d.innerHTML = `<div class="wita-empty" style="padding:0.4rem 0">No facilities added yet. Drag from a compendium or click New to create a custom facility.</div>`;
        el.appendChild(d);
    } else {
        const allFac2 = getAllFacilities();
        const facRows = stocked
            .map(itemId => {
                const meta       = allFac2[itemId] ?? WITA_DMG_FACILITIES[itemId] ?? {};
                const storedName = engData.facilities?.[itemId]?.name;
                const name       = meta.name ?? storedName ?? itemId;
                const isCustom   = !!meta.custom || (!!storedName && !WITA_DMG_FACILITIES[itemId]);
                return { id: itemId, name, meta: false, cost: getFacilityCost(itemId), fMeta: { ...meta, name }, removable: true, custom: isCustom };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
        el.appendChild(_buildCostTable(facRows, true, true, true));
    }

    return el;
}

function _buildMetaDropZone() {
    const dz = document.createElement("div");
    dz.id = "wita-meta-dropzone";
    dz.className = "wita-facility-dropzone";
    dz.innerHTML = `<i class="fas fa-arrow-down"></i> Drag a Bastion Item from the compendium to add it`;
    dz.addEventListener("dragover", e => {
        if (!e.dataTransfer.types.includes("text/plain")) return;
        e.preventDefault();
        dz.classList.add("drag-over");
    }, true);
    dz.addEventListener("dragleave", () => dz.classList.remove("drag-over"), true);
    dz.addEventListener("drop", async e => {
        e.stopPropagation(); e.preventDefault();
        dz.classList.remove("drag-over");
        let dd;
        try { dd = JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return; }
        if (dd.type !== "Item" || !dd.uuid) return;
        const item = await fromUuid(dd.uuid);
        if (!item) { ui.notifications.warn("WITA | Could not load item."); return; }
        const wf = item.flags?.wita ?? {};
        const inBastionFolder = item.folder?.id === "NVw4w2boGfiVjzHe" || item._source?.folder === "NVw4w2boGfiVjzHe";
        const isBastionItem = wf.bastionMetaItem || wf.engineerCategory || inBastionFolder ||
            ["Bastion Expansion","Add Basic Facility","Add Special Facility","Enlarge Facility"].some(n => item.name.startsWith(n));
        if (!isBastionItem) {
            ui.notifications.warn("WITA | That item is not a Bastion Item. Drag from the Bastion folder in wita.wita-items.");
            return;
        }
        const engD = getEngineeringData();
        engD.stockedMetaItems = engD.stockedMetaItems ?? [];
        if (engD.stockedMetaItems.find(m => m.name === item.name)) {
            ui.notifications.info(`WITA | "${item.name}" is already in the list.`);
            return;
        }
        engD.stockedMetaItems.push({ name: item.name, metaKey: wf.engineerMetaKey ?? wf.metaKey ?? null });
        await saveEngineeringData(engD);
        const panel = foundry.applications.instances.get("wita-bastion-panel");
        if (panel) { try { await panel.render({ force: true }); } catch(err) { console.error("WITA | meta render error:", err); } }
    }, true);
    return dz;
}

function _buildFacilityDropZone() {
    const dz = document.createElement("div");
    dz.id = "wita-facility-dropzone";
    dz.className = "wita-facility-dropzone";
    dz.innerHTML = `<i class="fas fa-arrow-down"></i> Drag a facility from any compendium or world items`;
    dz.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("drag-over"); }, true);
    dz.addEventListener("dragleave", () => dz.classList.remove("drag-over"), true);
    dz.addEventListener("drop", async e => {
        e.stopPropagation(); e.preventDefault();
        dz.classList.remove("drag-over");
        let raw = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("text");
        let dd;
        try { dd = JSON.parse(raw); } catch { console.warn("WITA | Could not parse drop data:", raw); return; }
        if (!dd.uuid && dd.id) {
            dd.uuid = dd.pack ? `Compendium.${dd.pack}.Item.${dd.id}` : `Item.${dd.id}`;
        }
        if (dd.type !== "Item" || !dd.uuid) { ui.notifications.warn("WITA | Drop a facility item here."); return; }
        await _addFacilityToStock(dd.uuid);
        const panel = foundry.applications.instances.get("wita-bastion-panel");
        if (panel) { try { await panel.render({ force: true }); } catch(err) { console.error("WITA | render error:", err); } }
    }, true);
    return dz;
}

function _buildCostTable(rows, showFacilityMeta, showDelete = false, showRemove = false) {
    const isGM = game.user.isGM;
    const tbl  = document.createElement("table");
    tbl.className = "wita-engineer-table";
    tbl.innerHTML = `
        <thead><tr>
            <th>Name</th>
            ${showFacilityMeta ? "<th>Type</th><th>Size</th><th>Order</th>" : ""}
            <th style="text-align:right">GP Only</th>
            <th style="text-align:right">GP+Mats</th>
            ${isGM ? "<th></th>" : ""}
        </tr></thead>
    `;
    const tbody = document.createElement("tbody");
    for (const row of rows) {
        const tr = document.createElement("tr");
        tr.dataset.itemId = row.id;
        tr.innerHTML = `
            <td style="font-size:0.72rem"><strong>${sanitizeHTML(row.name)}</strong></td>
            ${showFacilityMeta ? `
                <td style="font-size:0.65rem">${row.fMeta?.type === "basic" ? "Basic" : "Special"}</td>
                <td style="font-size:0.65rem">${row.fMeta?.size ? WITA_SIZE_LABEL[row.fMeta.size] : "—"}</td>
                <td style="font-size:0.65rem">${row.fMeta?.order ? WITA_ORDER_LABEL[row.fMeta.order] : "—"}</td>
            ` : ""}
            <td style="text-align:right;font-size:0.72rem">${row.cost.gpOnly.toLocaleString()} GP</td>
            <td style="text-align:right;font-size:0.72rem">${row.cost.gpWithMaterials.toLocaleString()} GP</td>
            ${isGM ? `<td style="white-space:nowrap">
                <div class="wita-worker-actions">
                    <button class="wita-icon-btn ${row.meta ? "wita-edit-meta-cost" : "wita-edit-facility-cost"}" data-item-id="${row.id}" title="Edit"><i class="fas fa-pencil"></i></button>
                    ${showDelete && row.custom ? `<button class="wita-icon-btn danger wita-delete-custom" data-item-id="${row.id}" title="Delete"><i class="fas fa-trash"></i></button>` : ""}
                    ${showRemove && row.removable ? `<button class="wita-icon-btn danger wita-remove-from-stock" data-item-id="${row.id}" title="Remove from list"><i class="fas fa-times"></i></button>` : ""}
                </div>
            </td>` : ""}
        `;
        tbody.appendChild(tr);
    }
    tbl.appendChild(tbody);
    return tbl;
}

export function bindListeners(el, panel) {
    el.querySelector("#wita-create-vendor")?.addEventListener("click", async () => {
        const engData  = getEngineeringData();
        const existing = engData.vendorActorId ? game.actors.get(engData.vendorActorId) : null;
        if (existing) { existing.sheet.render({ force: true }); return; }
        await createEngineerVendor();
        await panel.render({ force: true });
    });

    el.querySelector("#wita-sync-vendor")?.addEventListener("click", async () => {
        await syncVendorPrices();
        ui.notifications.info("WITA | Vendor prices synced.");
    });

    el.querySelector("#wita-browse-meta-items")?.addEventListener("click", async () => {
        if (!game.user.isGM) return;
        await seedBastionMetaItems();
        const pack = game.packs.get("wita.wita-items");
        if (!pack) { ui.notifications.warn("WITA | wita.wita-items compendium not found."); return; }
        pack.render({ force: true });
    });

    el.querySelector("#wita-new-facility")?.addEventListener("click", () =>
        openCustomFacilityDialog(null)
    );

    el.querySelectorAll(".wita-edit-facility-cost").forEach(btn =>
        btn.addEventListener("click", () => panel._openCostDialog(btn.dataset.itemId, false))
    );
    el.querySelectorAll(".wita-edit-meta-cost").forEach(btn =>
        btn.addEventListener("click", () => panel._openCostDialog(btn.dataset.itemId, true))
    );

    el.querySelectorAll(".wita-delete-custom").forEach(btn =>
        btn.addEventListener("click", async () => {
            const item = game.items.get(btn.dataset.itemId);
            const ok   = await Dialog.confirm({
                title:   "Delete Custom Facility",
                content: `<p>Delete <strong>${item?.name ?? btn.dataset.itemId}</strong>? This will clear any bastion slots using it and remove it from the vendor.</p>`,
            });
            if (!ok) return;
            await deleteCustomFacility(btn.dataset.itemId);
            await panel.render({ force: true });
        })
    );

    el.querySelectorAll(".wita-remove-from-stock").forEach(btn =>
        btn.addEventListener("click", async () => {
            if (!game.user.isGM) return;
            const itemId   = btn.dataset.itemId;
            const engD     = getEngineeringData();
            const metaKeys = ["tierUpgrade1","tierUpgrade2","tierUpgrade3","basicSlot","specialSlot","enlarge","roomyLicense","vastLicense"];
            if (metaKeys.includes(itemId)) {
                engD.stockedMetaItems = (engD.stockedMetaItems ?? []).filter(e => e.metaKey !== itemId);
                await saveEngineeringData(engD);
            } else {
                await _removeFacilityFromStock(itemId);
            }
            await panel.render({ force: true });
        })
    );

    el.querySelector("#wita-clear-facilities")?.addEventListener("click", async () => {
        if (!game.user.isGM) return;
        const engD = getEngineeringData();
        engD.stockedFacilities = [];
        engD.facilities = {};
        await saveEngineeringData(engD);
        await panel.render({ force: true });
    });
}

// Exported so panel can delegate cost dialog
export async function openCostDialog(panel, itemIdOrKey, isMeta) {
    if (!game.user.isGM) return;

    const cost = isMeta ? getMetaCost(itemIdOrKey) : getFacilityCost(itemIdOrKey);
    const name = isMeta ? itemIdOrKey : (getAllFacilities()[itemIdOrKey]?.name ?? itemIdOrKey);

    const matRowsHtml = (mats) => mats.map((m, i) => `
        <div class="wita-mat-row" data-index="${i}" style="display:flex;gap:0.3rem;margin-bottom:0.25rem">
            <input type="text"   class="wita-mat-name" value="${sanitizeHTML(m.name)}" placeholder="Material"
                   style="flex:1;font-size:0.75rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
            <input type="number" class="wita-mat-qty"  value="${m.qty}" min="1"
                   style="width:3.5rem;font-size:0.75rem;padding:0.15rem 0.25rem;border:1px solid var(--color-fieldset-border);border-radius:3px;text-align:center">
            <button type="button" class="wita-icon-btn danger wita-remove-mat" style="flex-shrink:0">✕</button>
        </div>
    `).join("");

    const _engPos = witaCascadePosition("wita-bastion-panel");
    if (_engPos.top !== undefined) Hooks.once("renderDialogV2", (app) => app.setPosition(_engPos));
    await foundry.applications.api.DialogV2.prompt({
        window: { title: `Edit Costs — ${sanitizeHTML(name)}` },
        content: `
            <div style="display:flex;flex-direction:column;gap:0.5rem;padding:0.25rem;font-family:var(--font-primary)">
                <p style="margin:0;font-weight:700;font-size:0.85rem">${sanitizeHTML(name)}</p>
                <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                    GP Only <input type="number" name="gpOnly" value="${cost.gpOnly}" min="0" step="50"
                             style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                </label>
                <label style="display:flex;flex-direction:column;gap:0.1rem;font-size:0.75rem;font-weight:600">
                    GP + Materials <input type="number" name="gpWithMaterials" value="${cost.gpWithMaterials}" min="0" step="50"
                                   style="font-size:0.78rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                </label>
                <div class="wita-section-label" style="margin-top:0.3rem">Materials (for GP+Mat option)</div>
                <div id="wita-mat-rows">${matRowsHtml(cost.materials ?? [])}</div>
                <button type="button" id="wita-add-mat" class="wita-btn" style="font-size:0.7rem;padding:0.15rem 0.4rem">
                    <i class="fas fa-plus"></i> Add Material
                </button>
            </div>
        `,
        render: (event, html) => {
            const root = html instanceof HTMLElement ? html : html[0];
            root.querySelector("#wita-add-mat")?.addEventListener("click", () => {
                const rows = root.querySelector("#wita-mat-rows");
                const div  = document.createElement("div");
                div.className = "wita-mat-row";
                div.style.cssText = "display:flex;gap:0.3rem;margin-bottom:0.25rem";
                div.innerHTML = `
                    <input type="text"   class="wita-mat-name" placeholder="Material"
                           style="flex:1;font-size:0.75rem;padding:0.15rem 0.3rem;border:1px solid var(--color-fieldset-border);border-radius:3px">
                    <input type="number" class="wita-mat-qty" value="1" min="1"
                           style="width:3.5rem;font-size:0.75rem;padding:0.15rem 0.25rem;border:1px solid var(--color-fieldset-border);border-radius:3px;text-align:center">
                    <button type="button" class="wita-icon-btn danger wita-remove-mat" style="flex-shrink:0">✕</button>
                `;
                div.querySelector(".wita-remove-mat").addEventListener("click", () => div.remove());
                rows.appendChild(div);
            });
            root.querySelectorAll(".wita-remove-mat").forEach(btn =>
                btn.addEventListener("click", () => btn.closest(".wita-mat-row").remove())
            );
        },
        ok: {
            label: "Save",
            callback: async (event, button) => {
                const f          = button.form;
                const gpOnly     = parseInt(f.querySelector("[name=gpOnly]").value) || 0;
                const gpWithMats = parseInt(f.querySelector("[name=gpWithMaterials]").value) || 0;
                const materials  = [...f.querySelectorAll(".wita-mat-row")].map(r => ({
                    name: r.querySelector(".wita-mat-name").value.trim(),
                    qty:  parseInt(r.querySelector(".wita-mat-qty").value) || 1,
                })).filter(m => m.name);
                const newCost = { gpOnly, gpWithMaterials: gpWithMats, materials };
                if (isMeta) setMetaCost(itemIdOrKey, newCost);
                else        setFacilityCost(itemIdOrKey, newCost);
                await panel.render({ force: true });
            },
        },
    });
}
