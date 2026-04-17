// ============================================================
// WITA — BASTION NARRATIVE
// Generates AI narrative sentences for each owned property
// and stock based on the bastion event roll.
// Requires an Anthropic API key in module settings.
// Fallback if API unavailable: plain text sentence.
// ============================================================
import { sanitizeHTML } from "../core/utils.js";
import { witaSetting } from "../settings/settings.js";

const WITA_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

// Returns an array of { name, sentence } objects — one per owned property and stock.
export async function generateAssetNarratives(event, financial) {
    if (!financial) return [];

    const assets = _buildAssetList(financial);
    if (!assets.length) return [];

    const apiKey = witaSetting("anthropicApiKey")?.trim();

    if (!apiKey) {
        console.warn("WITA | No Anthropic API key set — using fallback narratives.");
        return _fallbackNarratives(assets, event);
    }

    try {
        return await _callAnthropicAPI(apiKey, assets, event, financial);
    } catch (e) {
        console.warn("WITA | Anthropic API call failed, using fallback narratives:", e);
        return _fallbackNarratives(assets, event);
    }
}

function _buildAssetList(financial) {
    const assets = [];

    for (const p of (financial.propertyIncome ?? [])) {
        assets.push({
            type:   "property",
            name:   p.name,
            detail: `${p.type} property generating ${p.weeklyIncome} ${financial.currency}/week`,
        });
    }

    for (const s of (financial.ownedStocks ?? [])) {
        const trend = s.trend === "up" ? "trending up" : s.trend === "down" ? "trending down" : "stable";
        assets.push({
            type:   "stock",
            name:   `${s.name} (${s.symbol})`,
            detail: `${s.shares} share(s) at ${s.currentPrice.toFixed(2)} ${financial.currency}, ${trend} ${s.trendPercentage}%`,
        });
    }

    return assets;
}

function _fallbackNarratives(assets, event) {
    return assets.map(a => ({
        name:     a.name,
        sentence: `${sanitizeHTML(a.name)} experienced ${sanitizeHTML(event.categoryName)} this turn.`,
    }));
}

async function _callAnthropicAPI(apiKey, assets, event, financial) {
    const assetDescriptions = assets.map(a => `- ${a.name}: ${a.detail}`).join("\n");

    const prompt = `You are writing a weekly Seneschal report for a fantasy bastion. Write exactly one short sentence (15-25 words) for each asset listed below. The tone should be formal and professional, like a steward's status update. Do not use bullet points or numbering — output one sentence per line, in the same order as the assets listed. Do not include the asset name at the start of each sentence — weave it naturally into the sentence.

This week's bastion event was: ${event.categoryName} — ${event.description}

Assets owned by the bastion banker:
${assetDescriptions}

Write one sentence per asset reflecting the ${event.categoryName} event outcome. Output only the sentences, one per line, nothing else.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type":      "application/json",
            "x-api-key":         apiKey,
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
            model:      WITA_ANTHROPIC_MODEL,
            max_tokens: 300,
            messages:   [{ role: "user", content: prompt }],
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Anthropic API error ${response.status}: ${err}`);
    }

    const data      = await response.json();
    const text      = data?.content?.[0]?.text?.trim() ?? "";

    if (!text) throw new Error("Anthropic API returned empty response.");

    const sentences = text.split("\n").map(s => s.trim()).filter(s => s.length > 0);

    return assets.map((asset, i) => ({
        name:     asset.name,
        sentence: sanitizeHTML(sentences[i] ?? `${asset.name} experienced ${event.categoryName} this turn.`),
    }));
}
