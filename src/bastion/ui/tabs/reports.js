import { sanitizeHTML, witaSetting } from "../../../core/utils.js";

export function build(_panel) {
    const el      = document.createElement("div");
    const journal = game.journal.getName(witaSetting("bastionName") ?? "");
    if (!journal) {
        el.innerHTML = `<div class="wita-empty">Bastion journal not found. Run a bastion turn first.</div>`;
        return el;
    }

    const pages = journal.pages.contents
        .filter(p => !p.name?.toLowerCase().includes("archive"))
        .sort((a, b) => (b.sort ?? 0) - (a.sort ?? 0));

    if (!pages.length) {
        el.innerHTML = `<div class="wita-empty">No reports yet.</div>`;
        return el;
    }

    const list = document.createElement("div");
    list.className = "wita-report-list";
    for (const page of pages) {
        const s   = page.getFlag?.("wita", "reportSummary") ?? _fallbackSummary(page);
        const row = document.createElement("div");
        row.className = "wita-report-row";
        row.dataset.pageId    = page.id;
        row.dataset.journalId = journal.id;
        row.innerHTML = `
            <span class="wita-report-turn">Turn ${sanitizeHTML(String(s?.turnNumber ?? "?"))}</span>
            <span class="wita-report-date">${sanitizeHTML(s?.date ?? page.name ?? "")}</span>
            <span class="wita-report-event">${sanitizeHTML(s?.eventCategory ?? "")}</span>
            ${s?.totalIncome ? `<span class="wita-report-income">${sanitizeHTML(s.totalIncome)}</span>` : ""}
            <i class="fas fa-external-link-alt" style="font-size:0.55rem;opacity:0.4;flex-shrink:0"></i>
        `;
        list.appendChild(row);
    }
    el.appendChild(list);

    const archive = journal.pages.contents.find(p => p.name?.toLowerCase().includes("archive"));
    if (archive) {
        el.innerHTML += `<p style="font-size:0.65rem;color:var(--color-form-hint);margin-top:0.5rem;text-align:center">
            <a class="wita-open-archive" data-page-id="${archive.id}" data-journal-id="${journal.id}" href="#" style="color:var(--color-highlights)">Open archive</a>
        </p>`;
    }

    return el;
}

export function bindListeners(el, _panel) {
    el.querySelectorAll(".wita-report-row").forEach(row =>
        row.addEventListener("click", () => {
            game.journal.get(row.dataset.journalId)?.sheet.render(true, { pageId: row.dataset.pageId });
        })
    );
    el.querySelectorAll(".wita-open-archive").forEach(link =>
        link.addEventListener("click", e => {
            e.preventDefault();
            game.journal.get(link.dataset.journalId)?.sheet.render(true, { pageId: link.dataset.pageId });
        })
    );
}

function _fallbackSummary(page) {
    const c = page.text?.content ?? "";
    return {
        turnNumber:    c.match(/data-turn-number="(\d+)"/)?.[1],
        date:          c.match(/data-report-date="([^"]+)"/)?.[1],
        eventCategory: c.match(/data-event-category="([^"]+)"/)?.[1],
        totalIncome:   c.match(/data-total-income="([^"]+)"/)?.[1],
    };
}
