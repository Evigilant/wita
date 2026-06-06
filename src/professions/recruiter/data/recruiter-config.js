// ============================================================
// WITA — RECRUITER CONFIG
// Rarity thresholds, XP tables, name/bio fragment pools.
// ============================================================

// Ordered highest-first; rarityForRoll() returns first where roll >= min.
// hirecostWeeks: hire fee = (weeks × hireling's weekly wage based on XP tier)
// common L1 → 1.4 GP × 5 = ~7 GP; uncommon L1 → 1.4 × 15 = ~21 GP;
// rare L2 → 3.5 × 20 = ~70 GP; veryRare L3 → 7 × 28 = ~196 GP
export const RARITY_THRESHOLDS = [
    { rarity: "veryRare", min: 91, xpPrimary: 700, hirecostWeeks: 28, recruiterXPKey: "hireVeryRare" },
    { rarity: "rare",     min: 76, xpPrimary: 300, hirecostWeeks: 20, recruiterXPKey: "hireRare"     },
    { rarity: "uncommon", min: 51, xpPrimary: 150, hirecostWeeks: 15, recruiterXPKey: "hireUncommon" },
    { rarity: "common",   min: 1,  xpPrimary: 25,  hirecostWeeks: 5,  recruiterXPKey: "hireCommon"   },
];

export const RARITY_LABELS = {
    common:   "Common",
    uncommon: "Uncommon",
    rare:     "Rare",
    veryRare: "Very Rare",
};

export const RARITY_COLOURS = {
    common:   "#9d9d9d",
    uncommon: "#1eff00",
    rare:     "#0070dd",
    veryRare: "#a335ee",
};

// XP distribution bands: 1d20 + modifier → % of total XP to primary profession
export const XP_DISTRIBUTION_BANDS = [
    { max: 5,        primary: 0.40 },
    { max: 10,       primary: 0.55 },
    { max: 15,       primary: 0.70 },
    { max: 20,       primary: 0.85 },
    { max: Infinity, primary: 0.95 },
];

// Facility name substring → dominant candidate profession pool
export const FACILITY_DOMINANT_PROF = {
    "barracks":             "guard",
    "war room":             "guard",
    "menagerie":            "mechanicus",
    "teleportation circle": "arcanist",
};

// ── Name generation tables ─────────────────────────────────────

export const NAME_TABLES = {
    guard: {
        first: ["Kael", "Tessa", "Draven", "Marric", "Jyn", "Petra", "Oswin", "Cass", "Brenn", "Lyra",
                "Vorn", "Dax", "Sera", "Holt", "Nira", "Galen", "Rael", "Demi", "Sable", "Kern"],
        last:  ["Colt", "Greiss", "Vorn", "Steele", "Hask", "Dayne", "Ferris", "Mord", "Renn", "Thorn",
                "Creed", "Blunt", "Skar", "Ironside", "Ashford", "Crisp", "Vance", "Drake", "Marsh", "Bane"],
    },
    mechanicus: {
        first:     ["Theta", "Vranus", "Sigma", "Delta", "Kappa", "Omicron", "Rho", "Phi", "Zeta", "Lambda",
                    "Epsilon", "Tau", "Iota", "Mu", "Nu", "Xi", "Psi", "Chi", "Eta", "Beta"],
        last:      ["Kappius", "Halleck", "Delt", "Varis", "Morn", "Hallec", "Kress", "Vantus", "Mordax", "Ferrix",
                    "Corvus", "Helix", "Stratum", "Nexus", "Vertex", "Torque", "Praxis", "Flux", "Axiom", "Clade"],
        numSuffix: ["I", "II", "III", "IV", "V", "VI", "VII", "IX", "X", "XI", "XII", "XIV"],
        format:    (first, last, suffix) => `${first}-${suffix} ${last}`,
    },
    arcanist: {
        first: ["Aurel", "Mira", "Caelith", "Serath", "Loran", "Vex", "Mael", "Theron", "Solan", "Elara",
                "Cael", "Nyx", "Dorn", "Vael", "Seren", "Lycan", "Morel", "Auren", "Thane", "Saris"],
        last:  ["Vex", "Solan", "Dorn", "Myren", "Crest", "Falor", "Helm", "Vorath", "Kaine", "Alder",
                "Morn", "Seer", "Vane", "Quill", "Rook", "Ardent", "Pale", "Croft", "Lune", "Vire"],
    },
    default: {
        first: ["Rael", "Tenne", "Corra", "Sable", "Wren", "Dax", "Lyra", "Kern", "Nira", "Voss",
                "Mira", "Cael", "Jorn", "Petra", "Holt", "Sera", "Bren", "Oswin", "Kira", "Demi"],
        last:  ["Ashford", "Mord", "Drake", "Vance", "Crisp", "Marsh", "Ferris", "Thorn", "Renn", "Blunt",
                "Hask", "Steele", "Creed", "Bane", "Skar", "Dayne", "Colt", "Vorn", "Greiss", "Ironside"],
    },
};

