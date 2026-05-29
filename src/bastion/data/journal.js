// ============================================================
// WITA — BASTION JOURNAL
// Merged from bastion-journal.js + bastion-narrative.js
//
// bastion-journal.js:
//   Manages the bastion journal entry and its pages.
//   Journal structure (sort order):
//     0   — Summary page (always first, updated each turn)
//     100 — Most recent detailed report
//     200 — Second most recent detailed report
//     (older reports archived into Summary then deleted)
//
//   Report metadata is stored in page flags (wita.reportSummary)
//   rather than hidden HTML data-attributes, so archive extraction
//   doesn't depend on fragile regex parsing.
//
// bastion-narrative.js:
//   Generates AI narrative sentences for each owned property
//   and stock based on the bastion event roll.
//   Requires an Anthropic API key in module settings.
//   Fallback if API unavailable: plain text sentence.
// ============================================================
import { sanitizeHTML } from "../../core/utils.js";
import { witaSetting } from "../../settings/settings.js";
import { WITAHtml } from "../../core/html.js";

const WITA_SUMMARY_PAGE_NAME = "📋 Summary";
const WITA_SUMMARY_SORT      = 0;
const WITA_REPORT_SORT_START = 100;
const WITA_REPORT_SORT_STEP  = 100;

// ── Get or Create Bastion Journal ──────────────────────────────
export async function getOrCreateBastionJournal() {
    const journalName = witaSetting("bastionJournalName");
    let journal = game.journal.getName(journalName);

    if (!journal) {
        const partyName = sanitizeHTML(witaSetting("bastionPartyName"));
        const location  = sanitizeHTML(witaSetting("bastionLocation"));
        const rests     = witaSetting("longRestsPerTurn");

        journal = await JournalEntry.create({
            name:      journalName,
            ownership: { default: 2 }, // OBSERVER for all players
            pages: [{
                name: WITA_SUMMARY_PAGE_NAME,
                type: "text",
                sort: WITA_SUMMARY_SORT,
                text: {
                    content: `
                        <h1>${sanitizeHTML(journalName)} — Summary</h1>
                        <p>The shared bastion of ${partyName}, located in ${location}.</p>
                        <p>Seneschal reports are generated automatically each bastion turn (every ${rests} long rests).</p>
                        <hr>
                        <h2>Archived Reports</h2>
                        <p><em>No archived reports yet.</em></p>
                    `,
                    format: 1,
                }
            }],
        });
        console.log(`WITA | Created bastion journal: "${journalName}"`);
    }

    return journal;
}

// ── Archive Old Reports ────────────────────────────────────────
export async function archiveOldReports(journal) {
    const maxReports = witaSetting("maxDetailedReports");

    const reportPages = journal.pages.contents
        .filter(p => p.name !== WITA_SUMMARY_PAGE_NAME)
        .sort((a, b) => b.sort - a.sort);

    if (reportPages.length >= maxReports) {
        const toArchive = reportPages.slice(maxReports - 1);
        for (const page of toArchive) {
            await _archivePage(journal, page);
        }
    }

    const remainingReports = journal.pages.contents
        .filter(p => p.name !== WITA_SUMMARY_PAGE_NAME)
        .sort((a, b) => a.sort - b.sort);

    const updates = remainingReports.map((p, i) => ({
        _id:  p.id,
        sort: WITA_REPORT_SORT_START + ((i + 1) * WITA_REPORT_SORT_STEP),
    }));

    if (updates.length) {
        await journal.updateEmbeddedDocuments("JournalEntryPage", updates);
    }
}

// ── Archive a Single Page into Summary ────────────────────────
async function _archivePage(journal, page) {
    const summaryPage = journal.pages.contents.find(p => p.name === WITA_SUMMARY_PAGE_NAME);
    if (!summaryPage) return;

    let summaryContent = summaryPage.text?.content ?? "";
    const row = _extractSummaryRow(page);

    if (summaryContent.includes("<em>No archived reports yet.</em>")) {
        summaryContent = summaryContent.replace(
            `<p><em>No archived reports yet.</em></p>`,
            WITAHtml.table(
                ["Turn", "Date", "Event", "Property Income", "Bank Balance", "Fluctuation"],
                row
            )
        );
    } else if (summaryContent.includes("</table>")) {
        summaryContent = summaryContent.replace("</table>", `${row}</table>`);
    } else {
        summaryContent += `<p>${sanitizeHTML(page.name)} — archived</p>`;
    }

    await summaryPage.update({ "text.content": summaryContent });
    await page.delete();
    console.log(`WITA | Archived report page: "${page.name}"`);
}

