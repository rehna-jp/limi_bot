import type { CommandContext, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { getMarket, getOrderbook } from "../limitless/api.js";
import { buildExplanation } from "../format.js";

export async function handleExplain(ctx: CommandContext<Context>): Promise<void> {
  const slug = ctx.match?.trim();
  if (!slug) {
    await ctx.reply("Usage: /explain <slug>\nExample: /explain btc-above-100k-jun-2026");
    return;
  }

  try {
    const [market, orderbook] = await Promise.allSettled([
      getMarket(slug),
      getOrderbook(slug),
    ]);

    if (market.status === "rejected") {
      await ctx.reply(`Market not found: ${slug}`);
      return;
    }

    const m = market.value;
    if (orderbook.status === "fulfilled") {
      // Attach orderbook depth summary to the market for the formatter.
      const bids = orderbook.value.bids ?? orderbook.value.yes?.bids ?? [];
      const asks = orderbook.value.asks ?? orderbook.value.yes?.asks ?? [];
      (m as unknown as Record<string, unknown>)._bidCount = bids.length;
      (m as unknown as Record<string, unknown>)._askCount = asks.length;
    }

    const text = buildExplanation(m);
    const keyboard = new InlineKeyboard().url(
      `Open on Limitless`,
      `https://limitless.exchange/markets/${slug}`
    );

    await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
  } catch (err) {
    await ctx.reply(`Couldn't load that market. Check the slug and try again.`);
    console.error("[explain]", err);
  }
}
