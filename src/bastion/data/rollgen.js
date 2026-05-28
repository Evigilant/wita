// ============================================================
// WITA — BASTION ROLLGEN
// Merged from bastion-config.js + bastion-facilities.js
//
// bastion-config.js:
//   Manages the GM-only ⚙️ Bastion Config journal.
//   Pages:
//     Facilities — defines facility roll tables
//     Events     — defines the d20 bastion event table
//     Narrative  — world-specific business/trade text
//
// bastion-facilities.js:
//   Rolls facility and event outcomes by reading from
//   the ⚙️ Bastion Config journal at turn time.
//   Supports dynamic addition/removal of facilities and
//   events without touching any code files.
//
// Parser format for Facilities and Events pages:
//   ## [icon] [Name]
//   N-N: Outcome text for this roll range.
//   N-N: Another outcome text.
//
// Rules:
//   - Ranges must start at 1
//   - Ranges must be contiguous (no gaps)
//   - Ranges must not overlap
//   - Each ## block must have at least one range
//   - Violations error loudly to console AND chat
// ============================================================
import { sanitizeHTML, witaRoll } from "../../core/utils.js";
import { WITA_SEED_FACILITIES, WITA_SEED_EVENTS } from "../../core/config.js";
import { witaSetting } from "../../settings/settings.js";

const WITA_CONFIG_JOURNAL_NAME_KEY = "bastionConfigJournalName";
const WITA_CONFIG_PAGE_FACILITIES  = "Facilities";
const WITA_CONFIG_PAGE_EVENTS      = "Events";

// ── Get or Create Config Journal ───────────────────────────────
// Called once on ready hook. Creates the journal with
// seeded default content if it doesn't already exist.
export async function getOrCreateBastionConfigJournal() {
    const journalName = witaSetting(WITA_CONFIG_JOURNAL_NAME_KEY);
    let journal = game.journal.getName(journalName);

    if (!journal) {
        journal = await JournalEntry.create({
            name:      journalName,
            ownership: { default: 0 }, // GM only — no player access
            pages: [
                {
                    name: WITA_CONFIG_PAGE_FACILITIES,
                    type: "text",
                    sort: 100,
                    text: {
                        content: `<pre>${sanitizeHTML(WITA_SEED_FACILITIES)}</pre>`,
                        format: 1,
                    }
                },
                {
                    name: WITA_CONFIG_PAGE_EVENTS,
                    type: "text",
                    sort: 200,
                    text: {
                        content: `<pre>${sanitizeHTML(WITA_SEED_EVENTS)}</pre>`,
                        format: 1,
                    }
                },
            ],
        });
        console.log(`WITA | Created bastion config journal: "${journalName}"`);
        ui.notifications.info(`WITA | Created "${journalName}" journal. Open it to customise your bastion facilities and events.`);
    }

    return journal;
}

Hooks.once("ready", () => {
    if (!game.user.isGM) return;
    if (!witaSetting("enableBastionAutomation")) return;
    getOrCreateBastionConfigJournal();
});

