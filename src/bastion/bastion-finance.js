// ============================================================
// WITA — BASTION FINANCE
// Reads Financial System settings to produce a summary
// of owned properties and stocks for the Seneschal report.
// ============================================================
import { sanitizeHTML } from "../core/utils.js";
import { witaSetting } from "../settings/settings.js";

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

        // Only include properties owned by the banker actor that are rented (generating income)
        const ownedProperties = (economy.properties ?? []).filter(p =>
            p.owner === bankerActorId && p.rented
        );

        // Weekly income approximation: monthly / 4
        const propertyIncome = ownedProperties.map(p => ({
            name:          sanitizeHTML(p.name),
            type:          sanitizeHTML(p.type),
            monthlyIncome: p.monthlyIncome ?? 0,
            weeklyIncome:  Math.round((p.monthlyIncome ?? 0) / 4),
        }));

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

        const account = Object.values(accounts)
            .find(a => a.actorId === bankerActorId && a.economyId === economy.id);

        return {
            propertyIncome,
            totalPropertyIncome,
            ownedStocks,
            bankBalance: account?.balance ?? 0,
            currency:    sanitizeHTML(economy.currency ?? "GP"),
        };

    } catch (e) {
        console.warn("WITA | Could not read financial data:", e);
        return null;
    }
}
