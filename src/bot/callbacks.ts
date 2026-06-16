import type { Bot } from 'grammy';
import type { Repo } from '../db/repo';
import type { Env } from '../types';
import { M } from '../messages';
import { isAdmin, playerFromCtx } from './middleware';
import { parseCb } from '../render/keyboards';
import * as games from '../services/games';

export function registerCallbacks(bot: Bot, env: Env, repo: Repo): void {
  bot.on('callback_query:data', async (ctx) => {
    const now = Date.now();
    const p = playerFromCtx(ctx);
    if (p) await repo.upsertPlayer(p, isAdmin(env, p.tgUserId), now);

    const parsed = parseCb(ctx.callbackQuery.data);
    if (!parsed || !ctx.from) {
      await ctx.answerCallbackQuery();
      return;
    }

    let ack = '';
    try {
      if (parsed.kind === 'vote') {
        ack = await games.handleVote(ctx.api, repo, parsed.gameId, parsed.slotId, ctx.from.id, now);
      } else if (parsed.kind === 'rsvp') {
        ack = await games.handleRsvp(ctx.api, repo, parsed.gameId, ctx.from.id, parsed.status, now);
      } else if (parsed.kind === 'tie') {
        if (!isAdmin(env, ctx.from.id)) ack = M.cb.onlyAdmin;
        else ack = (await games.resolveTie(ctx.api, repo, parsed.gameId, parsed.slotId, now)) ? M.cb.tieResolved : M.cb.error;
      }
    } catch (e) {
      console.error('[callback]', e);
      ack = M.cb.error;
    }
    await ctx.answerCallbackQuery(ack ? { text: ack } : undefined);
  });
}
