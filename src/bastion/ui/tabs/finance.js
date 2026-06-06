import { sanitizeHTML }                                        from "../../../core/utils.js";
import { getFinancialSummary, getWorkerWagesSummary, formatWage } from "../../data/finance.js";

export async function build(_panel) {
    const el  = document.createElement("div");
    const fin = getFinancialSummary();
    const currency = fin?.currency ?? "GP";

    if (!fin) {
        el.innerHTML = `<div class="wita-empty" style="margin-bottom:0.5rem">Financial System module not active or not configured.</div>`;
    }

    const { propertyIncome, totalPropertyIncome, ownedStocks, bankBalance, weeksPerMonth } = fin ?? {};

    if (!fin) {
        // Skip property/stock/bank sections — financial system not active
    } else {
    el.innerHTML += `<div class="wita-section-label">Property Income</div>`;
    if (!propertyIncome?.length) {
        el.innerHTML += `<div class="wita-empty" style="padding:0.4rem 0">No rented properties.</div>`;
    } else {
        const tbl = document.createElement("table");
        tbl.className = "wita-finance-table";
        tbl.innerHTML = `
            <thead><tr>
                <th>Property</th>
                <th>Type</th>
                <th style="text-align:right">Weekly</th>
                <th style="text-align:right" title="Weekly × ${weeksPerMonth} weeks/month">Monthly ×${weeksPerMonth}</th>
            </tr></thead>
            <tbody>
                ${propertyIncome.map(p => `
                <tr>
                    <td>${sanitizeHTML(p.name)}</td>
                    <td style="color:var(--color-form-hint)">${sanitizeHTML(p.type)}</td>
                    <td style="text-align:right;font-weight:600">${p.weeklyIncome} ${currency}</td>
                    <td style="text-align:right;color:var(--color-form-hint)">${p.monthlyIncome} ${currency}</td>
                </tr>`).join("")}
                <tr style="border-top:1px solid var(--color-fieldset-border)">
                    <td colspan="2" style="text-align:right;font-weight:700">Total Weekly</td>
                    <td style="text-align:right;font-weight:700;color:var(--color-highlights)">${totalPropertyIncome} ${currency}</td>
                    <td></td>
                </tr>
            </tbody>
        `;
        el.appendChild(tbl);
    }

    if (ownedStocks?.length) {
        el.innerHTML += `<div class="wita-section-label">Stocks</div>`;
        const stbl = document.createElement("table");
        stbl.className = "wita-finance-table";
        stbl.innerHTML = `
            <thead><tr><th>Stock</th><th>Shares</th><th style="text-align:right">Price</th><th style="text-align:right">Value</th><th>Trend</th></tr></thead>
            <tbody>
                ${ownedStocks.map(s => {
                    const tc = s.trend === "up" ? "wita-trend-up" : s.trend === "down" ? "wita-trend-down" : "wita-trend-flat";
                    const ti = s.trend === "up" ? "▲" : s.trend === "down" ? "▼" : "—";
                    return `<tr>
                        <td><strong>${sanitizeHTML(s.symbol)}</strong></td>
                        <td>${s.shares}</td>
                        <td style="text-align:right">${s.currentPrice}</td>
                        <td style="text-align:right;font-weight:600">${s.totalValue}</td>
                        <td class="${tc}">${ti} ${s.trendPercentage ?? 0}%</td>
                    </tr>`;
                }).join("")}
            </tbody>
        `;
        el.appendChild(stbl);
    }

    // Worker Wages section (shown even when no properties, wages apply regardless)
    const wages = getWorkerWagesSummary();
    el.innerHTML += `<div class="wita-section-label">Worker Wages</div>`;
    if (!wages.workers.length) {
        el.innerHTML += `<div class="wita-empty" style="padding:0.4rem 0">No active workers.</div>`;
    } else {
        const wtbl = document.createElement("table");
        wtbl.className = "wita-finance-table";
        wtbl.innerHTML = `
            <thead><tr>
                <th>Worker</th>
                <th>Profession</th>
                <th style="text-align:center">Lvl</th>
                <th style="text-align:right">Weekly</th>
            </tr></thead>
            <tbody>
                ${wages.workers.map(w => `
                <tr>
                    <td>${sanitizeHTML(w.name)}</td>
                    <td style="color:var(--color-form-hint)">${sanitizeHTML(w.profession)}</td>
                    <td style="text-align:center">${w.level}</td>
                    <td style="text-align:right;font-weight:600">${formatWage(w.weeklyWage)}</td>
                </tr>`).join("")}
                <tr style="border-top:1px solid var(--color-fieldset-border)">
                    <td colspan="3" style="text-align:right;font-weight:700">Total Weekly</td>
                    <td style="text-align:right;font-weight:700;color:var(--color-level-error)">${wages.totalWeeklyWage} ${currency}</td>
                </tr>
            </tbody>
        `;
        el.appendChild(wtbl);

        // Net weekly income
        const net = totalPropertyIncome - wages.totalWeeklyWage;
        const netColour = net >= 0 ? "var(--color-level-success)" : "var(--color-level-error)";
        const netEl = document.createElement("div");
        netEl.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:0.3rem 0.5rem;margin:0.4rem 0;border:1px solid var(--color-fieldset-border);border-radius:3px;font-size:0.8rem";
        netEl.innerHTML = `
            <span style="font-weight:700">Net Weekly Income</span>
            <span style="font-weight:700;color:${netColour}">${net >= 0 ? "+" : ""}${net} ${sanitizeHTML(currency)}</span>
        `;
        el.appendChild(netEl);
    }

    el.innerHTML += `<div class="wita-section-label">Bank Account</div>`;
    const callout = document.createElement("div");
    callout.className = "wita-balance-callout";
    callout.innerHTML = `<span>Current Balance</span><span class="wita-balance-value">${bankBalance.toLocaleString()} ${currency}</span>`;
    el.appendChild(callout);
    } // end if (fin)

    return el;
}

export function bindListeners(_el, _panel) {
    // Finance tab is read-only
}
