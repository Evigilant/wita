// ============================================================
// WITA — LOOT & HARVEST
// GM-authority handler invoked via socketlib.
// ============================================================
import { WITA_CURRENCY_CONFIG, WITA_LOOT_TABLES } from "../core/config.js";
import { WITA_LOCKS, sanitizeHTML, isDefeated, whisperMessage, rollEquipmentFate, normalizeName } from "../core/utils.js";
import { witaSetting } from "../settings/settings.js";
import { WITAHtml } from "../core/html.js";

// ── Lock guard ─────────────────────────────────────────────────
async function _witaWithLock(targetId, userId, fn) {
    if (WITA_LOCKS.has(targetId)) {
        whisperMessage("Another player is currently looting this corpse, please wait.", userId);
        return;
    }
    WITA_LOCKS.add(targetId);
    try { await fn(); }
    finally { WITA_LOCKS.delete(targetId); }
}

// ── Roll Coins ─────────────────────────────────────────────────
async function rollCoins(token, currencies) {
    let coinsAdd = "";
    let coinsRoll = "";
    for (const [type, formula] of Object.entries(currencies)) {
        if (!formula || formula === "0") continue;
        const roll   = await new Roll(String(formula)).evaluate();
        const config = WITA_CURRENCY_CONFIG[type];
        await ItemPiles.API.addCurrencies(token, `${roll.total}${type}`);
        coinsRoll += `${formula} ${type.toUpperCase()} `;
        coinsAdd  += WITAHtml.row(
            `<img src="${config.img}" width=22 height=22/> ${config.label}`,
            `${roll.total} (${formula})`
        );
    }
    return { coinsAdd, coinsRoll };
}

// ── Roll Loot ──────────────────────────────────────────────────
// Looks up loot tables from the wita-loot-tables compendium pack —
// NOT game.tables — so tables never need to be imported into the world.
async function rollLoot(token, tableName, formula = null) {
    const lootTablesPackId = "wita.wita-loot-tables";
    const lootTablesPack   = game.packs.get(lootTablesPackId);
    if (!lootTablesPack) {
        console.warn(`WITA | Loot tables pack not found: ${lootTablesPackId}`);
        return null;
    }

    const index = await lootTablesPack.getIndex();
    const entry = index.find(e => e.name === tableName);
    if (!entry) {
        console.log(`WITA | Loot table not found in pack: ${tableName}`);
        return null;
    }

    const table  = await lootTablesPack.getDocument(entry._id);
    if (!table) return null;

    const roll   = formula ? await new Roll(formula).evaluate() : null;
    const result = await table.draw({ roll, displayChat: false });
    const item   = result.results[0];
    if (!item) return null;

    const itemPack = game.packs.get(item.documentCollection);
    if (!itemPack) return null;
    const doc = await itemPack.getDocument(item.documentId);
    if (!doc) return null;

    await ItemPiles.API.addItems(token, [{ item: doc }]);
    return doc;
}

// ── Loot chat message builder ──────────────────────────────────
function _lootChatHTML(tokenName, fateResult, overallRoll, coinsAdd, lootDoc) {
    const fateMessages = {
        destroyed:   `⚔️ The heat of battle destroyed most of <b>${tokenName}</b>'s equipment.`,
        salvageable: `🛡️ Some of <b>${tokenName}</b>'s equipment survived, though showing wear.`,
        intact:      `✨ <b>${tokenName}</b>'s equipment appears largely undamaged.`,
    };

    const coinsSection = coinsAdd
        ? WITAHtml.table(["Currency", "Amount"], coinsAdd, "Currency found:")
        : null;

    const lootSection = lootDoc
        ? WITAHtml.table(["Item", "Amount"],
            WITAHtml.row(`<img src="${lootDoc.img}" width=22 height=22/> ${sanitizeHTML(lootDoc.name)}`, "1"),
            "Item found:")
        : null;

    const nothingLine = (!coinsAdd && !lootDoc) ? `<p><i>Nothing of value was found.</i></p>` : null;

    return WITAHtml.join(
        `<h3>Looting ${tokenName}</h3>`,
        `<p>${fateMessages[fateResult]}</p>`,
        `<p>Overall roll: <b>${overallRoll}</b></p>`,
        coinsSection,
        lootSection,
        nothingLine,
    );
}

