// ============================================================
// WITA — COMBAT LOG
// Logs combat encounters to a master journal.
//
// Structure:
//   ⚔️ Combat Log  (master journal, one page per scene)
//   └── [Scene Name]
//       ## Encounter N — [Imperial Date] | [Real Date]
//           ### Summary  (archived rounds table)
//           ### Round N
//               [turn rows]
//           ### Round N Summary
// ============================================================
import { sanitizeHTML, getImperialDate } from "../core/utils.js";
import { witaSetting } from "../settings/settings.js";

export class WITACombatLog {
    static #encounters       = {}; // keyed by combat.id
    static #roundWriteTimer  = null;
    static #writing          = false;

    // ── Date helpers ───────────────────────────────────────────
    static #formatDate(includeTime = true) {
        const n = new Date();
        const d = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`;
        return includeTime
            ? `${d} ${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}`
            : d;
    }

    // ── Mana helper ────────────────────────────────────────────
    static #getMana(actor) {
        if (actor?.type !== "character") return null;
        try {
            return {
                current: actor.getFlag("mana-system", "data.mana.current") ?? 0,
                max:     actor.getFlag("mana-system", "data.mana.max")     ?? 0,
            };
        } catch { return null; }
    }

    // ── Health estimate ────────────────────────────────────────
    static #healthEstimate(actor) {
        const hp = actor?.system?.attributes?.hp;
        if (!hp) return "Unknown";
        if ((hp.value ?? 0) <= 0) return "Unconscious";
        const pct = hp.max > 0 ? (hp.value / hp.max) * 100 : 0;

        try {
            const modId = game.modules.get("healthEstimate")  ? "healthEstimate"
                        : game.modules.get("health-estimate") ? "health-estimate"
                        : null;
            if (modId) {
                const est   = game.settings.get(modId, "estimates");
                const table = est?.default ?? est;
                if (Array.isArray(table) && table.length) {
                    const match = [...table].sort((a,b) => a.value - b.value).find(e => pct <= e.value);
                    if (match?.label) return match.label;
                }
            }
        } catch { /* fallback below */ }

        if (pct <= 0)  return "Unconscious";
        if (pct <= 25) return "Near Death";
        if (pct <= 50) return "Badly Injured";
        if (pct <= 75) return "Injured";
        if (pct <= 99) return "Barely Injured";
        return "Unharmed";
    }

    // ── Death saves ────────────────────────────────────────────
    static #deathSaves(actor) {
        const hp    = actor?.system?.attributes?.hp;
        const death = actor?.system?.attributes?.death;
        if (!death || !hp || hp.value > 0) return null;
        return { success: death.success ?? 0, failure: death.failure ?? 0 };
    }

    // ── Status effect icons ────────────────────────────────────
    // Icon src is allowlisted to known safe prefixes only.
    static #SAFE_ICON_PREFIXES = ["systems/", "modules/", "icons/", "assets/"];

    static #safeIcon(src) {
        if (!src || typeof src !== "string") return null;
        return WITACombatLog.#SAFE_ICON_PREFIXES.some(p => src.startsWith(p)) ? src : null;
    }

    static #getStatusIcons(actor) {
        if (!actor) return "";
        return actor.effects.contents
            .filter(e => !e.disabled && e.icon)
            .map(e => {
                const src = WITACombatLog.#safeIcon(e.icon);
                if (!src) return "";
                return `<img src="${src}" title="${sanitizeHTML(e.name ?? "")}" style="width:16px;height:16px;vertical-align:middle;margin-right:1px">`;
            })
            .join("");
    }

    // ── HP cell for archive row ────────────────────────────────
    // Takes explicit dealt param so archive captures pre-reset values.
    static #hpCell(actorId, enc, dealt) {
        const snap = enc.combatantSnaps[actorId];
        if (!snap) return "—";
        const hp  = snap.actor?.system?.attributes?.hp;
        const cur = hp?.value ?? "?";
        const max = snap.hpMax ?? hp?.max ?? "?";
        const ds  = WITACombatLog.#deathSaves(snap.actor);

        let cell = `${dealt ?? 0}d · ${cur}/${max}hp`;
        if (cur === 0 || cur === "0") {
            const skull = `<img src="icons/svg/skull.svg" style="width:16px;height:16px;vertical-align:middle;margin-right:2px">`;
            const saves = ds ? ` ${ds.success}✓ ${ds.failure}✗` : "";
            cell += ` ${skull}${saves}`;
        }
        return cell;
    }

    // ── Friendly actor classification ──────────────────────────
    static #getFriendlyActorIds() {
        try {
            const partyActor = game.actors.get(witaSetting("partyActorId"));
            if (!partyActor) throw new Error("Party actor not found");
            const targets = partyActor.flags?.dnd5e?.restSettings?.targets ?? [];
            if (!targets.length) throw new Error("No targets in party actor");
            return new Set(targets);
        } catch (e) {
            console.warn("WITA | Combat log: party actor fallback to ownership check.", e.message);
            return null;
        }
    }

    static #isFriendlyActor(actor, friendlyIds) {
        if (!actor) return false;
        if (friendlyIds) return friendlyIds.has(actor.id);
        return Object.entries(actor.ownership ?? {}).some(([userId, level]) => {
            const user = game.users.get(userId);
            return user && !user.isGM && level >= 3;
        });
    }

    // ── Encounter state init ───────────────────────────────────
    static #initEncounter(combat) {
        const friendlyIds = WITACombatLog.#getFriendlyActorIds();

        const friendlyCombatants = combat.combatants.contents
            .filter(c => WITACombatLog.#isFriendlyActor(c.actor, friendlyIds));
        const opponentCombatants = combat.combatants.contents
            .filter(c => !WITACombatLog.#isFriendlyActor(c.actor, friendlyIds));

        const combatantSnaps = {};
        for (const c of combat.combatants.contents) {
            if (!c.actor) continue;
            const hp   = c.actor.system?.attributes?.hp;
            const mana = WITACombatLog.#getMana(c.actor);
            combatantSnaps[c.actorId] = {
                actor:      c.actor,
                name:       sanitizeHTML(c.name ?? "Unknown"),
                hpMax:      hp?.max ?? "?",
                mana,
                isFriendly: WITACombatLog.#isFriendlyActor(c.actor, friendlyIds),
            };
        }

        return {
            combatId:              combat.id,
            sceneName:             sanitizeHTML(game.scenes.active?.name ?? "Unknown Scene"),
            encounterNumber:       null,
            startTimestamp:        WITACombatLog.#formatDate(true),
            startImperial:         getImperialDate() ?? "Unknown Date",
            friendlyIds:           friendlyCombatants.map(c => c.actorId),
            friendlyNames:         friendlyCombatants.map(c => sanitizeHTML(c.name ?? "?")),
            hostileCount:          opponentCombatants.length,
            hostileDefeated:       0,
            combatantSnaps,
            currentRound:          1,
            roundTurnBuffer:       [],
            roundDamageDealt:      {},
            roundDamageTaken:      {},
            roundManaSpent:        {},
            roundDeaths:           [],
            lastBufferedTurnIndex: -1,
            pendingItemUse:        {},
            turnStartHp:           {},
            turnStartMana:         {},
            detailedRoundCount:    0,
        };
    }

    // ── Journal helpers ────────────────────────────────────────
    static async #getOrCreateJournal() {
        const name = witaSetting("combatLogJournalName");
        let journal = game.journal.getName(name);
        if (!journal) {
            journal = await JournalEntry.create({
                name,
                ownership: { default: 2 },
            });
            console.log(`WITA | Created combat log journal: "${name}"`);
        }
        return journal;
    }

    static async #getOrCreateScenePage(journal, sceneName) {
        let page = journal.pages.contents.find(p => p.name === sceneName);
        if (!page) {
            page = await JournalEntryPage.create({
                name: sceneName,
                type: "text",
                sort: Date.now(),
                text: { content: "", format: 1 },
            }, { parent: journal });
        }
        return page;
    }

    static #countEncounters(content) {
        return (content.match(/data-encounter="\d+"/g) ?? []).length;
    }

    // ── Open encounter block ───────────────────────────────────
    static async #openEncounterBlock(enc) {
        const journal = await WITACombatLog.#getOrCreateJournal();
        const page    = await WITACombatLog.#getOrCreateScenePage(journal, enc.sceneName);
        const count   = WITACombatLog.#countEncounters(page.text?.content ?? "") + 1;
        enc.encounterNumber = count;

        const colHeaders = enc.friendlyNames.map(n => `<th>${n}</th>`).join("");
        const header = `
<h2 data-encounter="${count}" data-combat-id="${sanitizeHTML(enc.combatId)}">Encounter ${count} — ${sanitizeHTML(enc.startImperial)} | ${enc.startTimestamp}</h2>
<h3>Summary</h3>
<table data-enc-summary="${count}">
<tr><th>Round</th><th>Date</th>${colHeaders}<th>Defeated</th><th>Remaining</th><th>Deaths</th></tr>
</table>`;

        await page.update({ "text.content": (page.text?.content ?? "") + header });
    }

    // ── Snapshot turn start ────────────────────────────────────
    static #snapshotTurnStart(enc, combatant) {
        if (!combatant?.actor) return;
        const hp   = combatant.actor.system?.attributes?.hp;
        const mana = WITACombatLog.#getMana(combatant.actor);
        enc.turnStartHp[combatant.actorId]    = hp?.value ?? 0;
        enc.turnStartMana[combatant.actorId]  = mana?.current ?? 0;
        enc.pendingItemUse[combatant.actorId] = null;
    }

    // ── Buffer turn entry ──────────────────────────────────────
    // Guards against double-buffering the same turn index.
    static #bufferTurnEntry(enc, combatant, turnIndex) {
        if (!combatant?.actor) return;

        if (turnIndex !== undefined && turnIndex === enc.lastBufferedTurnIndex) return;
        if (turnIndex !== undefined) enc.lastBufferedTurnIndex = turnIndex;

        const actorId  = combatant.actorId;
        const name     = sanitizeHTML(combatant.name ?? "Unknown");
        const isFriend = enc.combatantSnaps[actorId]?.isFriendly ?? false;
        const ts       = WITACombatLog.#formatDate(true);

        const hp        = combatant.actor.system?.attributes?.hp;
        const hpStart   = enc.turnStartHp[actorId] ?? hp?.value ?? 0;
        const hpNow     = hp?.value ?? 0;
        const hpMax     = enc.combatantSnaps[actorId]?.hpMax ?? hp?.max ?? "?";
        const hpDisplay = isFriend ? `${hpNow}/${hpMax}hp` : "—";

        let manaLine = "";
        if (isFriend && combatant.actor.type === "character") {
            const manaStart = enc.turnStartMana[actorId] ?? 0;
            const manaNow   = WITACombatLog.#getMana(combatant.actor)?.current ?? 0;
            const spent     = Math.max(0, manaStart - manaNow);
            if (spent > 0) {
                enc.roundManaSpent[actorId] = (enc.roundManaSpent[actorId] ?? 0) + spent;
                manaLine = ` <em>(${spent} mana)</em>`;
            }
        }

        if (isFriend) {
            const dmg = Math.max(0, hpStart - hpNow);
            if (dmg > 0) enc.roundDamageTaken[actorId] = (enc.roundDamageTaken[actorId] ?? 0) + dmg;
        }

        if (isFriend && hpNow === 0 && hpStart > 0) enc.roundDeaths.push(name);
        if (!isFriend && hpNow === 0 && hpStart > 0) enc.hostileDefeated++;

        const itemName   = enc.pendingItemUse[actorId];
        const actionLine = itemName ? `[Action] ${sanitizeHTML(itemName)}${manaLine}` : `—${manaLine}`;
        const icons      = WITACombatLog.#getStatusIcons(combatant.actor);

        enc.roundTurnBuffer.push(`<tr>
        <td style="min-width:140px;white-space:nowrap">${ts}</td>
        <td style="min-width:180px"><strong>${name}</strong></td>
        <td>${actionLine}</td>
        <td style="min-width:120px;white-space:nowrap">${hpDisplay} ${icons}</td>
    </tr>`);
    }

    // ── Write round (debounced) ────────────────────────────────
    static async #writeRound(enc, roundNumber) {
        if (WITACombatLog.#roundWriteTimer) clearTimeout(WITACombatLog.#roundWriteTimer);
        WITACombatLog.#roundWriteTimer = setTimeout(
            () => WITACombatLog.#writeRoundNow(enc, roundNumber), 300
        );
    }

    static async #writeRoundNow(enc, roundNumber) {
        if (WITACombatLog.#writing) return;
        if (!enc.roundTurnBuffer.length) return;
        WITACombatLog.#writing = true;

        try {
            const journal = await WITACombatLog.#getOrCreateJournal();
            const page    = journal.pages.contents.find(p => p.name === enc.sceneName);
            if (!page) return;

            const maxRounds   = witaSetting("combatLogMaxDetailedRounds");
            const dateOnly    = WITACombatLog.#formatDate(false);
            const hostilesNow = Math.max(0, enc.hostileCount - enc.hostileDefeated);
            const deathNames  = enc.roundDeaths.join(", ") || "";

            // Capture dealt/taken BEFORE buffer reset for archive row accuracy
            const friendlyCells = enc.friendlyIds.map(id => {
                const dealt = enc.roundDamageDealt[id] ?? 0;
                const mana  = enc.roundManaSpent[id]   ?? 0;
                const cell  = WITACombatLog.#hpCell(id, enc, dealt);
                return `<td style="min-width:140px;white-space:nowrap">${cell}${mana ? ` · ${mana}mp` : ""}</td>`;
            }).join("");

            const archiveRow = `<tr
            data-round="${roundNumber}"
            data-date="${dateOnly}"
            data-defeated="${enc.hostileDefeated}"
            data-remaining="${hostilesNow}"
            data-deaths="${sanitizeHTML(deathNames)}">
            <td>${roundNumber}</td>
            <td>${dateOnly}</td>
            ${friendlyCells}
            <td>${enc.hostileDefeated}</td>
            <td>${hostilesNow}</td>
            <td>${sanitizeHTML(deathNames)}</td>
        </tr>`;

            const turnRows   = enc.roundTurnBuffer.join("\n");
            const roundBlock = `
<h3 data-round-detail="${roundNumber}">Round ${roundNumber}</h3>
<table>
<tr><th style="min-width:140px">Time</th><th style="min-width:180px">Combatant</th><th>Action</th><th style="min-width:120px">HP / Status</th></tr>
${turnRows}
</table>
<h4>Round ${roundNumber} Summary</h4>
<table>
<tr>
    <th style="min-width:180px">Combatant</th>
    <th style="min-width:100px">Dealt · HP</th>
    <th style="min-width:70px">Taken</th>
    <th style="min-width:70px">Mana</th>
    <th style="min-width:160px">Status</th>
    <th>Death Saves</th>
</tr>
${WITACombatLog.#roundSummaryRows(enc)}
</table>
<hr>`;

            enc.detailedRoundCount++;
            let content = page.text?.content ?? "";

            if (enc.detailedRoundCount > maxRounds) {
                content = WITACombatLog.#archiveOldestRound(content);
                enc.detailedRoundCount = maxRounds;
            }

            // Safe string insertion — no dynamic RegExp.
            // Append archive row before closing </table> of the encounter summary.
            const summaryMarker = `data-enc-summary="${enc.encounterNumber}"`;
            const summaryClose  = "</table>";
            const markerIdx     = content.indexOf(summaryMarker);
            if (markerIdx !== -1) {
                const closeIdx = content.indexOf(summaryClose, markerIdx);
                if (closeIdx !== -1) {
                    content = content.slice(0, closeIdx) + archiveRow + content.slice(closeIdx);
                }
            }

            content += roundBlock;
            await page.update({ "text.content": content });

            enc.roundTurnBuffer         = [];
            enc.roundDamageDealt        = {};
            enc.roundDamageTaken        = {};
            enc.roundManaSpent          = {};
            enc.roundDeaths             = [];
            enc.pendingItemUse          = {};
            enc.lastBufferedTurnIndex   = -1;

            console.log(`WITA | Combat log: round ${roundNumber} written for encounter ${enc.encounterNumber}`);
        } catch (e) {
            console.error("WITA | Combat log write error:", e);
        } finally {
            WITACombatLog.#writing = false;
        }
    }

    // ── Round summary rows ─────────────────────────────────────
    static #roundSummaryRows(enc) {
        const rows = [];

        for (const id of enc.friendlyIds) {
            const snap  = enc.combatantSnaps[id];
            if (!snap) continue;
            const actor  = snap.actor;
            const hp     = actor?.system?.attributes?.hp;
            const cur    = hp?.value ?? "?";
            const max    = snap.hpMax ?? "?";
            const dealt  = enc.roundDamageDealt[id] ?? 0;
            const taken  = enc.roundDamageTaken[id] ?? 0;
            const mana   = enc.roundManaSpent[id]   ?? 0;
            const status = WITACombatLog.#healthEstimate(actor);
            const icons  = WITACombatLog.#getStatusIcons(actor);
            const ds     = WITACombatLog.#deathSaves(actor);
            const skull  = ds
                ? `<img src="icons/svg/skull.svg" style="width:16px;height:16px;vertical-align:middle;margin-right:2px">${ds.success}✓ ${ds.failure}✗`
                : "";

            rows.push(`<tr>
            <td style="min-width:180px"><strong>${sanitizeHTML(snap.name)}</strong></td>
            <td style="min-width:100px">${dealt}d · ${cur}/${max}hp</td>
            <td style="min-width:70px;text-align:right">${taken}</td>
            <td style="min-width:70px;text-align:right">${mana > 0 ? mana + "mp" : "—"}</td>
            <td style="min-width:160px;white-space:nowrap">${sanitizeHTML(status)} ${icons}</td>
            <td>${skull}</td>
        </tr>`);
        }

        for (const snap of Object.values(enc.combatantSnaps).filter(s => !s.isFriendly)) {
            const actor  = snap.actor;
            const status = WITACombatLog.#healthEstimate(actor);
            const icons  = WITACombatLog.#getStatusIcons(actor);
            rows.push(`<tr>
            <td style="min-width:180px">${sanitizeHTML(snap.name)}</td>
            <td style="min-width:100px">—</td>
            <td style="min-width:70px;text-align:right">—</td>
            <td style="min-width:70px;text-align:right">—</td>
            <td style="min-width:160px;white-space:nowrap">${sanitizeHTML(status)} ${icons}</td>
            <td></td>
        </tr>`);
        }

        return rows.join("\n");
    }

    // ── Archive oldest round ───────────────────────────────────
    // Uses indexOf/slice instead of dynamic RegExp to avoid injection.
    static #archiveOldestRound(content) {
        const marker = 'data-round-detail="';
        const start  = content.indexOf(`<h3 ${marker}`);
        if (start === -1) return content;
        const end = content.indexOf("<hr>", start);
        if (end === -1) return content;
        return content.slice(0, start) + content.slice(end + 4);
    }

    // ── Hook registration ──────────────────────────────────────
    static registerHooks() {
        // Ready — pick up active combat if module deployed mid-session
        Hooks.once("ready", async () => {
            if (!game.user.isGM) return;
            if (!game.combat?.active) return;
            if (!witaSetting("enableCombatLogging")) return;

            const combat = game.combat;
            const journal = game.journal.getName(witaSetting("combatLogJournalName"));
            if (journal) {
                const sceneName = game.scenes.active?.name ?? "Unknown Scene";
                const page      = journal.pages.contents.find(p => p.name === sceneName);
                if (page?.text?.content?.includes(`data-combat-id="${combat.id}"`)) {
                    console.log(`WITA | Combat log: resuming existing encounter for combat ${combat.id}.`);
                    const enc        = WITACombatLog.#initEncounter(combat);
                    enc.currentRound = combat.round ?? 1;

                    const content   = page.text.content;
                    const needle    = `data-combat-id="${combat.id}"`;
                    const combatIdx = content.indexOf(needle);
                    if (combatIdx !== -1) {
                        const tagStart = content.lastIndexOf("<h2", combatIdx);
                        const tagEnd   = content.indexOf(">", combatIdx);
                        if (tagStart !== -1 && tagEnd !== -1) {
                            const tag      = content.slice(tagStart, tagEnd);
                            const encMatch = tag.match(/data-encounter="(\d+)"/);
                            enc.encounterNumber = encMatch ? parseInt(encMatch[1], 10) : null;
                        }
                    }

                    if (enc.encounterNumber == null) {
                        console.warn(`WITA | Combat log: could not restore encounterNumber for combat ${combat.id}. Summary table rows may be missing.`);
                    }

                    WITACombatLog.#encounters[combat.id] = enc;
                    const current = combat.combatant;
                    if (current) WITACombatLog.#snapshotTurnStart(enc, current);
                    ui.notifications.info(`WITA | Combat log: resumed at round ${enc.currentRound}. Prior turns unavailable.`);
                    return;
                }
            }

            console.log("WITA | Combat log: active combat on load, initialising new encounter...");
            const enc        = WITACombatLog.#initEncounter(combat);
            enc.currentRound = combat.round ?? 1;
            WITACombatLog.#encounters[combat.id] = enc;
            await WITACombatLog.#openEncounterBlock(enc);

            const current = combat.combatant;
            if (current) WITACombatLog.#snapshotTurnStart(enc, current);
            ui.notifications.info(`WITA | Combat log: picked up at round ${enc.currentRound}. Prior turns unavailable.`);
        });

        // Combat starts
        Hooks.on("combatStart", async (combat) => {
            if (!game.user.isGM) return;
            if (!witaSetting("enableCombatLogging")) return;

            const enc = WITACombatLog.#initEncounter(combat);
            WITACombatLog.#encounters[combat.id] = enc;
            await WITACombatLog.#openEncounterBlock(enc);

            const first = combat.combatant;
            if (first) WITACombatLog.#snapshotTurnStart(enc, first);
            console.log(`WITA | Combat log: started in "${enc.sceneName}"`);
        });

        // Turn advances
        Hooks.on("combatTurn", (combat, updateData, updateOptions) => {
            if (!game.user.isGM) return;
            const enc = WITACombatLog.#encounters[combat.id];
            if (!enc) return;

            const newTurn = updateData.turn ?? 0;
            const dir     = updateOptions.direction ?? 1;

            // Clamp prevIndex — never -1 on first forward advance
            const prevIndex = dir > 0
                ? Math.max(0, newTurn - 1)
                : Math.min(combat.turns.length - 1, newTurn + 1);

            if (dir > 0 && newTurn > 0) {
                const prev = combat.turns[prevIndex];
                if (prev) WITACombatLog.#bufferTurnEntry(enc, prev, prevIndex);
            }

            const next = combat.turns[newTurn];
            if (next) WITACombatLog.#snapshotTurnStart(enc, next);
        });

        // Round advances — write buffered round
        Hooks.on("combatRound", async (combat, updateData, updateOptions) => {
            if (!game.user.isGM) return;
            const enc = WITACombatLog.#encounters[combat.id];
            if (!enc) return;

            // Only buffer last turn if combatTurn didn't already buffer it
            const lastIdx = combat.turns.length - 1;
            if (enc.lastBufferedTurnIndex !== lastIdx) {
                const last = combat.turns[lastIdx];
                if (last) WITACombatLog.#bufferTurnEntry(enc, last, lastIdx);
            }

            const completedRound = enc.currentRound;
            enc.currentRound++;
            await WITACombatLog.#writeRound(enc, completedRound);

            const first = combat.turns[0];
            if (first) WITACombatLog.#snapshotTurnStart(enc, first);
        });

        // Item used — capture action name (combat only)
        // dnd5e.postUseActivity replaces deprecated dnd5e.useItem (dnd5e 4.0+).
        Hooks.on("dnd5e.postUseActivity", (activity, usageConfig, results) => {
            if (!game.combat?.active) return;
            if (!witaSetting("enableCombatLogging")) return;
            const enc = WITACombatLog.#encounters[game.combat.id];
            if (!enc) return;
            const actorId = activity.actor?.id;
            if (!actorId) return;
            enc.pendingItemUse[actorId] = activity.item?.name ?? activity.name;
        });

        // Damage — friendly targets taken, friendly attackers dealt
        Hooks.on("dnd5e.damageActor", (actor, changes, options) => {
            if (!game.combat?.active) return;
            if (!witaSetting("enableCombatLogging")) return;
            const enc = WITACombatLog.#encounters[game.combat.id];
            if (!enc) return;

            const total = Object.values(changes).reduce((sum, v) => sum + (v ?? 0), 0);
            if (total <= 0) return;

            const targetId       = actor.id;
            const targetFriendly = enc.combatantSnaps[targetId]?.isFriendly ?? false;
            if (targetFriendly) {
                enc.roundDamageTaken[targetId] = (enc.roundDamageTaken[targetId] ?? 0) + total;
            }

            const attackerId = game.combat?.combatant?.actorId;
            if (attackerId && (enc.combatantSnaps[attackerId]?.isFriendly ?? false)) {
                enc.roundDamageDealt[attackerId] = (enc.roundDamageDealt[attackerId] ?? 0) + total;
            }
        });

        // Combat ends — flush any remaining buffer
        Hooks.on("deleteCombat", async (combat) => {
            if (!game.user.isGM) return;
            const enc = WITACombatLog.#encounters[combat.id];
            if (!enc) return;

            if (enc.roundTurnBuffer.length) {
                await WITACombatLog.#writeRoundNow(enc, enc.currentRound);
            }

            delete WITACombatLog.#encounters[combat.id];
            console.log(`WITA | Combat log: encounter ${enc.encounterNumber} closed.`);
        });
    }
}

WITACombatLog.registerHooks();
