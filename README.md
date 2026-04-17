# Whispers in the Abyss

A FoundryVTT module for the *Whispers in the Abyss* campaign.

## Requirements

- FoundryVTT v12+, verified v14
- D&D 5e system
- [socketlib](https://github.com/manuelVo/foundryvtt-socketlib)
- [item-piles](https://github.com/fantasycalendar/FoundryVTT-ItemPiles)
- [wgtgm-mini-calendar](https://github.com/wgtgm/mini-calendar) (Imperial date support)
- [campaign-codex](https://wgtngm.com) (optional)
- [Mana System by Nox](https://www.patreon.com/designedbynox) (optional)
- [financial-system by LoboWerewolf](https://github.com/LoboWerewolf) (optional)

## Installation

Install via manifest URL:

```
https://github.com/YOUR_USERNAME/wita/releases/latest/download/module.json
```

## Configuration

Open **Game Settings → Configure Settings → Whispers in the Abyss**.

| Button | Contents |
|---|---|
| ⚙️ Core Configuration | Loot pack IDs, party actor ID, bastion journal names |
| 🏰 Bastion Automation | Long rests per turn, report limits, Anthropic API key |
| 💰 Financial System | Banker actor ID, economy ID |
| ⚔️ Combat Logging | Journal name, max detailed rounds |

## Features

### Loot & Harvest
Player uses a Loot action item on a defeated token. Equipment fate, harvest rolls, and loot table draws are handled GM-side via socketlib.

### Bastion Automation
Long rests accumulate toward a configurable threshold. When reached, a bastion turn fires — rolling facilities and events from the **⚙️ Bastion Config** journal, generating an AI narrative via the Anthropic API, and writing a Seneschal report to the bastion journal.

### Combat Logging
Every combat is logged to the **⚔️ Combat Log** journal. One page per scene, one encounter block per combat. Friendly turns include HP, mana, actions, and status icons. Hostile turns show action names only — no HP or damage numbers exposed.

## Development

```bash
# Install dependencies
npm install

# Build minified output to dist/
npm run build

# Watch mode — rebuilds on save
npm run watch

# Build + zip for release
npm run release
```

Source files live in `src/`. The `dist/` folder is gitignored.

## Release

1. Bump `version` in `module.json` and `package.json`
2. Update `CHANGELOG.md`
3. Commit and tag: `git tag v1.x.x && git push origin main --tags`
4. Run `npm run release` to produce `wita.zip`
5. Create a GitHub Release, attach `wita.zip` and `dist/module.json`