// ── Execute Loot ───────────────────────────────────────────────
async function executeLoot(targetIds, userId) {
    for (const targetId of targetIds) {
        await _witaWithLock(targetId, userId, async () => {
            const token = canvas.tokens.get(targetId);
            if (!token) return;
            const tokActor = token.actor;

            if (!isDefeated(token)) {
                whisperMessage(`${sanitizeHTML(token.name)} is not defeated yet!`, userId);
                return;
            }

            if (tokActor.effects.find(e => e.name === "Looted")) {
                whisperMessage(`${sanitizeHTML(token.name)} has already been looted.`, userId);
                return;
            }

            const cr   = tokActor.system.details.cr ?? 0;
            const fate = rollEquipmentFate(cr);

            if (fate.result === "destroyed") {
                const itemIds = tokActor.items.map(i => i.id);
                await tokActor.deleteEmbeddedDocuments("Item", itemIds);
            }

            await ItemPiles.API.turnTokensIntoItemPiles(token);

            const overAllRoll = await new Roll("1d100").evaluate();
            const crEntry     = WITA_LOOT_TABLES.find(t => cr <= t.maxCR);
            const rollEntry   = crEntry?.rolls.find(r => overAllRoll.total < r.threshold);

            let coinsAdd = "", lootDoc = null;

            if (rollEntry) {
                if (Object.keys(rollEntry.coins).length) {
                    ({ coinsAdd } = await rollCoins(token, rollEntry.coins));
                }
                if (rollEntry.lottery) {
                    lootDoc = await rollLoot(token, rollEntry.lottery.table, rollEntry.lottery.formula);
                } else if (rollEntry.lootTable) {
                    lootDoc = await rollLoot(token, rollEntry.lootTable);
                }
            }

            await ActiveEffect.create({
                name: "Looted",
                img: "icons/skills/social/theft-pickpocket-bribery-brown.webp",
                disabled: false,
                duration: { seconds: 86400 },
                description: "This corpse has been looted.",
                flags: { core: { overlay: true } },
                transfer: false,
            }, { parent: tokActor, renderSheet: false });

            whisperMessage(_lootChatHTML(sanitizeHTML(token.name), fate.result, overAllRoll.total, coinsAdd, lootDoc), userId);
            await ItemPiles.API.renderItemPileInterface(token);
        });
    }
}

// ── Execute Harvest ────────────────────────────────────────────
async function executeHarvest(targetIds, userId) {
    for (const targetId of targetIds) {
        await _witaWithLock(targetId, userId, async () => {
            const token = canvas.tokens.get(targetId);
            if (!token) return;
            const tokActor = token.actor;
            if (!isDefeated(token)) return;

            const harvesterPackId    = witaSetting("harvesterPackId");
            const harvestItemsPackId = witaSetting("harvestItemsPackId");
            const harvesterPack      = game.packs.get(harvesterPackId);
            const harvestItemsPack   = game.packs.get(harvestItemsPackId);

            if (!harvesterPack || !harvestItemsPack) {
                console.warn("WITA | Harvest packs not found:", harvesterPackId, harvestItemsPackId);
                return;
            }

            const creatureType = tokActor.system?.details?.type?.value ?? "unknown";
            const normalName   = normalizeName(tokActor.name ?? "");

            const harvesterIndex = await harvesterPack.getIndex();
            const tableEntry     = harvesterIndex.find(e =>
                e.name.toLowerCase().includes(normalName.toLowerCase()) ||
                e.name.toLowerCase().includes(creatureType.toLowerCase())
            );

            if (!tableEntry) {
                console.log(`WITA | No harvest table for: ${normalName}`);
                return;
            }

            const table  = await harvesterPack.getDocument(tableEntry._id);
            const result = await table.draw({ displayChat: false });
            const drawn  = result.results[0];
            if (!drawn) return;

            const itemsIndex = await harvestItemsPack.getIndex();
            const itemEntry  = itemsIndex.find(e => e.name === drawn.text);

            if (!itemEntry) {
                console.log(`WITA | Harvest item not found: ${drawn.text}`);
                return;
            }

            const itemDoc = await harvestItemsPack.getDocument(itemEntry._id);
            if (!itemDoc) return;

            await ItemPiles.API.addItems(token, [{ item: itemDoc }]);
            whisperMessage(
                `🌿 Harvested <b>${sanitizeHTML(itemDoc.name)}</b> from ${sanitizeHTML(token.name)}.`,
                userId
            );
        });
    }
}

// ── GM Entry Point (called via socketlib) ──────────────────────
export async function executeLootAndHarvest(targetIds, userId) {
    await executeLoot(targetIds, userId);
    await executeHarvest(targetIds, userId);
}

console.log("WITA | Loot module loaded.");
