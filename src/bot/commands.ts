import type { Bot, Context } from 'grammy';
import type { Repo } from '../db/repo';
import type { Env } from '../types';
import { M } from '../messages';
import { isAdmin, playerFromCtx } from './middleware';
import { parseNovoJogo } from './parse-novojogo';
import * as games from '../services/games';
import { loadStats } from '../services/stats';
import { statFor } from '../core/stats';
import { renderPersonalCard, renderStats, sinceLabel } from '../render/stats-message';

const HTML = { parse_mode: 'HTML' as const };

export function registerCommands(bot: Bot, env: Env, repo: Repo): void {
  bot.command('start', async (ctx) => {
    await touch(ctx, env, repo);
    await ctx.reply(M.start, HTML);
  });

  bot.command(['ajuda', 'help'], async (ctx) => {
    await touch(ctx, env, repo);
    await ctx.reply(M.help, HTML);
  });

  bot.command(['euquem', 'whoami'], async (ctx) => {
    await touch(ctx, env, repo);
    await ctx.reply(M.whoami(ctx.from?.id ?? 0), HTML);
  });

  bot.command('novojogo', async (ctx) => {
    await touch(ctx, env, repo);
    if (!ctx.chat || !ctx.from) return;
    if (!isAdmin(env, ctx.from.id)) {
      await ctx.reply(M.notAdmin, HTML);
      return;
    }
    if (await repo.getCurrentGame(ctx.chat.id)) {
      await ctx.reply(M.gameAlreadyActive, HTML);
      return;
    }
    const now = Date.now();
    const parsed = parseNovoJogo(ctx.match ?? '', now);
    if ('error' in parsed) {
      await ctx.reply(parsed.error, HTML);
      return;
    }
    await games.createGame(ctx.api, repo, {
      chatId: ctx.chat.id,
      createdBy: ctx.from.id,
      locationNote: parsed.locationNote,
      minPlayers: parsed.minPlayers,
      capPlayers: parsed.capPlayers,
      voteDeadline: parsed.voteDeadline,
      slots: parsed.slots,
      now,
    });
  });

  bot.command('jogo', async (ctx) => {
    await touch(ctx, env, repo);
    if (!ctx.chat) return;
    const game = await repo.getCurrentGame(ctx.chat.id);
    if (!game) {
      await ctx.reply(M.noActiveGame, HTML);
      return;
    }
    await games.repost(ctx.api, repo, game, Date.now());
  });

  bot.command('fecharvotacao', async (ctx) => {
    await touch(ctx, env, repo);
    if (!ctx.chat || !ctx.from) return;
    if (!isAdmin(env, ctx.from.id)) {
      await ctx.reply(M.notAdmin, HTML);
      return;
    }
    const game = await repo.getCurrentGame(ctx.chat.id);
    if (!game || game.status !== 'VOTING') {
      await ctx.reply(M.noActiveGame, HTML);
      return;
    }
    await games.closeVoting(ctx.api, repo, game, Date.now());
  });

  bot.command(['stats', 'estatisticas'], async (ctx) => {
    await touch(ctx, env, repo);
    if (!ctx.chat) return;
    const stats = await loadStats(repo, ctx.chat.id);
    await ctx.reply(renderStats(stats, sinceLabel(stats.firstKickoff)), HTML);
  });

  bot.command(['eu', 'me'], async (ctx) => {
    await touch(ctx, env, repo);
    if (!ctx.chat || !ctx.from) return;
    const stats = await loadStats(repo, ctx.chat.id);
    const name = playerFromCtx(ctx)?.displayName ?? 'Jogador';
    await ctx.reply(renderPersonalCard(statFor(stats, ctx.from.id, name), stats.totalGames), HTML);
  });

  bot.command('cancelar', async (ctx) => {
    await touch(ctx, env, repo);
    if (!ctx.chat || !ctx.from) return;
    if (!isAdmin(env, ctx.from.id)) {
      await ctx.reply(M.notAdmin, HTML);
      return;
    }
    const game = await repo.getCurrentGame(ctx.chat.id);
    if (!game) {
      await ctx.reply(M.noActiveGame, HTML);
      return;
    }
    await games.cancelGame(ctx.api, repo, game, Date.now());
  });
}

/** Record/refresh the player on every interaction. */
async function touch(ctx: Context, env: Env, repo: Repo): Promise<void> {
  const p = playerFromCtx(ctx);
  if (p) await repo.upsertPlayer(p, isAdmin(env, p.tgUserId), Date.now());
}
