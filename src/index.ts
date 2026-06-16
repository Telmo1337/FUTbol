// Cloudflare Workers entry point: webhook (fetch) + cron (scheduled).
import { webhookCallback } from 'grammy';
import type { Env } from './types';
import { createApi, createBot } from './bot/bot';
import { createRepo } from './db/repo';
import { runTick } from './services/tick';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'GET') return new Response('FUTbol bot online ⚽');
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });

    // Verify the call really came from Telegram (set with setWebhook?secret_token=...).
    if (env.WEBHOOK_SECRET) {
      const got = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
      if (got !== env.WEBHOOK_SECRET) return new Response('unauthorized', { status: 401 });
    }

    const bot = createBot(env);
    return webhookCallback(bot, 'cloudflare-mod')(request);
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const repo = createRepo(env.DB);
    const api = createApi(env);
    await runTick(api, repo, Date.now());
  },
} satisfies ExportedHandler<Env>;
