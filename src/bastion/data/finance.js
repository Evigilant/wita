// ============================================================
// WITA — BASTION FINANCE
// Reads Financial System settings to produce a summary
// of owned properties and stocks for the Seneschal report.
// ============================================================
import { sanitizeHTML } from "../../core/utils.js";
import { witaSetting } from "../../settings/settings.js";
import { getBastionData } from "./data.js";
import { WITA_WORKER_PROFESSIONS } from "../../professions/workers/config.js";

// Returns null gracefully if the financial-system module
// is not installed, not configured, or has no data.
export function getFinancialSummary() {
    try {
        if (!game.modules.get("financial-system")?.active) return null;

        const economies = game.settings.get("financial-system", "economies");
        if (!economies?.length) return null;

        const bankerActorId = witaSetting("bankerActorId");
        const economyId     = witaSetting("economyId");

        const economy = economies.find(e => e.id === economyId) ?? economies[0];
        if (!economy) return null;

        const portfolios = game.settings.get("financial-system", "stockPortfolios") ?? {};
        const accounts   = game.settings.get("financial-system", "bankAccounts")    ?? {};

        const weeksPerMonth = _getWeeksPerMonth();

        // Rented properties in this economy; filter by bankerActorId if configured
        const ownedProperties = (economy.properties ?? []).filter(p =>
            p.rented && (!bankerActorId || p.owner === bankerActorId)
        );

        const propertyIncome = ownedProperties.map(p => {
            const weekly = p.monthlyIncome ?? 0;  // financial-system "monthlyIncome" = per-turn (weekly) income
            return {
                name:          sanitizeHTML(p.name),
                type:          sanitizeHTML(p.type),
                weeklyIncome:  weekly,
                monthlyIncome: Math.round(weekly * weeksPerMonth),
            };
        });

        const totalPropertyIncome = propertyIncome.reduce((sum, p) => sum + p.weeklyIncome, 0);

        const portfolioKey = `${bankerActorId}-${economy.id}`;
        const portfolio    = portfolios[portfolioKey] ?? {};

        const ownedStocks = (economy.stocks ?? [])
            .filter(s => portfolio[s.id] !== undefined && portfolio[s.id] > 0)
            .map(s => ({
                name:            sanitizeHTML(s.name),
                symbol:          sanitizeHTML(s.symbol),
                shares:          portfolio[s.id],
                currentPrice:    s.currentPrice ?? 0,
                trend:           s.trend ?? "stable",
                trendPercentage: s.trendPercentage ?? 0,
                totalValue:      ((portfolio[s.id] ?? 0) * (s.currentPrice ?? 0)).toFixed(2),
            }));

        const accountValues = Object.values(accounts);
        const account = accountValues.find(a => a.actorId === bankerActorId && a.economyId === economy.id)
                     ?? accountValues.find(a => a.actorId === bankerActorId && a.economyId === economyId)
                     ?? accountValues.find(a => a.actorId === bankerActorId);

        return {
            propertyIncome,
            totalPropertyIncome,
            ownedStocks,
            bankBalance:   account?.balance ?? account?.amount ?? 0,
            currency:      sanitizeHTML(economy.currency ?? "GP"),
            weeksPerMonth,
        };

    } catch (e) {
        console.warn("WITA | Could not read financial data:", e);
        return null;
    }
}

// Returns the number of weeks in the current in-game calendar month via wgtgm-mini-calendar.
// Falls back to 4 if the module isn't active or the API doesn't expose the needed data.
function _getWeeksPerMonth() {
    try {
        const cal = game.modules.get("wgtgm-mini-calendar");
        if (!cal?.active) return 4;
        const api = cal.api ?? globalThis.MiniCalendar;
        if (!api) return 4;

        // Try to get days-in-month from the API (try several naming conventions)
        const daysInMonth = api.daysInCurrentMonth?.()
                         ?? api.currentMonthDays?.()
                         ?? api.getMonthDays?.()
                         ?? api.getDaysInMonth?.()
                         ?? api.currentDate?.()?.daysInMonth
                         ?? api.getDate?.()?.daysInMonth;

        // Try to get days-per-week from the API
        const daysPerWeek = api.daysPerWeek?.()
                         ?? api.weekLength?.()
                         ?? api.getWeekLength?.()
                         ?? api.weekDays?.()?.length
                         ?? api.getWeekdays?.()?.length;

        if (daysInMonth > 0 && daysPerWeek > 0) {
            return Math.round(daysInMonth / daysPerWeek);
        }
        console.warn("WITA | wgtgm-mini-calendar: could not determine daysInMonth/daysPerWeek — defaulting to 4 weeks/month.");
    } catch(e) {
        console.warn("WITA | wgtgm-mini-calendar read failed:", e);
    }
    return 4;
}

// Weekly wage per worker level (PHB skilled hireling baseline, level-scaled)
// L1 = untrained (2 SP/day), L4 = skilled (2 GP/day = SRD baseline), scaled between.
export const WEEKLY_WAGES = { 1: 1.4, 2: 3.5, 3: 7, 4: 14 }; // GP/week

export function formatWage(gpPerWeek) {
    if (gpPerWeek < 1) return `${Math.round(gpPerWeek * 10)} SP`;
    return `${gpPerWeek % 1 === 0 ? gpPerWeek : gpPerWeek.toFixed(1)} GP`;
}

/**
 * Summarise weekly wage costs for all active workers.
 * Returns { workers: [{name, profession, level, weeklyWage}], totalWeeklyWage }.
 */
