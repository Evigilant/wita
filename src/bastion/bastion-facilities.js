// ============================================================
// WITA — BASTION FACILITIES
// Rolls facility and event outcomes by reading from
// the ⚙️ Bastion Config journal at turn time.
// Supports dynamic addition/removal of facilities and
// events without touching any code files.
// ============================================================
import { witaRoll } from "../core/utils.js";
import { loadFacilitiesFromConfig, loadEventsFromConfig, _bastionConfigError } from "./bastion-config.js";

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

// ── Roll Bastion Event ─────────────────────────────────────────
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