// ── Extract Summary Row ────────────────────────────────────────
// Reads report metadata from page flag (wita.reportSummary).
// Falls back to name parsing for legacy pages without flags.
function _extractSummaryRow(page) {
    const meta = page.getFlag?.("wita", "reportSummary");

    if (meta) {
        return WITAHtml.row(
            sanitizeHTML(String(meta.turnNum ?? "?")),
            sanitizeHTML(meta.date ?? "Unknown"),
            sanitizeHTML(meta.eventCategory ?? "—"),
            sanitizeHTML(meta.totalIncome ?? "—"),
            sanitizeHTML(meta.bankBalance ?? "—"),
            sanitizeHTML(meta.fluctuation ?? "—"),
        );
    }

    // Legacy fallback: extract from page name and HTML data attributes
    const nameMatch  = page.name.match(/Turn (\d+)/);
    const turnNum    = nameMatch ? nameMatch[1] : "?";
    const dateMatch  = page.name.match(/— (.+?) \(Turn/);
    const date       = dateMatch ? dateMatch[1] : "Unknown";
    const content    = page.text?.content ?? "";

    const eventMatch   = content.match(/data-event-category="([^"]+)"/);
    const incomeMatch  = content.match(/data-total-income="([^"]+)"/);
    const balanceMatch = content.match(/data-bank-balance="([^"]+)"/);
    const fluctMatch   = content.match(/data-fluctuation="([^"]+)"/);

    return WITAHtml.row(
        sanitizeHTML(turnNum),
        sanitizeHTML(date),
        sanitizeHTML(eventMatch?.[1] ?? "—"),
        sanitizeHTML(incomeMatch?.[1] ?? "—"),
        sanitizeHTML(balanceMatch?.[1] ?? "—"),
        sanitizeHTML(fluctMatch?.[1] ?? "—"),
    );
}

// ── Add Seneschal Report Page ──────────────────────────────────
export async function addSeneschalReportPage(journal, turnNumber, date, reportContent, event, financial) {
    const pageName = `Seneschal Report — ${date} (Turn ${turnNumber})`;
    const currency = financial?.currency ?? "GP";

    await JournalEntryPage.create({
        name: pageName,
        type: "text",
        sort: WITA_REPORT_SORT_START,
        text: { content: reportContent, format: 1 },
        flags: { wita: { reportSummary: {
            turnNum:       turnNumber,
            date,
            eventCategory: event?.category ?? "",
            totalIncome:   `${financial?.totalPropertyIncome ?? 0} ${currency}`,
            bankBalance:   `${(financial?.bankBalance ?? 0).toLocaleString()} ${currency}`,
            fluctuation:   event?.fluctuationType ?? "",
        }}},
    }, { parent: journal });

    console.log(`WITA | Created journal page: "${pageName}"`);
}

// ── Send GM Action Chat Message ────────────────────────────────
// Whispers the Collect Earnings instructions to the GM.
export function sendBastionActionMessage(turnNumber, event, financial) {
    if (!game.user.isGM) return;

    const gmId = game.users.find(u => u.isGM && u.active)?.id;
    if (!gmId) return;

    const economyName = _witaEconomyName();

    ChatMessage.create({
        content: WITAHtml.join(
            `<h3>📋 Bastion Turn #${turnNumber} — Seneschal Action Required</h3>`,
            `<p>This turn's event was <strong>${sanitizeHTML(event.category)}</strong> (Roll: ${event.roll}/${event.maxRoll}).</p>`,
            `<ol>`,
            `<li>Open the <strong>Financial System</strong> → <strong>${sanitizeHTML(economyName)}</strong> economy</li>`,
            `<li>Click <strong>Collect Earnings</strong> → select <strong>${sanitizeHTML(event.fluctuationType)}</strong></li>`,
            `<li>The banker account balance will update automatically</li>`,
            `</ol>`,
            !financial ? `<p><em>⚠️ Note: Financial System data could not be read this turn.</em></p>` : null,
        ),
        speaker: { alias: "Whispers in the Abyss" },
        whisper: [gmId],
    });
}