// ── Parse Config Page ──────────────────────────────────────────
// Parses a Facilities or Events journal page into an array of blocks.
// Each block: { name, icon, ranges: [{ min, max, text }] }
// Errors loudly on any validation failure.
function _parseConfigPage(pageContent, pageName, mode = "facility") {
    const plain = pageContent
        .replace(/<pre[^>]*>/gi, "")
        .replace(/<\/pre>/gi, "")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .trim();

    const lines   = plain.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    const blocks  = [];
    let current   = null;

    for (const line of lines) {
        if (line.startsWith("## ")) {
            if (current) blocks.push(current);
            const header   = line.slice(3).trim();
            const spaceIdx = header.indexOf(" ");
            const icon = spaceIdx > -1 ? header.slice(0, spaceIdx) : header;
            const name = spaceIdx > -1 ? header.slice(spaceIdx + 1).trim() : header;
            current = { name, icon, ranges: [] };
        } else if (current && /^\d+-\d+:/.test(line)) {
            const colonIdx  = line.indexOf(":");
            const rangePart = line.slice(0, colonIdx).trim();
            const text      = line.slice(colonIdx + 1).trim();
            const [minStr, maxStr] = rangePart.split("-");
            const min = parseInt(minStr, 10);
            const max = parseInt(maxStr, 10);
            if (isNaN(min) || isNaN(max) || min > max) {
                _bastionConfigError(`${pageName}: Invalid range "${rangePart}" in block "## ${current.icon} ${current.name}"`);
                return null;
            }
            current.ranges.push({ min, max, text });
        }
    }

    if (current) blocks.push(current);

    if (!blocks.length) {
        _bastionConfigError(`${pageName}: No ## blocks found. Check journal page format.`);
        return null;
    }

    if (mode === "facility") {
        for (const block of blocks) {
            const label  = `## ${block.icon} ${block.name}`;

            if (!block.ranges.length) {
                _bastionConfigError(`${pageName}: Block "${label}" has no roll ranges.`);
                return null;
            }

            const sorted = [...block.ranges].sort((a, b) => a.min - b.min);

            if (sorted[0].min !== 1) {
                _bastionConfigError(`${pageName}: Block "${label}" ranges must start at 1 (found ${sorted[0].min}).`);
                return null;
            }

            for (let i = 1; i < sorted.length; i++) {
                const prev = sorted[i - 1];
                const curr = sorted[i];
                if (curr.min !== prev.max + 1) {
                    if (curr.min <= prev.max) {
                        _bastionConfigError(`${pageName}: Block "${label}" has overlapping ranges: ${prev.min}-${prev.max} and ${curr.min}-${curr.max}.`);
                    } else {
                        _bastionConfigError(`${pageName}: Block "${label}" has a gap between ranges: ${prev.max} and ${curr.min}.`);
                    }
                    return null;
                }
            }

            block.ranges  = sorted;
            block.maxRoll = sorted[sorted.length - 1].max;
        }

    } else {
        for (const block of blocks) {
            const label = `## ${block.icon} ${block.name}`;
            if (!block.ranges.length) {
                _bastionConfigError(`${pageName}: Block "${label}" has no roll ranges.`);
                return null;
            }
            const sorted = [...block.ranges].sort((a, b) => a.min - b.min);
            for (let i = 1; i < sorted.length; i++) {
                const prev = sorted[i - 1];
                const curr = sorted[i];
                if (curr.min <= prev.max) {
                    _bastionConfigError(`${pageName}: Block "${label}" has overlapping ranges: ${prev.min}-${prev.max} and ${curr.min}-${curr.max}.`);
                    return null;
                }
                if (curr.min !== prev.max + 1) {
                    _bastionConfigError(`${pageName}: Block "${label}" has a gap between ranges: ${prev.max} and ${curr.min}.`);
                    return null;
                }
            }
            block.ranges  = sorted;
            block.maxRoll = sorted[sorted.length - 1].max;
        }

        const allRanges = blocks.flatMap(b => b.ranges).sort((a, b) => a.min - b.min);

        if (allRanges[0].min !== 1) {
            _bastionConfigError(`${pageName}: Event ranges must start at 1 (first range starts at ${allRanges[0].min}).`);
            return null;
        }

        for (let i = 1; i < allRanges.length; i++) {
            const prev = allRanges[i - 1];
            const curr = allRanges[i];
            if (curr.min <= prev.max) {
                _bastionConfigError(`${pageName}: Overlapping event ranges across blocks: ${prev.min}-${prev.max} and ${curr.min}-${curr.max}.`);
                return null;
            }
            if (curr.min !== prev.max + 1) {
                _bastionConfigError(`${pageName}: Gap in event ranges between ${prev.max} and ${curr.min}.`);
                return null;
            }
        }
    }

    return blocks;
}

// ── Load Facilities from Config Journal ────────────────────────
export function loadFacilitiesFromConfig() {
    const journalName = witaSetting(WITA_CONFIG_JOURNAL_NAME_KEY);
    const journal     = game.journal.getName(journalName);

    if (!journal) {
        _bastionConfigError(`Bastion Config journal "${journalName}" not found. Run WITA_BASTION.triggerTurn() to auto-create it, or check the journal name in module settings.`);
        return null;
    }

    const page = journal.pages.contents.find(p => p.name === WITA_CONFIG_PAGE_FACILITIES);
    if (!page) {
        _bastionConfigError(`Bastion Config journal is missing the "${WITA_CONFIG_PAGE_FACILITIES}" page.`);
        return null;
    }

    return _parseConfigPage(page.text?.content ?? "", `Facilities`, "facility");
}

