import type { CommandContext, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { getUser } from "../db/index.js";
import { getUserPositions } from "../limitless/api.js";
import { buildPositions } from "../format.js";

export async function handlePositions(ctx: CommandContext<Context>): Promise<void> {
  const id = ctx.from?.id;
  if (!id) return;

  const user = getUser(id);
  if (!user?.wallet_address) {
    await ctx.reply("Set your wallet first with /start.");
    return;
  }

  try {
    const positions = await getUserPositions(user.wallet_address);
    const walletShort =
      user.wallet_address.slice(0, 6) + "…" + user.wallet_address.slice(-4);
    const text = buildPositions(positions, walletShort);

    const keyboard = new InlineKeyboard().url(
      "Open Limitless portfolio",
      `https://limitless.exchange/portfolio`
    );

    await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
  } catch (err) {
    await ctx.reply("Couldn't load positions right now. Try again in a moment.");
    console.error("[positions]", err);
  }
}
