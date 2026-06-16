import { Api, Bot } from 'grammy';
import type { Env } from '../types';
import { createRepo } from '../db/repo';
import { registerCommands } from './commands';
import { registerCallbacks } from './callbacks';

/** Build a fully-wired bot. Runtime-agnostic: used by both local polling and the Worker. */
export function createBot(env: Env): Bot {
  const repo = createRepo(env.DB);
  // botInfo lets the Worker skip a getMe call per request. Locally it's omitted and grammy fetches it once.
  const bot = new Bot(env.BOT_TOKEN, env.BOT_INFO ? { botInfo: JSON.parse(env.BOT_INFO) } : undefined);
  registerCommands(bot, env, repo);
  registerCallbacks(bot, env, repo);
  bot.catch((err) => console.error('[bot]', err.error));
  return bot;
}

/** Lightweight API client for the scheduled (cron) path, which doesn't handle updates. */
export function createApi(env: Env): Api {
  return new Api(env.BOT_TOKEN);
}