export function getWorkerWagesSummary() {
    const data    = getBastionData();
    const workers = (data.workers ?? []).filter(w => w.status === "Active" && !w.wageExempt);

    const workerList = workers.map(w => {
        const primary    = w.primaryProfession;
        const level      = primary ? (w.professions?.[primary]?.level ?? 1) : 1;
        const weeklyWage = WEEKLY_WAGES[level] ?? 14;
        const profLabel  = primary ? (WITA_WORKER_PROFESSIONS[primary]?.label ?? primary) : "—";
        return {
            name:      sanitizeHTML(w.name),
            profession: sanitizeHTML(profLabel),
            level,
            weeklyWage,
        };
    });

    const totalWeeklyWage = workerList.reduce((s, w) => s + w.weeklyWage, 0);
    return { workers: workerList, totalWeeklyWage };
}

// ── Wage deduction listener ───────────────────────────────────

let _cachedBankerBalance = null;
let _deductingWages      = false;

/**
 * Register a hook that auto-deducts worker wages whenever the banker's
 * bank account balance increases (i.e. earnings were just collected).
 * Call once from main.js inside Hooks.once("ready").
 */
export function registerWageDeductionListener() {
    if (!game.user.isGM) return;
    if (!game.modules.get("financial-system")?.active) return;

    _cachedBankerBalance = _getBankerBalance();

    Hooks.on("updateSetting", async (setting) => {
        if (setting.namespace !== "financial-system") return;
        if (setting.key !== "bankAccounts") return;
        if (_deductingWages) return;
        if (!game.user.isGM) return;

        const newBalance = _getBankerBalance();
        const oldBalance = _cachedBankerBalance ?? newBalance;
        _cachedBankerBalance = newBalance;

        if (newBalance <= oldBalance) return;

        const wages = getWorkerWagesSummary();
        if (!wages.totalWeeklyWage) return;

        _deductingWages = true;
        try {
            const result = await deductBankFunds(wages.totalWeeklyWage);
            _cachedBankerBalance = result.balance;
            _postWageChatMessage(wages, result);
        } finally {
            _deductingWages = false;
        }
    });
}

function _getBankerBalance() {
    try {
        const bankerActorId = witaSetting("bankerActorId");
        const economyId     = witaSetting("economyId");
        const accounts      = game.settings.get("financial-system", "bankAccounts") ?? {};
        const acctValues    = Object.values(accounts);
        const account       = acctValues.find(a => a.actorId === bankerActorId && a.economyId === economyId)
                           ?? acctValues.find(a => a.actorId === bankerActorId);
        return account?.balance ?? account?.amount ?? 0;
    } catch { return 0; }
}

function _postWageChatMessage(wages, result) {
    const currency = getFinancialSummary()?.currency ?? "GP";
    const rows = wages.workers.map(w =>
        `<li>${sanitizeHTML(w.name)} — ${sanitizeHTML(w.profession)} Lv${w.level}: ${formatWage(w.weeklyWage)}</li>`
    ).join("");
    const shortfallLine = result.shortfall > 0
        ? `<p style="color:var(--color-level-error);margin:0.3rem 0 0"><strong>⚠ Shortfall:</strong> ${result.shortfall} ${sanitizeHTML(currency)} could not be deducted.</p>`
        : "";

    ChatMessage.create({
        content: `
            <div style="font-family:var(--font-primary,Signika);padding:0.5rem">
                <h3 style="margin:0 0 0.35rem"><i class="fas fa-coins"></i> Wages Paid</h3>
                <ul style="margin:0 0 0.3rem;padding-left:1.2rem;font-size:0.78rem">${rows}</ul>
                <p style="margin:0;font-size:0.8rem">
                    <strong>Total deducted:</strong> ${formatWage(wages.totalWeeklyWage)}
                    &nbsp;·&nbsp; <strong>New balance:</strong> ${result.balance} ${sanitizeHTML(currency)}
                </p>
                ${shortfallLine}
            </div>`,
        whisper: ChatMessage.getWhisperRecipients("GM"),
        speaker: { alias: "Bastion Steward" },
    });
}

/**
 * Attempt to deduct GP from the banker's bank account.
 * Returns { success, balance, shortfall } where success=false means insufficient funds (deduction still performed if allowPartial).
 */
export async function deductBankFunds(amount, allowShortfall = true) {
    try {
        if (!game.modules.get("financial-system")?.active) return { success: false, balance: 0, shortfall: amount };

        const bankerActorId = witaSetting("bankerActorId");
        const economyId     = witaSetting("economyId");
        const accounts      = game.settings.get("financial-system", "bankAccounts") ?? {};
        const accountKey    = Object.keys(accounts).find(k =>
            accounts[k].actorId === bankerActorId && accounts[k].economyId === economyId
        );
        if (!accountKey) return { success: false, balance: 0, shortfall: amount };

        const account   = accounts[accountKey];
        const balance   = account.balance ?? 0;
        const shortfall = Math.max(0, amount - balance);
        const deduct    = allowShortfall ? amount : Math.min(amount, balance);

        if (deduct > 0) {
            account.balance = Math.max(0, balance - deduct);
            accounts[accountKey] = account;
            await game.settings.set("financial-system", "bankAccounts", accounts);
        }

        return { success: shortfall === 0, balance: account.balance, shortfall };
    } catch (e) {
        console.warn("WITA | Could not deduct bank funds:", e);
        return { success: false, balance: 0, shortfall: amount };
    }
}
