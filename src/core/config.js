// ============================================================
// WITA — STATIC CONFIG
// Values that don't change at runtime. Settings-backed values
// are read via witaSetting() at call time — never cached here.
//
// WITA_SEED_FACILITIES / WITA_SEED_EVENTS are used only when
// auto-creating the ⚙️ Bastion Config journal on first load.
// ============================================================

export const WITA_DRAGON_AGES = ["Ancient", "Young", "Adult"];

export const WITA_CURRENCY_CONFIG = {
    cp: { label: "Copper",   img: "icons/commodities/currency/coin-engraved-waves-copper.webp" },
    sp: { label: "Silver",   img: "icons/commodities/currency/coin-engraved-moon-silver.webp" },
    ep: { label: "Electrum", img: "icons/commodities/currency/coin-inset-copper-axe.webp" },
    gp: { label: "Gold",     img: "icons/commodities/currency/coin-embossed-crown-gold.webp" },
    pp: { label: "Platinum", img: "icons/commodities/currency/coin-inset-snail-silver.webp" },
};

// Combined loot + currency tables (combined d100 roll)
export const WITA_LOOT_TABLES = [
    // CR 0-4
    {
        maxCR: 4,
        rolls: [
            { threshold: 31,  coins: { cp: "5d6" },     lootTable: "1. Common Loot",   lottery: null },
            { threshold: 100, coins: { sp: "4d6" },     lootTable: "2. Uncommon Loot", lottery: null },
            { threshold: 101, coins: { sp: "4d6" },     lootTable: "2. Uncommon Loot",
                lottery: { table: "3. Rare Loot", formula: "2d100kl" } },
        ]
    },
    // CR 5-10
    {
        maxCR: 10,
        rolls: [
            { threshold: 2,   coins: {},                lootTable: null,               lottery: null },
            { threshold: 6,   coins: { cp: "5d6" },    lootTable: "1. Common Loot",   lottery: null },
            { threshold: 26,  coins: { sp: "4d6" },    lootTable: "2. Uncommon Loot", lottery: null },
            { threshold: 100, coins: { gp: "2d6" },    lootTable: "3. Rare Loot",     lottery: null },
            { threshold: 101, coins: { pp: "1d6" },    lootTable: "3. Rare Loot",
                lottery: { table: "4. Very Rare Loot", formula: "2d100kl" } },
        ]
    },
    // CR 11-16
    {
        maxCR: 16,
        rolls: [
            { threshold: 2,   coins: {},                lootTable: null,                lottery: null },
            { threshold: 16,  coins: { gp: "2d6" },    lootTable: "3. Rare Loot",      lottery: null },
            { threshold: 100, coins: { gp: "2d6*10" }, lootTable: "4. Very Rare Loot", lottery: null },
            { threshold: 101, coins: { pp: "1d6*10" }, lootTable: "4. Very Rare Loot",
                lottery: { table: "5. Legendary Loot", formula: "2d100kl" } },
        ]
    },
    // CR 17+
    {
        maxCR: 100,
        rolls: [
            { threshold: 2,   coins: {},                 lootTable: null,                lottery: null },
            { threshold: 21,  coins: { gp: "2d6*10" },  lootTable: "4. Very Rare Loot", lottery: null },
            { threshold: 100, coins: { gp: "1d6*100" }, lootTable: "5. Legendary Loot", lottery: null },
            { threshold: 101, coins: { pp: "1d6*10" },  lootTable: "5. Legendary Loot", lottery: null },
        ]
    },
];

// Seed data for auto-creating the ⚙️ Bastion Config journal.
// After creation, the GM edits the journal pages directly.
export const WITA_SEED_FACILITIES = `## 🐴 Stables
1-2: One of the horses fell ill but is recovering. Stable hands have been tending to it.
3-4: The stables are operating normally. Horses are healthy and well-fed.
5-6: An excellent week in the stables. One of the horses has shown exceptional progress in training.

## 🍖 Kitchen
1-2: Supplies are running low. The cook requests restocking before next week.
3-4: The kitchen is well-stocked and staff are well-fed. Morale remains stable.
5-6: The cook has prepared exceptional meals this week, boosting staff morale significantly.

## ⚒️ Blacksmith
1-2: The forge needed minor repairs, causing a slight delay in production.
3-4: The smithy is operating at normal capacity. Maintenance work continues as ordered.
5-6: The blacksmith completed additional work this week, producing extra equipment for the armory.

## ⚔️ Guild Quarters
1-2: One mercenary requested leave this week. Quarters are otherwise occupied and orderly.
3-4: The mercenaries are resting and prepared for assignment. No incidents to report.
5-6: The mercenaries have been training vigorously. They are in excellent condition and ready for deployment.

## 🛡️ Barracks
1-2: Defenders reported a suspicious figure near the perimeter. Investigation found nothing conclusive.
3-4: Defenders maintained their watch rotation without incident. The bastion perimeter is secure.
5-6: Defenders intercepted a would-be thief attempting to breach the outer wall. Threat neutralized.

## 🌀 Portal Room
1-2: The portal showed minor instability this week. The engineer has stabilized it but recommends inspection.
3-4: The portal is functioning normally and ready for use. Daily recall capability is at full power.
5-6: The portal's energy seems particularly strong this week. Recall range may be slightly enhanced.

## 📋 Seneschal
1-2: The Seneschal handled a minor dispute between staff members. Order has been restored.
3-4: Operations managed smoothly. All trade and business interests attended to as instructed.
5-6: The Seneschal negotiated a favorable trade arrangement this week, slightly increasing weekly revenue.`;

export const WITA_SEED_EVENTS = `## 🔴 Crisis
1-1: A serious problem requires immediate attention. The Seneschal requests the party return as soon as possible.

## 🟠 Setback
2-5: A minor setback has occurred at the bastion. Some resources may have been lost or delayed.

## 🟡 Routine
6-10: The bastion operates normally. No major events to report.

## 🟢 Opportunity
11-15: A favorable development has occurred. The Seneschal has taken advantage of a new opportunity.

## 🔵 Windfall
16-19: An unexpected benefit has come to the bastion. Morale is high among the staff.

## ⭐ Triumph
20-20: An exceptional event has greatly benefited the bastion. The Seneschal's management has paid off handsomely.`;