// ── Bio generation tables ──────────────────────────────────────

export const BIO_TABLES = {
    guard: {
        origin: [
            "Born under the manufactorum skies of Cadia.",
            "Raised in the underhive, steel was always closer than bread.",
            "Hails from a long line of Whiteshields; the regiment was home before the barracks.",
            "A conscript who outlasted every officer who drafted them.",
        ],
        service: [
            "Served three tours with the 8th Shock Regiment before seeking private employ.",
            "Dishonourably discharged after questioning a commissar's orders — and surviving.",
            "Seconded to planetary defence for five years before the regiment was disbanded.",
            "Volunteered for the penal legions once; left before the term was up.",
        ],
        trait: [
            "Keeps their lasgun cleaner than their uniform.",
            "Hasn't slept a full night in years, but never misses a watch.",
            "Speaks in clipped sentences and answers questions with questions.",
            "Won't drink on duty. Drinks heavily off it.",
        ],
    },
    mechanicus: {
        origin: [
            "Inducted into the Cult Mechanicus at adolescence; the flesh was already an afterthought.",
            "Separated from their Skitarii cohort during the siege of Hive Mordax.",
            "Recovered from a battlefield by a Magos seeking salvageable augmetics.",
            "A forge-world orphan who learned machine-cant before Low Gothic.",
        ],
        service: [
            "Designated combat-support after three augmetic enhancements rendered standard-pattern armour unsuitable.",
            "Assigned to prospecting detail; their mechadendrite still carries residual ore-dust.",
            "Served as a data-smith for a Rogue Trader's tech-priests before the contract expired.",
            "Attached to a Skitarii ranger maniple until budgetary reallocation made them surplus.",
        ],
        trait: [
            "Communicates in clipped binary bursts when surprised.",
            "Regards biological emotion as an inefficiency worth documenting.",
            "Maintains a prayer-log of every machine they have interfaced with.",
            "Has removed two of their original fingers and considers this an improvement.",
        ],
    },
    arcanist: {
        origin: [
            "Screened by the Black Ships but deemed low-risk; released to serve under sanctioned conditions.",
            "Self-taught — which the Scholastica Psykana considers either impressive or dangerous.",
            "Born on a world where psykers were tolerated; that world no longer exists.",
            "The first in their bloodline to manifest. The family does not discuss it.",
        ],
        service: [
            "Attached to a Rogue Trader's court as a void-navigator before the warp took the ship.",
            "Seconded to Inquisitorial retinue; details of that posting are sealed.",
            "Served as a battlefield astropath until the signals grew too loud.",
            "Hired as a diviner for a noble house; left when the visions became inconvenient truths.",
        ],
        trait: [
            "Their left eye occasionally lights up during stress.",
            "Keeps a copper token engraved with a ward they will not explain.",
            "Never stands with their back to a door.",
            "Dreams in languages they do not speak waking.",
        ],
    },
    default: {
        origin: [
            "Came from a frontier settlement that no longer appears on Imperial maps.",
            "Grew up in service; the concept of not working for someone has never quite landed.",
            "Left their last post without explanation. References are available but not recommended.",
            "Has worked in three sub-sectors and collected scars from each.",
        ],
        service: [
            "Most recently employed as a freelance specialist; prefers not to elaborate.",
            "Spent four years on a void-hauler before the cargo proved problematic.",
            "Worked under a succession of employers; outlasted all of them.",
            "Once accepted a job that paid in promissory notes. Never again.",
        ],
        trait: [
            "Keeps a small notebook. Will not say what is in it.",
            "Eats the same meal every day. Refuses to explain why.",
            "Polite to a fault, which most people find more unsettling than rudeness.",
            "Has an opinion about everything and shares it only when asked. Mostly.",
        ],
    },
};
