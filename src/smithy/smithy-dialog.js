// ============================================================
// WITA Smithy — smithy-dialog.js
// WITASmithyDialog — commission dialog with:
//   - Current commission status + cancel
//   - Rarity selector → item dropdown → sub-selection
// ============================================================

import {
    SMITHY_ITEM_ID, SIZE_RARITIES, RARITY_LABELS, SIZE_MAX_WORKERS,
    smithyCraftDC, getGenericCategory, GENERIC_ITEM_PATTERNS,
} from "./smithy-config.js";
import { loadArmamentsTable, loadEquipmentOptions, setSmithyOrder, getSmithyOrder, clearSmithyOrder, smithyCraftTurns, RARITY_CRAFTING } from "./smithy-data.js";
import { getFinancialSummary } from "../bastion/bastion-finance.js";
import { getBastionData } from "../bastion/bastion-data.js";
import { sanitizeHTML } from "../core/utils.js";
import { witaSetting } from "../settings/settings.js";

export class WITASmithyDialog extends foundry.applications.api.ApplicationV2 {

    constructor(slotId, options = {}) {
        super(options);
        this._slotId      = slotId;
        this._items       = {};    // { rarity: [{uuid, name}] }
        this._rarity      = null;  // currently selected rarity
        this._selected    = null;  // { uuid, name, rarity }
        this._baseItem    = null;  // { uuid, name } for generic items
        this._quantity    = 1;
        this._loading     = true;
    }

    static DEFAULT_OPTIONS = {
        window:   { resizable: false, title: "Smithy — Commission an Item" },
        position: { width: 480, height: "auto" },
        classes:  ["wita-smithy-dialog"],
    };

    static async open(slotId) {
        const appId   = `wita-smithy-dialog-${slotId}`;
        const existing = foundry.applications.instances.get(appId);
        if (existing?.rendered) { existing.bringToFront(); return; }
        const dlg = new WITASmithyDialog(slotId, { id: appId });
        await dlg.render({ force: true });
    }

    // ── Helpers ───────────────────────────────────────────────

    _getSlot() {
        const data  = getBastionData();
        const slots = [...(data.basicSlots ?? []), ...(data.specialSlots ?? [])];
        return slots.find(s => s.id === this._slotId) ?? null;
    }

    _getWorkers() {
        const slot = this._getSlot();
        const data = getBastionData();
        return (data.workers ?? []).filter(w => (slot?.workerIds ?? []).includes(w.id));
    }

    _avgMorale() {
        const workers = this._getWorkers();
        return workers.length
            ? Math.round(workers.reduce((s, w) => s + (w.morale ?? 70), 0) / workers.length)
            : 50;
    }

    async _loadItems() {
        const slot     = this._getSlot();
        const size     = slot?.facilitySize ?? "cramped";
        const rarities = SIZE_RARITIES[size] ?? ["common", "uncommon"];
        this._items    = {};
        for (const r of rarities) {
            this._items[r] = await loadArmamentsTable(r);
        }
        this._loading = false;
    }

    _rarities() {
        const slot = this._getSlot();
        const size = slot?.facilitySize ?? "cramped";
        return SIZE_RARITIES[size] ?? ["common", "uncommon"];
    }

    // ── Render ────────────────────────────────────────────────

