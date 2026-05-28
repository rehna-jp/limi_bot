import type { CommandContext, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { getUser } from "../db/index.js";
import { getTrendingMarkets, getUserPositions } from "../limitless/api.js";
import { buildBriefing } from "../format.js";

export async function handleBriefing(ctx: CommandContext<Context>): Promise<void> {
  const id = ctx.from?.id;
  if (!id) return;

  const user = getUser(id);
  if (!user?.wallet_address) {
    await ctx.reply("Set your wallet first with /start.");
    return;
  }

  await ctx.reply("Fetching your brief…");

  try {
    const [markets, positions] = await Promise.all([
      getTrendingMarkets(5),
      getUserPositions(user.wallet_address),
    ]);

    const firstName = ctx.from?.first_name ?? "trader";
    const text = buildBriefing(firstName, markets, positions);

    const keyboard = new InlineKeyboard()
      .url("Open Limitless", "https://limitless.exchange")
      .url("See all markets", "https://limitless.exchange/markets");

    await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
  } catch (err) {
    await ctx.reply(`Couldn't load your brief right now. Try again in a moment.`);
    console.error("[briefing]", err);
  }
}
