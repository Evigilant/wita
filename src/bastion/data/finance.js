// ============================================================
// WITA — BASTION FINANCE
// Reads Financial System settings to produce a summary
// of owned properties and stocks for the Seneschal report.
// ============================================================
import { sanitizeHTML } from "../../core/utils.js";
import { witaSetting } from "../../settings/settings.js";

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