    async _renderHTML(context, options) {
        if (this._loading) await this._loadItems();

        const slot      = this._getSlot();
        const workers   = this._getWorkers();
        const avgMorale = this._avgMorale();
        const rarities  = this._rarities();
        const order     = getSmithyOrder(this._slotId);
        const isGM      = game.user.isGM;

        // Worker summary
        const workerHtml = workers.length
            ? workers.map(w => `<span class="wita-smithy-worker">${sanitizeHTML(w.name)}</span>`).join("")
            : `<span style="color:var(--color-form-hint);font-style:italic">No smiths assigned</span>`;

        // Current commission block
        let commissionHtml = "";
        if (order) {
            const rLabel    = { common:"Common", uncommon:"Uncommon", rare:"Rare", veryrare:"Very Rare" }[order.rarity] ?? order.rarity;
            const turnNow   = witaSetting("bastionState")?.turnNumber ?? 0;
            const turnsLeft = Math.max(0, order.turnsRequired - (turnNow - order.turnStarted));
            commissionHtml = `
                <div class="wita-smithy-current-order">
                    <div class="wita-smithy-section-label">Current Commission</div>
                    <div class="wita-smithy-order-row">
                        <i class="fas fa-hammer"></i>
                        <div class="wita-smithy-order-info">
                            <div class="wita-smithy-order-name">${sanitizeHTML(order.itemName)}</div>
                            <div class="wita-smithy-order-meta">
                                <span class="wita-smithy-rarity-badge">${rLabel}</span>
                                <span>Qty: ${order.quantity}</span>
                                <span>DC ${order.dc}</span>
                                <span><i class="fas fa-hourglass-half"></i> ${turnsLeft} turn${turnsLeft !== 1 ? "s" : ""} left</span>
                            </div>
                        </div>
                        ${isGM ? `<button class="wita-detail-micro-btn danger" id="wita-smithy-cancel-order">✕ Cancel</button>` : ""}
                    </div>
                </div>
                <div class="wita-smithy-divider"></div>
            `;
        }

        // Build item dropdown for currently selected rarity
        const currentItems = this._rarity ? (this._items[this._rarity] ?? []) : [];
        const itemOptions  = currentItems.map(i =>
            `<option value="${sanitizeHTML(i.uuid)}" data-name="${sanitizeHTML(i.name)}" data-rarity="${this._rarity}"
                     ${this._selected?.uuid === i.uuid ? "selected" : ""}>${sanitizeHTML(i.name)}</option>`
        ).join("");

        const hasSelection  = !!this._selected;
        const category      = this._selected ? getGenericCategory(this._selected.name) : null;
        const needsBase     = !!category;
        const hasBase       = !!this._baseItem;
        const canCommission = hasSelection && (!needsBase || hasBase);
        const dc            = hasSelection
            ? smithyCraftDC(this._selected.rarity, this._quantity, avgMorale)
            : null;

        const el = document.createElement("div");
        el.className = "wita-smithy-body";
        el.innerHTML = `
            ${commissionHtml}

            <div class="wita-smithy-workers">
                <i class="fas fa-hammer"></i> <strong>Smiths:</strong> ${workerHtml}
                <span class="wita-smithy-morale">Morale: ${avgMorale}</span>
            </div>

            <div class="wita-smithy-section-label">New Commission</div>

            <div class="wita-smithy-form">
                <!-- Row 1: Rarity -->
                <div class="wita-smithy-inline-row">
                    <label class="wita-smithy-form-label">Rarity</label>
                    <select id="wita-smithy-rarity">
                        <option value="">— Select —</option>
                        ${rarities.map(r => `
                            <option value="${r}" ${this._rarity === r ? "selected" : ""}>
                                ${RARITY_LABELS[r]} (${this._items[r]?.length ?? 0})
                            </option>
                        `).join("")}
                    </select>
                </div>

                <!-- Row 2: Item -->
                <div class="wita-smithy-inline-row">
                    <label class="wita-smithy-form-label">Item</label>
                    <select id="wita-smithy-item" ${!this._rarity ? "disabled" : ""}>
                        <option value="">${this._rarity ? "— Select an item —" : "— Select rarity first —"}</option>
                        ${itemOptions}
                    </select>
                </div>

                <!-- Row 3: Sub-selection (generic items only) -->
                <div class="wita-smithy-inline-row" id="wita-smithy-base-row" style="${needsBase ? "" : "display:none"}">
                    <label class="wita-smithy-form-label" id="wita-smithy-base-label">
                        ${category ? (GENERIC_ITEM_PATTERNS.find(p => p.pattern.test(this._selected?.name))?.label ?? "Base") : "Base"}
                    </label>
                    <select id="wita-smithy-base-select">
                        <option value="">— Select base item —</option>
                    </select>
                </div>

                <!-- Cost + turns summary -->
                ${hasSelection ? `
                <div class="wita-smithy-inline-row full">
                    <div class="wita-smithy-cost-summary">
                        ${(() => {
                            const craftCost = RARITY_CRAFTING[this._selected.rarity]?.cost ?? 0;
                            const turns     = smithyCraftTurns(this._selected.rarity, workers.length || 1);
                            const fin       = getFinancialSummary();
                            const balance   = fin?.bankBalance ?? 0;
                            const currency  = fin?.currency ?? "GP";
                            const canAfford = balance >= craftCost;
                            return `
                                <div class="wita-smithy-cost-row">
                                    <span class="wita-smithy-cost-label">Material Cost</span>
                                    <span class="wita-smithy-cost-value ${canAfford ? "" : "wita-smithy-cost-warn"}">${craftCost.toLocaleString()} ${currency}</span>
                                </div>
                                <div class="wita-smithy-cost-row">
                                    <span class="wita-smithy-cost-label">Banker Funds</span>
                                    <span class="wita-smithy-cost-value ${canAfford ? "wita-smithy-cost-ok" : "wita-smithy-cost-warn"}">${balance.toLocaleString()} ${currency}</span>
                                </div>
                                <div class="wita-smithy-cost-row">
                                    <span class="wita-smithy-cost-label">Turns Required</span>
                                    <span class="wita-smithy-cost-value">${turns} turn${turns !== 1 ? "s" : ""}
                                        <span style="color:var(--color-form-hint);font-size:0.65rem">(${workers.length > 1 ? workers.length + " smiths" : "1 smith"})</span>
                                    </span>
                                </div>
                                ${!canAfford ? `<div class="wita-smithy-cost-warning"><i class="fas fa-exclamation-triangle"></i> Insufficient funds — GM can override</div>` : ""}
                            `;
                        })()}
                    </div>
                </div>` : ""}

                <!-- Row 4: Quantity + DC -->
                <div class="wita-smithy-inline-row multi" id="wita-smithy-qty-row" style="${hasSelection ? "" : "display:none"}">
                    <label class="wita-smithy-form-label">Qty</label>
                    <input type="number" id="wita-smithy-qty" value="${this._quantity}" min="1" max="4">
                    <button class="wita-detail-micro-btn" id="wita-smithy-roll-qty">
                        <i class="fas fa-dice-d4"></i> Roll 1d4
                    </button>
                    ${dc !== null ? `<span class="wita-smithy-dc-preview">DC <strong>${dc}</strong></span>` : ""}
                </div>
            </div>

            <div class="wita-smithy-footer">
                <button class="wita-gb-btn primary" id="wita-smithy-confirm" ${canCommission ? "" : "disabled"}>
                    <i class="fas fa-scroll"></i> Commission
                </button>
                <button class="wita-gb-btn" id="wita-smithy-cancel">Cancel</button>
            </div>
        `;

        return el;
    }

