import type { CommandContext, Context } from "grammy";
import { upsertWatch } from "../db/index.js";
import { getMarket, yesPrice, isNegRiskGroup } from "../limitless/api.js";
import { fmtPct } from "../format.js";

export async function handleWatch(ctx: CommandContext<Context>): Promise<void> {
  const id = ctx.from?.id;
  if (!id) return;

  const parts = ctx.match?.trim().split(/\s+/) ?? [];
  if (parts.length < 2) {
    await ctx.reply(
      "Usage: /watch <slug> <threshold>\nExample: /watch btc-above-100k-jun-2026 5\n\nThreshold is percentage points (5 = alert on 5pp drift)."
    );
    return;
  }

  const [slug, threshStr] = parts;
  const threshold = parseFloat(threshStr);
  if (isNaN(threshold) || threshold <= 0 || threshold > 99) {
    await ctx.reply("Threshold must be a number between 1 and 99.");
    return;
  }

  try {
    const market = await getMarket(slug);

    if (isNegRiskGroup(market)) {
      const childSlugs =
        market.markets?.map((m) => `<code>${m.slug}</code>`).join("\n") ?? "";
      await ctx.reply(
        `<b>${market.title}</b> is a multi-outcome group — watch a specific child market instead:\n\n${childSlugs}`,
        { parse_mode: "HTML" }
      );
      return;
    }

    const currentOdds = yesPrice(market);
    // Determine market type for WebSocket subscription routing.
    const marketType =
      market.marketType === "AMM" || market.tradeType === "AMM" ? "AMM" : "CLOB";
    const marketAddress = (market.address ?? null) as string | null;

    upsertWatch(id, slug, threshold, currentOdds, marketAddress, marketType);

    const oddsStr = currentOdds != null ? ` (currently ${fmtPct(currentOdds)} YES)` : "";
    await ctx.reply(
      `🔔 <b>Watch set</b>\n\n${market.title}${oddsStr}\nAlerts when YES odds shift <b>${threshold}pp</b> from this baseline.`,
      { parse_mode: "HTML" }
    );
  } catch (err) {
    await ctx.reply(
      `Couldn't find market: <code>${slug}</code>\n\nCheck the slug and try again.`,
      { parse_mode: "HTML" }
    );
    console.error("[watch]", err);
  }
}
