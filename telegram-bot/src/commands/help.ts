import type { CommandContext, Context } from "grammy";

const HELP_TEXT = `<b>Limi — your edge on Limitless</b>

/start — set your wallet address
/briefing — morning brief: top markets + your positions
/markets [category] — browse active markets
/explain &lt;slug&gt; — explain a market in plain English
/positions — your open positions with PnL
/watch &lt;slug&gt; &lt;threshold&gt; — alert when odds drift by threshold %
/help — this message

<i>Slugs look like: btc-above-100k-jun-2026</i>`;

export async function handleHelp(ctx: CommandContext<Context>): Promise<void> {
  await ctx.reply(HELP_TEXT, { parse_mode: "HTML" });
}
