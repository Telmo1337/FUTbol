// Cloudflare Workers entry point: Discord interactions endpoint (fetch) + cron (scheduled).
import type { Env } from './types';
import { verifyInteraction } from './discord/verify';
import { handleInteraction } from './discord/interactions';
import { createSender } from './discord/rest';
import { createRepo } from './db/repo';
import { createFieldClient } from './services/field';
import { runTick } from './services/tick';
import { parseAdminIds } from './util';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'GET') return new Response('FUTbol bot online ⚽');
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });

    // Every interaction is ed25519-signed; reject anything we can't verify as Discord's.
    const signature = request.headers.get('X-Signature-Ed25519');
    const timestamp = request.headers.get('X-Signature-Timestamp');
    const body = await request.text();
    if (!(await verifyInteraction(env.DISCORD_PUBLIC_KEY, signature, timestamp, body))) {
      return new Response('invalid request signature', { status: 401 });
    }

    const interaction = JSON.parse(body);
    const repo = createRepo(env.DB);
    const sender = createSender(env);
    return handleInteraction(interaction, env, repo, sender, ctx);
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    try {
      const repo = createRepo(env.DB);
      const sender = createSender(env);
      const field = createFieldClient();
      const weekly = {
        channelId: env.GAME_CHANNEL_ID ?? '',
        createdBy: parseAdminIds(env.ADMIN_IDS).values().next().value ?? 'system',
      };
      await runTick(sender, repo, Date.now(), field, weekly, env);
    } catch (e) {
      // runTick already alerts admins for anything it can catch; this is the last-resort
      // net for a failure before/outside that (e.g. createRepo/createSender throwing).
      console.error('[scheduled]', e);
    }
  },
} satisfies ExportedHandler<Env>;
