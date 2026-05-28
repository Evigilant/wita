// ============================================================
// WITA Guildhall — config.js
// Constants and derived values
// ============================================================

export const MODULE_ID       = "wita";  // guildhall lives inside wita
export const GUILDHALL_ITEM_ID = "dmgGuildhall0000";
export const PARTY_ACTOR_ID  = "DCLpjkoEgT2owczH";

// Guildhall facility size → capacity limits
export const GUILDHALL_CAPACITY = {
    cramped: { maxActiveQuests: 2, maxHirelingsOut: 4  },
    roomy:   { maxActiveQuests: 4, maxHirelingsOut: 8  },
    vast:    { maxActiveQuests: 6, maxHirelingsOut: 12 },
};

// Danger level labels and icons
export const DANGER_LEVELS = {
    1: { label: "Trivial",    icon: "fa-skull",       colour: "var(--color-level-success)" },
    2: { label: "Low",        icon: "fa-skull",       colour: "var(--color-level-success)" },
    3: { label: "Moderate",   icon: "fa-skull",       colour: "var(--color-level-warning)" },
    4: { label: "Dangerous",  icon: "fa-skull",       colour: "var(--color-level-error)"   },
    5: { label: "Deadly",     icon: "fa-skull",       colour: "var(--color-level-error)"   },
};

// Reward level labels
export const REWARD_LEVELS = {
    1: { label: "Minor"     },
    2: { label: "Modest"    },
    3: { label: "Moderate"  },
    4: { label: "Major"     },
    5: { label: "Legendary" },
};

// Complexity DC derived from dangerLevel + rewardLevel
// DC = (dangerLevel * 2) + Math.round(rewardLevel * 1.5)
// Range: min 3+2=5 (trivial/minor) → max 10+7=17 (deadly/legendary)
export function complexityDC(dangerLevel, rewardLevel) {
    return (dangerLevel * 2) + Math.round(rewardLevel * 1.5);
}

// Quest outcome tiers based on roll vs DC
export const OUTCOME = {
    CRIT_FAIL: "crit_fail",
    FAIL:      "fail",
    PARTIAL:   "partial",
    SUCCESS:   "success",
    CRIT_SUCCESS: "crit_success",
};

export function getOutcome(roll, dc) {
    const margin = roll - dc;
    if (margin <= -6) return OUTCOME.CRIT_FAIL;
    if (margin < 0)   return OUTCOME.FAIL;
    if (margin === 0) return OUTCOME.PARTIAL;
    if (margin < 5)   return OUTCOME.SUCCESS;
    return OUTCOME.CRIT_SUCCESS;
}

export const OUTCOME_LABELS = {
    [OUTCOME.CRIT_FAIL]:    { label: "Critical Failure", colour: "var(--color-level-error)",   icon: "fa-skull-crossbones" },
    [OUTCOME.FAIL]:         { label: "Failure",          colour: "var(--color-level-error)",   icon: "fa-times-circle"     },
    [OUTCOME.PARTIAL]:      { label: "Partial Success",  colour: "var(--color-level-warning)", icon: "fa-minus-circle"     },
    [OUTCOME.SUCCESS]:      { label: "Success",          colour: "var(--color-level-success)", icon: "fa-check-circle"     },
    [OUTCOME.CRIT_SUCCESS]: { label: "Critical Success", colour: "var(--color-level-success)", icon: "fa-star"             },
};

// Hireling health roll results
export function getHirelingHealthResult(roll) {
    if (roll === 1)          return { status: "Killed",            restWeeks: null, moraleBonus: 0,   label: "Killed in action"         };
    if (roll <= 5)           return { status: "Severely Injured",  restWeeks: 2,    moraleBonus: -15, label: "Severely injured (2 weeks rest)" };
    if (roll <= 9)           return { status: "Injured",           restWeeks: 1,    moraleBonus: -10, label: "Injured (1 week rest)"    };
    if (roll === 20)         return { status: "Active",            restWeeks: 0,    moraleBonus: 10,  label: "Returns inspired!"        };
    return                          { status: "Active",            restWeeks: 0,    moraleBonus: 0,   label: "Returned unharmed"        };
}

// CC urgency → danger level mapping
export const CC_URGENCY_TO_DANGER = {
    low:    1,
    medium: 2,
    high:   4,
    urgent: 5,
};

// Quest statuses
export const QUEST_STATUS = {
    AVAILABLE: "available",
    ACTIVE:    "active",      // hirelings assigned, awaiting turn resolution
    RESOLVING: "resolving",   // being processed this turn
    COMPLETED: "completed",
    FAILED:    "failed",
};
