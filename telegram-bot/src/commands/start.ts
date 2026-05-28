import type { CommandContext, Context } from "grammy";
import { getUser, upsertUser } from "../db/index.js";

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;

export async function handleStart(ctx: CommandContext<Context>): Promise<void> {
  const id = ctx.from?.id;
  if (!id) return;

  const user = getUser(id);
  if (user?.wallet_address) {
    await ctx.reply(
      `Welcome back! Your wallet is set.\n\nUse /briefing for your morning brief, /markets to browse, or /help for all commands.`,
      { parse_mode: "HTML" }
    );
    return;
  }

  upsertUser(id, { pending_action: "awaiting_wallet" });

  await ctx.reply(
    `👋 <b>Welcome to Limi</b>\n\nYour edge on Limitless prediction markets.\n\nTo get started, paste your <b>Base wallet address</b> below (starts with 0x):`,
    { parse_mode: "HTML" }
  );
}

/** Called for any plain text message — handles multi-step flows. */
export async function handleText(ctx: Context): Promise<void> {
  const id = ctx.from?.id;
  const text = ctx.message?.text?.trim();
  if (!id || !text) return;

  const user = getUser(id);
  if (!user || user.pending_action !== "awaiting_wallet") return;

  if (!WALLET_RE.test(text)) {
    await ctx.reply(
      `That doesn't look like a valid Base address (should be 42 hex chars starting with 0x). Try again:`,
      { parse_mode: "HTML" }
    );
    return;
  }

  upsertUser(id, { wallet_address: text, pending_action: null });

  await ctx.reply(
    `✅ <b>Wallet saved.</b>\n\n<code>${text}</code>\n\nYou're all set. Try /briefing for your morning brief, or /markets to see what's live.`,
    { parse_mode: "HTML" }
  );
}