    _replaceHTML(result, content, options) {
        const wc = this.element?.querySelector(".window-content");
        if (!wc) return;
        wc.style.cssText = "padding:0;overflow:visible;";
        wc.replaceChildren(result);
        this._attachListeners(wc);
    }

    async _onRender() {}

    // ── Listeners ─────────────────────────────────────────────

    _attachListeners(el) {
        // Cancel existing order
        el.querySelector("#wita-smithy-cancel-order")?.addEventListener("click", async () => {
            const confirmed = await foundry.applications.api.DialogV2.confirm({
                window:  { title: "Cancel Commission" },
                content: "<p>Cancel the active commission? This cannot be undone.</p>",
            }).catch(() => false);
            if (!confirmed) return;
            await clearSmithyOrder(this._slotId);
            ui.notifications.info("WITA | Commission cancelled.");
            const panel = foundry.applications.instances.get("wita-bastion-panel");
            if (panel?.rendered) panel.render({ force: true });
            await this.render({ force: true });
        });

        // Rarity select
        el.querySelector("#wita-smithy-rarity")?.addEventListener("change", async (e) => {
            this._rarity   = e.target.value || null;
            this._selected = null;
            this._baseItem = null;
            await this.render({ force: true });
        });

        // Item select
        el.querySelector("#wita-smithy-item")?.addEventListener("change", async (e) => {
            const opt = e.target.options[e.target.selectedIndex];
            if (!opt.value) {
                this._selected = null;
                this._baseItem = null;
                await this.render({ force: true });
                return;
            }
            this._selected = { uuid: opt.value, name: opt.dataset.name, rarity: this._rarity };
            this._baseItem = null;

            // If generic, populate base select
            const category = getGenericCategory(this._selected.name);
            if (category) {
                await this.render({ force: true });
                // Populate base select after render
                const baseSel = this.element?.querySelector("#wita-smithy-base-select");
                if (baseSel) {
                    baseSel.innerHTML = `<option value="">— Loading... —</option>`;
                    const opts = await loadEquipmentOptions(category);
                    baseSel.innerHTML = `<option value="">— Select base item —</option>` +
                        opts.map(o => `<option value="${sanitizeHTML(o.uuid)}">${sanitizeHTML(o.name)}</option>`).join("");
                }
            } else {
                await this.render({ force: true });
            }
        });

        // Base item select
        el.querySelector("#wita-smithy-base-select")?.addEventListener("change", (e) => {
            const opt = e.target.options[e.target.selectedIndex];
            this._baseItem = opt.value ? { uuid: opt.value, name: opt.text } : null;
            // Update confirm button and DC
            const confirmBtn = this.element?.querySelector("#wita-smithy-confirm");
            const category   = getGenericCategory(this._selected?.name);
            const canCommit  = !!this._selected && (!category || !!this._baseItem);
            if (confirmBtn) {
                if (canCommit) confirmBtn.removeAttribute("disabled");
                else confirmBtn.setAttribute("disabled", "");
            }
            this._refreshDC();
        });

        // Quantity
        el.querySelector("#wita-smithy-qty")?.addEventListener("input", (e) => {
            this._quantity = Math.max(1, Math.min(4, parseInt(e.target.value) || 1));
            this._refreshDC();
        });

        // Roll 1d4 — suggests a value but user can still override
        el.querySelector("#wita-smithy-roll-qty")?.addEventListener("click", async () => {
            const roll = await new Roll("1d4").evaluate();
            await roll.toMessage({ speaker: { alias: "Smithy" }, flavor: "Quantity roll" });
            // Only update if user hasn't manually changed the field
            const input = this.element?.querySelector("#wita-smithy-qty");
            if (input) {
                input.value = roll.total;
                this._quantity = roll.total;
                this._refreshDC();
            }
        });

        // Confirm
        el.querySelector("#wita-smithy-confirm")?.addEventListener("click", () => this._confirm());

        // Cancel dialog
        el.querySelector("#wita-smithy-cancel")?.addEventListener("click", () => {
            this.close();
            this._openBastionFacilities();
        });
    }

