# Changelog

All notable changes to Whispers in the Abyss will be documented here.

## v0.6.0 — 2026-06-06

### Recruiter Profession (new)
- Recruiter facility profession implemented end-to-end
- Any facility with order set to "Recruit" generates a candidate pool each bastion turn — a dedicated recruiter worker is optional but improves roll quality
- Candidate generation rolls rarity (1d100), XP distribution (1d20), and facility match count (1d6); crit bonus candidate on high roll
- Hire cost scales dynamically with rarity tier and hireling weekly wage (~7 / ~21 / ~70 / ~196 GP for Common → Very Rare)
- Candidates dialog opens automatically for all players on turn resolution; Hire/Dismiss buttons are GM-only
- "Re-roll Candidates" and "View" buttons added to the recruiter facility detail panel (GM only)
- Recruiter XP awarded on hire; level-up chat notification posted to GM

### Quest System
- Party quests (no hirelings assigned) are skipped during bastion turn auto-resolution — status shows "Active" in the status panel
- Guildhall detached from quest board — the "Recruit" order now generates hireling candidates like a Barracks instead of opening the quest board
- Quest board accessible via Status tab button and seneschal actor shortcuts only
- Quests with no hirelings can now be dispatched (party takes the quest directly)

### Workers & Finance
- Worker edit dialog now shows computed weekly wage and profession level
- Workers tab includes a collapsible "Progression & Wage Reference" table (XP thresholds, roll bonuses, wages per level)
- Per-worker "Exempt" toggle — exempt workers are excluded from wage totals and auto-deduction
- Auto wage deduction: when the banker's account balance increases (earnings collected), worker wages are deducted automatically and a GM chat summary is posted

### Facility Detail
- Smithy commission and recruiter sections now rendered inline in the facility detail panel
- Facility order label "View" corrected to "Recruit"

### Bastion Status Panel
- Active quests with no assigned hirelings show "Active" instead of a turns countdown

## v1.0.5 — 2026-04-16

### Fixed
- `rollLoot()` now resolves loot tables from the `wita-loot-tables` compendium pack directly — tables no longer need to be imported into the world
- Lottery condition corrected (`rollEntry.lottery` instead of `rollEntry.lottery && overAllRoll.total === 100`) — exact roll of 100 no longer skips non-lottery loot table
- `executeHarvest` now guarded by `WITA_LOCKS` + `try/finally`, matching `executeLoot` pattern
- `dnd5e.useItem` and `dnd5e.damageActor` hooks now check `enableCombatLogging` toggle
- Duplicate `witaSetting()` definition removed from `config.js` — canonical definition in `settings.js` only
- `packs/loot/` folder registered in `module.json` as `wita-loot` (was present on disk but missing from manifest)
- `lootDoc.img` sanitized in loot chat message HTML
- Combat log no longer creates duplicate encounter blocks on session reload — each encounter header now carries `data-combat-id` and the ready hook checks for existing blocks before opening a new one
- Encounter number safely recovered on resume using string search instead of `new RegExp()` on untrusted content
- `dnd5e.useItem` hook replaced with `dnd5e.postUseActivity` — `useItem` was deprecated in dnd5e 4.0 and no longer fires in 5.x

## v1.0.0 — 2026-04-14

Initial release.

### Loot & Harvest
- Loot action item triggers GM-side loot and harvest via socketlib
- Equipment fate, item pile creation, harvest rolls, loot table draws
- Race condition prevention via WITA_LOCKS
- Null guards on all table draws and document lookups

### Bastion Automation
- Long rest tracking triggers bastion turn at configurable threshold
- Config journal (⚙️ Bastion Config) with Facilities and Events pages
- Facility and event outcomes parsed from journal at turn time
- AI-generated asset narratives via Anthropic API (sk-ant-api03-...)
- Seneschal report journal with archived round summaries
- GM-only chat action message for Collect Earnings instructions
- Financial System integration for property income and stock portfolio
- Fluctuation type derived from event roll stored in bastion state

### Combat Logging
- Per-encounter combat log journal (⚔️ Combat Log)
- One page per scene, one encounter block per combat
- Per-turn entries with timestamp, action name, HP, mana spent
- Round summary tables with health estimates and status icons
- Friendly/hostile classification via party actor rest targets
- Hostile HP never recorded to preserve GM flexibility
- Archived round summaries after configurable detailed round limit

### Settings
- Categorised sub-window settings UI (Core, Bastion, Financial, Combat)
- Feature toggles on main panel for Bastion, Financial, Combat systems
- All settings config:false — clean main panel, no raw fields exposed

### Module
- socketlib integration for GM-only item pile operations
- Imperial calendar support via wgtgm-mini-calendar
- V13/V14 compatibility