// ── Generate Report HTML ───────────────────────────────────────
export function generateReportHTML(turnNumber, date, event, facilities, financial, narratives = []) {
    const partyName = sanitizeHTML(witaSetting("bastionPartyName"));
    const currency  = sanitizeHTML(financial?.currency ?? "GP");

    return WITAHtml.join(
        `<h1>Seneschal Report</h1>`,
        `<p><strong>Turn:</strong> ${turnNumber} &nbsp;|&nbsp; <strong>Date:</strong> ${sanitizeHTML(date)}</p>`,
        `<p><em>Report compiled by the Seneschal on behalf of ${partyName}.</em></p>`,
        `<hr>`,
        _reportEventHTML(event),
        _reportFacilitiesHTML(facilities),
        _reportFinancialHTML(financial, currency),
        _reportNarrativesHTML(narratives),
        `<p><em>This report was compiled automatically by the WITA Bastion System.
        The GM may annotate this report with additional narrative details.</em></p>`,
    );
}

// ── Report sub-renderers ───────────────────────────────────────

function _reportEventHTML(event) {
    return WITAHtml.section("📜", "Bastion Event", WITAHtml.join(
        `<p><strong>${sanitizeHTML(event?.category ?? "Unknown")}</strong> (Roll: ${event?.roll ?? "?"}/${event?.maxRoll ?? 20})</p>`,
        `<p>${sanitizeHTML(event?.description ?? "")}</p>`,
    ));
}

function _reportFacilitiesHTML(facilities) {
    const body = facilities.map(f => WITAHtml.subsection(
        `${f.icon} ${sanitizeHTML(f.name)}`,
        `<p><em>Roll: ${f.roll}/${f.maxRoll ?? 6}</em> — ${sanitizeHTML(f.report)}</p>`
    )).join("\n");
    return WITAHtml.section("🏰", "Facility Reports", body);
}

function _reportFinancialHTML(financial, currency) {
    if (!financial) return null;

    const bankBalance = financial.bankBalance ?? 0;
    const totalIncome = financial.totalPropertyIncome ?? 0;

    const propertySection = financial.propertyIncome.length > 0
        ? WITAHtml.table(
            ["Property", "Type", "Weekly Income"],
            WITAHtml.join(
                ...financial.propertyIncome
                    .filter(p => p.weeklyIncome > 0)
                    .map(p => WITAHtml.row(p.name, p.type, `${p.weeklyIncome} ${currency}`)),
                WITAHtml.row("<strong>Total</strong>", "", `<strong>${totalIncome} ${currency}</strong>`),
            ),
            "Property Income (this turn)"
        )
        : null;

    const stockSection = financial.ownedStocks.length > 0
        ? WITAHtml.table(
            ["Stock", "Symbol", "Shares", "Price", "Trend", "Total Value"],
            financial.ownedStocks.map(s => {
                const trendIcon = s.trend === "up" ? "📈" : s.trend === "down" ? "📉" : "➡️";
                return WITAHtml.row(
                    s.name, s.symbol, String(s.shares),
                    `${s.currentPrice.toFixed(2)} ${currency}`,
                    `${trendIcon} ${s.trendPercentage}%`,
                    `${s.totalValue} ${currency}`,
                );
            }).join("\n"),
            "Stock Portfolio"
        )
        : null;

    return WITAHtml.section("💰", "Financial Summary", WITAHtml.join(
        `<p><strong>Bank Balance:</strong> ${bankBalance.toLocaleString()} ${currency}</p>`,
        propertySection,
        stockSection,
    ));
}

function _reportNarrativesHTML(narratives) {
    if (!narratives?.length) return null;
    return WITAHtml.section("🏭", "Business &amp; Trade",
        narratives.map(n => `<p>${n.sentence}</p>`).join("\n")
    );
}

// ── Helpers ────────────────────────────────────────────────────

function _witaEconomyName() {
    try {
        const economies = game.settings.get("financial-system", "economies");
        const economy   = economies?.find(e => e.id === witaSetting("economyId"));
        if (economy?.name) return economy.name;
    } catch (e) { /* financial-system may not be active */ }
    return "your economy";
}

// ── Narrative generation ───────────────────────────────────────
// (from bastion-narrative.js)

const WITA_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

// Returns an array of { name, sentence } objects — one per owned property and stock.
export async function generateAssetNarratives(event, financial) {
    if (!financial) return [];

    const assets = _buildAssetList(financial);
    if (!assets.length) return [];

    const apiKey = witaSetting("anthropicApiKey")?.trim();

    if (!apiKey) {
        console.warn("WITA | No Anthropic API key set — using fallback narratives.");
        return _fallbackNarratives(assets, event);
    }

    try {
        return await _callAnthropicAPI(apiKey, assets, event, financial);
    } catch (e) {
        console.warn("WITA | Anthropic API call failed, using fallback narratives:", e);
        return _fallbackNarratives(assets, event);
    }
}