// ── Load Events from Config Journal ───────────────────────────
export function loadEventsFromConfig() {
    const journalName = witaSetting(WITA_CONFIG_JOURNAL_NAME_KEY);
    const journal     = game.journal.getName(journalName);

    if (!journal) {
        _bastionConfigError(`Bastion Config journal "${journalName}" not found.`);
        return null;
    }

    const page = journal.pages.contents.find(p => p.name === WITA_CONFIG_PAGE_EVENTS);
    if (!page) {
        _bastionConfigError(`Bastion Config journal is missing the "${WITA_CONFIG_PAGE_EVENTS}" page.`);
        return null;
    }

    return _parseConfigPage(page.text?.content ?? "", `Events`, "event");
}

// ── Config Error Reporter ──────────────────────────────────────
// Errors loudly to both console and GM chat.
export function _bastionConfigError(message) {
    const full = `WITA | Bastion Config Error: ${message}`;
    console.error(full);
    ui.notifications.error(`WITA | Bastion config error — check console (F12) for details.`);

    const gmId = game.users.find(u => u.isGM && u.active)?.id;
    if (gmId) {
        ChatMessage.create({
            content: `
                <h3>⚠️ WITA Bastion Config Error</h3>
                <p>${sanitizeHTML(message)}</p>
                <p><em>Open the <strong>${witaSetting(WITA_CONFIG_JOURNAL_NAME_KEY)}</strong> journal and fix the format, then try again.</em></p>
            `,
            speaker: { alias: "Whispers in the Abyss" },
            whisper: [gmId],
        });
    }
}

// ── Roll Bastion Event ─────────────────────────────────────────
// (from bastion-facilities.js)

// Maps bastion event category name to Financial System
// fluctuation type for Collect Earnings.
const WITA_FLUCTUATION_MAP = {
    "Crisis":      "Negative Fluctuation",
    "Setback":     "Negative Fluctuation",
    "Routine":     "Standard (Earnings Only)",
    "Opportunity": "Random Fluctuation",
    "Windfall":    "Positive Fluctuation",
    "Triumph":     "Positive Fluctuation",
};

// Reads event blocks from config journal, rolls against them,
// and returns the matched event with fluctuation type.
export function rollBastionEvent() {
    const events = loadEventsFromConfig();
    if (!events?.length) return null;

    const maxRoll = Math.max(...events.map(e => e.maxRoll));
    const roll    = witaRoll(maxRoll);

    let matched = null;
    for (const event of events) {
        const range = event.ranges.find(r => roll >= r.min && roll <= r.max);
        if (range) {
            matched = { event, range };
            break;
        }
    }

    if (!matched) {
        _bastionConfigError(`Events: No event matched roll ${roll}/${maxRoll}. Check that ranges cover 1-${maxRoll} completely.`);
        return null;
    }

    const categoryName = matched.event.name.trim();
    const fluctuation  = WITA_FLUCTUATION_MAP[categoryName] ?? "Standard (Earnings Only)";

    return {
        roll,
        maxRoll,
        category:        `${matched.event.icon} ${matched.event.name}`,
        categoryName,
        description:     matched.range.text,
        fluctuationType: fluctuation,
    };
}

// ── Process Facilities ─────────────────────────────────────────
// Reads facility blocks from config journal and rolls each one.
// Each facility has its own die size determined by its highest range value.
export function processFacilities() {
    const facilities = loadFacilitiesFromConfig();
    if (!facilities?.length) return [];

    return facilities.map(facility => {
        const roll    = witaRoll(facility.maxRoll);
        const matched = facility.ranges.find(r => roll >= r.min && roll <= r.max);

        if (!matched) {
            _bastionConfigError(`Facilities: No outcome matched roll ${roll}/${facility.maxRoll} for facility "${facility.icon} ${facility.name}". Check that ranges cover 1-${facility.maxRoll} completely.`);
            return {
                name:   facility.name,
                icon:   facility.icon,
                roll,
                report: "⚠️ Configuration error — check Bastion Config journal.",
            };
        }

        return {
            name:    facility.name,
            icon:    facility.icon,
            roll,
            maxRoll: facility.maxRoll,
            report:  matched.text,
        };
    });
}
