import { sanitizeHTML } from "../../../core/utils.js";

export function build(_panel) {
    const el  = document.createElement("div");
    let raw;
    try { raw = game.settings.get("wita", "bastionReports"); } catch(_) { raw = null; }
    const detailed = Array.isArray(raw?.detailed) ? raw.detailed : [];
    const archive  = Array.isArray(raw?.archive)  ? raw.archive  : [];

    if (!detailed.length && !archive.length) {
        el.innerHTML = `<div class="wita-empty">No reports yet. Reports appear here after each bastion turn.</div>`;
        return el;
    }

    if (detailed.length) {
        const lbl = document.createElement("div");
        lbl.className = "wita-section-label";
        lbl.textContent = "Recent Reports";
        el.appendChild(lbl);

        for (const report of detailed) {
            el.appendChild(_buildReportCard(report));
        }
    }

    if (archive.length) {
        const lbl = document.createElement("div");
        lbl.className = "wita-section-label";
        lbl.style.marginTop = "0.75rem";
        lbl.textContent = "Archive";
        el.appendChild(lbl);

        const tbl = document.createElement("table");
        tbl.className = "wita-finance-table";
        tbl.innerHTML = `
            <thead><tr>
                <th>Turn</th><th>Date</th><th>Event</th><th style="text-align:right">Income</th>
            </tr></thead>
            <tbody>
                ${archive.map(a => `
                <tr>
                    <td style="font-weight:600">#${sanitizeHTML(String(a.turnNumber ?? "?"))}</td>
                    <td style="color:var(--color-form-hint);font-size:0.72rem">${sanitizeHTML(a.date ?? "")}</td>
                    <td style="font-size:0.72rem">${sanitizeHTML(a.eventCategory ?? "")}</td>
                    <td style="text-align:right;font-size:0.72rem;color:var(--color-highlights)">${sanitizeHTML(a.totalIncome ?? "—")}</td>
                </tr>`).join("")}
            </tbody>
        `;
        el.appendChild(tbl);
    }

    return el;
}

function _buildReportCard(report) {
    const card = document.createElement("div");
    card.className = "wita-report-card";
    card.style.cssText = "border:1px solid var(--color-fieldset-border);border-radius:4px;margin-bottom:0.5rem;overflow:hidden";

    const header = document.createElement("div");
    header.className = "wita-report-card-header";
    header.style.cssText = "display:flex;align-items:center;gap:0.5rem;padding:0.35rem 0.6rem;cursor:pointer;background:var(--color-bg-btn);user-select:none";
    header.innerHTML = `
        <span style="font-weight:700;font-size:0.8rem">Turn #${sanitizeHTML(String(report.turnNumber ?? "?"))}</span>
        <span style="font-size:0.72rem;color:var(--color-form-hint);flex:1">${sanitizeHTML(report.date ?? "")}</span>
        ${report.eventCategory ? `<span class="wita-badge" style="font-size:0.65rem">${sanitizeHTML(report.eventCategory)}</span>` : ""}
        ${report.totalIncome ? `<span style="font-size:0.72rem;color:var(--color-highlights)">${sanitizeHTML(report.totalIncome)}</span>` : ""}
        <i class="fas fa-chevron-down wita-report-chevron" style="font-size:0.65rem;transition:transform 0.2s"></i>
    `;

    const body = document.createElement("div");
    body.className = "wita-report-card-body";
    body.style.cssText = "padding:0.5rem 0.6rem;font-size:0.75rem;display:none;overflow-y:auto;max-height:320px";
    if (report.html) body.innerHTML = report.html;

    header.addEventListener("click", () => {
        const open = body.style.display !== "none";
        body.style.display  = open ? "none" : "block";
        const chevron = header.querySelector(".wita-report-chevron");
        if (chevron) chevron.style.transform = open ? "" : "rotate(180deg)";
    });

    card.appendChild(header);
    card.appendChild(body);
    return card;
}

export function bindListeners(_el, _panel) {
    // Reports tab is read-only; interactivity is handled inline above
}