function _buildAssetList(financial) {
    const assets = [];

    for (const p of (financial.propertyIncome ?? [])) {
        assets.push({
            type:   "property",
            name:   p.name,
            detail: `${p.type} property generating ${p.weeklyIncome} ${financial.currency}/week`,
        });
    }

    for (const s of (financial.ownedStocks ?? [])) {
        const trend = s.trend === "up" ? "trending up" : s.trend === "down" ? "trending down" : "stable";
        assets.push({
            type:   "stock",
            name:   `${s.name} (${s.symbol})`,
            detail: `${s.shares} share(s) at ${s.currentPrice.toFixed(2)} ${financial.currency}, ${trend} ${s.trendPercentage}%`,
        });
    }

    return assets;
}

function _fallbackNarratives(assets, event) {
    return assets.map(a => ({
        name:     a.name,
        sentence: `${sanitizeHTML(a.name)} experienced ${sanitizeHTML(event.categoryName)} this turn.`,
    }));
}

async function _callAnthropicAPI(apiKey, assets, event, financial) {
    const assetDescriptions = assets.map(a => `- ${a.name}: ${a.detail}`).join("\n");

    const prompt = `You are writing a weekly Seneschal report for a fantasy bastion. Write exactly one short sentence (15-25 words) for each asset listed below. The tone should be formal and professional, like a steward's status update. Do not use bullet points or numbering — output one sentence per line, in the same order as the assets listed. Do not include the asset name at the start of each sentence — weave it naturally into the sentence.

This week's bastion event was: ${event.categoryName} — ${event.description}

Assets owned by the bastion banker:
${assetDescriptions}

Write one sentence per asset reflecting the ${event.categoryName} event outcome. Output only the sentences, one per line, nothing else.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type":      "application/json",
            "x-api-key":         apiKey,
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
            model:      WITA_ANTHROPIC_MODEL,
            max_tokens: 300,
            messages:   [{ role: "user", content: prompt }],
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Anthropic API error ${response.status}: ${err}`);
    }

    const data      = await response.json();
    const text      = data?.content?.[0]?.text?.trim() ?? "";

    if (!text) throw new Error("Anthropic API returned empty response.");

    const sentences = text.split("\n").map(s => s.trim()).filter(s => s.length > 0);

    return assets.map((asset, i) => ({
        name:     asset.name,
        sentence: sanitizeHTML(sentences[i] ?? `${asset.name} experienced ${event.categoryName} this turn.`),
    }));
}

// ── In-Panel Report Storage ───────────────────────────────────────────────────
// Reports are stored in the "bastionReports" world setting instead of a journal.
// Structure: { detailed: [ReportEntry, ...], archive: [ArchiveEntry, ...] }
// ReportEntry:  { id, turnNumber, date, eventCategory, totalIncome, html, createdAt }
// ArchiveEntry: { id, turnNumber, date, eventCategory, totalIncome }

export async function saveReportToPanel(turnNumber, date, reportHTML, event, financial) {
    const maxDetailed = witaSetting("maxDetailedReports") ?? 2;

    let raw;
    try { raw = game.settings.get("wita", "bastionReports"); } catch(_) { raw = null; }
    const stored = {
        detailed: Array.isArray(raw?.detailed) ? [...raw.detailed] : [],
        archive:  Array.isArray(raw?.archive)  ? [...raw.archive]  : [],
    };

    const totalIncome = financial
        ? `${financial.totalPropertyIncome} ${financial.currency}/wk`
        : null;

    stored.detailed.unshift({
        id:            foundry.utils.randomID(),
        turnNumber,
        date,
        eventCategory: sanitizeHTML(event?.categoryName ?? ""),
        totalIncome,
        html:          reportHTML,
        createdAt:     Date.now(),
    });

    // Overflow oldest detailed reports into the archive (strip html)
    while (stored.detailed.length > maxDetailed) {
        const old = stored.detailed.pop();
        stored.archive.unshift({
            id:            old.id,
            turnNumber:    old.turnNumber,
            date:          old.date,
            eventCategory: old.eventCategory,
            totalIncome:   old.totalIncome,
        });
    }

    // Keep archive bounded (max 50 entries)
    stored.archive = stored.archive.slice(0, 50);

    await game.settings.set("wita", "bastionReports", stored);
    console.log(`WITA | Report saved for turn #${turnNumber} (${stored.detailed.length} detailed, ${stored.archive.length} archived).`);
}
