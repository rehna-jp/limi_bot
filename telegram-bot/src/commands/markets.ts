import type { CallbackQueryContext, CommandContext, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { getTrendingMarkets } from "../limitless/api.js";
import { buildMarketsList, marketLine } from "../format.js";

export async function handleMarkets(ctx: CommandContext<Context>): Promise<void> {
  const category = ctx.match?.trim() || undefined;

  try {
    const markets = await getTrendingMarkets(10, category);
    const text = buildMarketsList(markets, category);

    // Each market gets a button that triggers /explain for that slug.
    const keyboard = new InlineKeyboard();
    for (const m of markets.slice(0, 8)) {
      keyboard.text(
        m.title.slice(0, 40) + (m.title.length > 40 ? "…" : ""),
        `explain:${m.slug}`
      ).row();
    }
    keyboard.url("Open Limitless", "https://limitless.exchange/markets");

    await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
  } catch (err) {
    await ctx.reply("Couldn't load markets right now. Try again in a moment.");
    console.error("[markets]", err);
  }
}

export async function handleExplainCallback(
  ctx: CallbackQueryContext<Context>
): Promise<void> {
  await ctx.answerCallbackQuery();
  const slug = ctx.callbackQuery.data.replace(/^explain:/, "");

  const { handleExplain } = await import("./explain.js");
  // Synthesise a fake CommandContext-compatible call by monkey-patching match.
  (ctx as unknown as CommandContext<Context>).match = slug;
  await handleExplain(ctx as unknown as CommandContext<Context>);
}
