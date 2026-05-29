import { sanitizeHTML }          from "../../../core/utils.js";
import { getFinancialSummary }   from "../../data/finance.js";

export async function build(_panel) {
    const el  = document.createElement("div");
    const fin = getFinancialSummary();

    if (!fin) {
        el.innerHTML = `<div class="wita-empty">Financial System module not active or not configured.</div>`;
        return el;
    }

    const { propertyIncome, totalPropertyIncome, ownedStocks, bankBalance, currency, weeksPerMonth } = fin;

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

    el.innerHTML += `<div class="wita-section-label">Bank Account</div>`;
    const callout = document.createElement("div");
    callout.className = "wita-balance-callout";
    callout.innerHTML = `<span>Current Balance</span><span class="wita-balance-value">${bankBalance.toLocaleString()} ${currency}</span>`;
    el.appendChild(callout);

    return el;
}

export function bindListeners(_el, _panel) {
    // Finance tab is read-only
}