    _refreshDC() {
        if (!this._selected) return;
        const avgMorale = this._avgMorale();
        const dc        = smithyCraftDC(this._selected.rarity, this._quantity, avgMorale);
        const dcEl      = this.element?.querySelector(".wita-smithy-dc-preview");
        if (dcEl) dcEl.innerHTML = `DC <strong>${dc}</strong>`;
    }

    _openBastionFacilities() {
        const panel = foundry.applications.instances.get("wita-bastion-panel");
        if (panel?.rendered) {
            panel.bringToFront();
            panel._switchTab?.("facilities", panel.element?.querySelector(".window-content"));
        }
    }

    // ── Commission ────────────────────────────────────────────

    async _confirm() {
        if (!this._selected) return;
        const category = getGenericCategory(this._selected.name);
        if (category && !this._baseItem) {
            ui.notifications.warn("WITA | Please select a base item.");
            return;
        }

        const slot      = this._getSlot();
        const avgMorale = this._avgMorale();

        // Read quantity directly from input at commission time
        const qtyInput = this.element?.querySelector("#wita-smithy-qty");
        if (qtyInput) this._quantity = Math.max(1, Math.min(4, parseInt(qtyInput.value) || 1));

        const workers      = this._getWorkers();
        const turnsRequired = smithyCraftTurns(this._selected.rarity, workers.length || 1);
        const turnStarted   = witaSetting("bastionState")?.turnNumber ?? 0;
        const dc            = smithyCraftDC(this._selected.rarity, this._quantity, avgMorale);
        const materialCost  = RARITY_CRAFTING[this._selected.rarity]?.cost ?? 0;

        const deliveryUuid = this._baseItem?.uuid ?? this._selected.uuid;
        const displayName  = this._baseItem
            ? `${this._selected.name} (${this._baseItem.name})`
            : this._selected.name;

        await setSmithyOrder(this._slotId, {
            itemUuid:      deliveryUuid,
            itemName:      displayName,
            rarity:        this._selected.rarity,
            quantity:      this._quantity,
            turnsRequired,
            turnStarted,
            dc,
            materialCost,
            workerIds:     (slot?.workerIds ?? []).slice(),
        });

        await ChatMessage.create({
            content: `<p><strong>Smithy Commission:</strong> ${this._quantity}× ${displayName}</p>
                      <p>Material cost: ${materialCost.toLocaleString()} GP — ${turnsRequired} turn${turnsRequired > 1 ? "s" : ""} to complete (${workers.length || 1} smith${workers.length !== 1 ? "s" : ""})</p>`,
            speaker: { alias: "Smithy" },
            whisper: ChatMessage.getWhisperRecipients("GM"),
        });

        ui.notifications.info(`WITA | Smithy commissioned: ${this._quantity}× ${displayName} — ${turnsRequired} turn${turnsRequired > 1 ? "s" : ""} to complete.`);

        const panel = foundry.applications.instances.get("wita-bastion-panel");
        if (panel?.rendered) {
            await panel.render({ force: true });
            setTimeout(() => {
                panel._switchTab?.("facilities", panel.element?.querySelector(".window-content"));
            }, 100);
        }

        this.close();
    }
}