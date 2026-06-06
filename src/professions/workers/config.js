// ============================================================
// WITA — WORKER PROFESSION CONFIG
// Defines all worker profession types and defender ranks.
// XP is earned based on the facility a worker is assigned to,
// not their primaryProfession selection.
// ============================================================

// ── Shared progression ────────────────────────────────────────
// All professions use the same XP thresholds and bonus values.
// Only titles differ per profession.

export const PROFESSION_PROGRESSION = [
    { level:1, xp:0,    bonus:0 },
    { level:2, xp:200,  bonus:1 },
    { level:3, xp:600,  bonus:2 },
    { level:4, xp:1400, bonus:3 },
];

const DEFAULT_XP_TABLE = {
    bastionTurnActive:    30,
    crisisSetbackSurvival:40,
};

function mkProf(label, icon, facilityNames, titles, xpTable) {
    return {
        label,
        icon,
        facilityNames,
        levelTable: PROFESSION_PROGRESSION.map((row, i) => ({ ...row, title: titles[i] ?? `Level ${row.level}` })),
        xpTable: xpTable ?? DEFAULT_XP_TABLE,
    };
}

// ── Profession definitions ────────────────────────────────────

export const WITA_WORKER_PROFESSIONS = {
    steward:       mkProf("Steward",               "fas fa-scroll",
        ["guildhall", "great hall", "throne room"],
        ["Trainee", "Adventurer", "Professional", "Expert"]),

    cook:          mkProf("Cook",                  "fas fa-utensils",
        ["kitchen", "tavern", "pub", "dining room"],
        ["Kitchen Hand", "Cook", "Chef", "Head Chef"]),

    farmer:        mkProf("Farmer",                "fas fa-seedling",
        ["farm", "garden", "greenhouse", "stable"],
        ["Laborer", "Farmhand", "Farmer", "Yeoman"]),

    administratum: mkProf("Administratum Adept",   "fas fa-book",
        ["library", "scriptorium", "archive"],
        ["Scrivener", "Notary", "Adept", "High Adept"]),

    arcanist:      mkProf("Inquisitorial Psyker",  "fas fa-star-of-david",
        ["teleportation circle", "arcane tower", "arcane study", "demiplane"],
        ["Wyrm", "Acolyte", "Interrogator", "Inquisitor"]),

    astronomica:   mkProf("Adeptus Astronomica",   "fas fa-satellite-dish",
        ["observatory"],
        ["Probationer", "Chorister", "Cantor", "Grand Cantor"]),

    mechanicus:    mkProf("Adeptus Mechanicus",    "fas fa-cog",
        ["laboratory", "smithy", "forge", "workshop", "menagerie"],
        ["Novitiate", "Techwright", "Enginseer", "Magos"],
        { smithySuccess: 100, smithyPartialSuccess: 50, smithyFailure: 20,
          bastionTurnActive: 30, crisisSetbackSurvival: 40 }),

    ministorum:    mkProf("Adeptus Ministorum",    "fas fa-place-of-worship",
        ["meditation chamber", "reliquary", "sacristy", "sanctuary", "sanctum"],
        ["Novitiate", "Confessor", "Deacon", "Cardinal"]),

    guard:         mkProf("Astra Militarum",       "fas fa-shield-alt",
        ["barracks", "bedroom", "armory", "training area", "war room"],
        ["Whiteshield", "Guardsman", "Sergeant", "Commissar"],
        { bastionTurnActive: 30, crisisSetbackSurvival: 50 }),

    recruiter:     mkProf("Recruiter",             "fas fa-users",
        ["barracks", "war room", "menagerie", "teleportation circle"],
        ["Scout", "Headhunter", "Handler", "Spymaster"],
        { bastionTurnActive: 30, hireCommon: 25, hireUncommon: 75, hireRare: 200, hireVeryRare: 500, crisisSetbackSurvival: 40 }),
};

// ── Defender ranks ────────────────────────────────────────────

export const WITA_DEFENDER_RANKS = [
    { rank:"recruit", xp:0,   bonus:0, label:"Recruit" },
    { rank:"soldier", xp:300, bonus:1, label:"Soldier" },
    { rank:"veteran", xp:900, bonus:2, label:"Veteran" },
];

export const CROSS_TRAIN_THRESHOLD = 2;
export const CROSS_TRAIN_RATE      = 0.5;

export function getProfessionForFacility(facilityName) {
    if (!facilityName) return null;
    const lower = facilityName.toLowerCase();
    for (const [key, cfg] of Object.entries(WITA_WORKER_PROFESSIONS)) {
        if (cfg.facilityNames.some(f => lower.includes(f))) return key;
    }
    return null;
}
