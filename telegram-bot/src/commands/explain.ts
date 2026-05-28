import type { CommandContext, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { getMarket, getOrderbook, isNegRiskGroup } from "../limitless/api.js";
import { buildExplanation } from "../format.js";

export async function handleExplain(ctx: CommandContext<Context>): Promise<void> {
  const slug = ctx.match?.trim();
  if (!slug) {
    await ctx.reply("Usage: /explain <slug>\nExample: /explain btc-above-100k-jun-2026");
    return;
  }

  try {
    const market = await getMarket(slug);
    const group = isNegRiskGroup(market);

    // Fetch orderbook for CLOB markets (non-groups).
    // NegRisk groups don't have a direct orderbook.
    if (!group) {
      await getOrderbook(slug); // warm — result not used in text but validates market exists
    }

    const text = buildExplanation(market, group);
    const keyboard = new InlineKeyboard().url(
      "Open on Limitless",
      `https://limitless.exchange/markets/${slug}`
    );

    await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
  } catch (err) {
    await ctx.reply(
      `Market not found: <code>${slug}</code>\n\nCheck the slug and try again.`,
      { parse_mode: "HTML" }
    );
    console.error("[explain]", err);
  }
}
