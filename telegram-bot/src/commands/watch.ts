import type { CommandContext, Context } from "grammy";
import { getUser, upsertWatch } from "../db/index.js";
import { getMarket, yesPrice } from "../limitless/api.js";
import { fmtPct } from "../format.js";

export async function handleWatch(ctx: CommandContext<Context>): Promise<void> {
  const id = ctx.from?.id;
  if (!id) return;

  const parts = ctx.match?.trim().split(/\s+/) ?? [];
  if (parts.length < 2) {
    await ctx.reply(
      "Usage: /watch <slug> <threshold>\nExample: /watch btc-above-100k-jun-2026 5\n\nThreshold is in percentage points (5 = alert when odds shift 5pp)."
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
    const currentOdds = yesPrice(market);

    upsertWatch(id, slug, threshold, currentOdds);

    const oddsStr = currentOdds != null ? ` (currently ${fmtPct(currentOdds)} YES)` : "";

    await ctx.reply(
      `🔔 <b>Watch set</b>\n\n${market.title}${oddsStr}\n\nI'll alert you when YES odds shift <b>${threshold}pp</b> from this baseline.`,
      { parse_mode: "HTML" }
    );
  } catch (err) {
    await ctx.reply(`Couldn't find market: ${slug}\n\nCheck the slug and try again.`);
    console.error("[watch]", err);
  }
}
