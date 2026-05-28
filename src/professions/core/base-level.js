// ============================================================
// WITA — BASE PROFESSION LEVEL
// Shared XP/level/state logic inherited by both worker
// professions (WITAWorkerProfession) and actor-based crafting
// professions (WITACraftingLevel).
//
// Subclasses must assign before first use:
//   this.levelTable — [{ level, xp|exp, bonus, title? }]
//   this.label      — display name for chat messages
//   this.icon       — optional FontAwesome class string
// ============================================================

export class WITABaseProfession {
    // ── Level calculation ─────────────────────────────────────

    _levelForXP(xp) {
        let lvl = 1;
        for (const row of this.levelTable ?? []) {
            if (xp >= (row.xp ?? row.exp ?? 0)) lvl = row.level;
        }
        return lvl;
    }

    // Returns { level, xp, bonus, title, next, curXP, span, pct }.
    // Public getState() in each subclass adapts field names as needed.
    _getState(xp) {
        const level   = this._levelForXP(xp);
        const table   = this.levelTable ?? [];
        const row     = table.find(r => r.level === level);
        const nextRow = table.find(r => r.level === level + 1);
        const curBase = row?.xp ?? row?.exp ?? 0;
        const next    = nextRow ? (nextRow.xp ?? nextRow.exp ?? null) : null;
        const curXP   = xp - curBase;
        const span    = next !== null ? next - curBase : 1;
        const pct     = next !== null ? Math.min(100, Math.round((curXP / span) * 100)) : 100;
        return {
            level, xp, bonus: row?.bonus ?? 0, title: row?.title ?? "",
            next, curXP, span, pct,
        };
    }

    // ── Level-up chat ─────────────────────────────────────────

    _postLevelUpChat(entityName, newLevel, { whisperGM = false, speakerAlias = "WITA" } = {}) {
        const row = (this.levelTable ?? []).find(r => r.level === newLevel);
        ChatMessage.create({
            content: `
                <div style="font-family:var(--font-primary,Signika);padding:0.5rem">
                    <h3 style="margin:0 0 0.4rem;color:var(--color-level-success)">
                        ⬆ ${this.label} Level Up!
                    </h3>
                    <p style="margin:0 0 0.25rem"><strong>${entityName}</strong> is now
                        ${row?.title ? `a <em>${row.title}</em>` : `Level ${newLevel}`}
                        (${this.label} Lv ${newLevel}).
                    </p>
                    ${(row?.bonus ?? 0) ? `<p style="font-size:0.75rem;color:var(--color-form-hint);margin:0">
                        ${this.icon ? `<i class="${this.icon}"></i> ` : ""}+${row.bonus} bonus to relevant rolls.
                    </p>` : ""}
                </div>
            `,
            whisper: whisperGM ? ChatMessage.getWhisperRecipients("GM") : [],
            speaker: { alias: speakerAlias },
        });
    }
}
