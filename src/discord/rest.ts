// Discord REST client + the `Sender` interface that services/games.ts depends on.
// The cron path and the interaction handlers both post/edit messages through this.
// The selftest provides a fake Sender that records calls instead of hitting the API.
import type { Env } from '../types';

const API = 'https://discord.com/api/v10';

/** A message to post or edit. `content` = markdown text; `components` = action rows. */
export interface OutMessage {
  content?: string;
  components?: unknown[];
  /**
   * Which mention kinds Discord is allowed to resolve into real pings for THIS message.
   * Defaults to user mentions only. The "come and vote" message opts into `'everyone'`;
   * nothing else can ping the whole server even if its text somehow contained @everyone.
   */
  allowedMentions?: ('users' | 'everyone')[];
}

/** The send/edit surface the engine needs. Real impl below; fake one in the selftest. */
export interface Sender {
  /** Post a message to a channel; resolves to the new message id (a snowflake string). */
  send(channelId: string, msg: OutMessage): Promise<string>;
  /** Edit a message in place. Omitted fields are left untouched (Discord PATCH semantics). */
  edit(channelId: string, messageId: string, msg: OutMessage): Promise<void>;
}

// Per-message allow-list. We default to user mentions only; the group ping (@everyone)
// is opt-in per message (see OutMessage.allowedMentions). User-provided text is also
// defanged in util.esc(), so a name can never smuggle a real ping through either way.
function mentionsFor(msg: OutMessage) {
  return { parse: msg.allowedMentions ?? ['users'] };
}

export function createSender(env: Env): Sender {
  const headers = {
    Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
    'Content-Type': 'application/json',
  };

  // One retry that respects Discord's rate-limit hint; otherwise log and move on.
  async function call(url: string, method: 'POST' | 'PATCH', payload: unknown): Promise<Response> {
    const body = JSON.stringify(payload);
    let res = await fetch(url, { method, headers, body });
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after') ?? '1');
      await new Promise((r) => setTimeout(r, Math.min(5000, retry * 1000)));
      res = await fetch(url, { method, headers, body });
    }
    return res;
  }

  return {
    async send(channelId, msg) {
      const res = await call(`${API}/channels/${channelId}/messages`, 'POST', {
        content: msg.content ?? '',
        components: msg.components ?? [],
        allowed_mentions: mentionsFor(msg),
      });
      if (!res.ok) {
        console.error('[discord send]', res.status, await res.text());
        throw new Error(`discord send failed: ${res.status}`);
      }
      const json = (await res.json()) as { id: string };
      return json.id;
    },

    async edit(channelId, messageId, msg) {
      const payload: Record<string, unknown> = { allowed_mentions: mentionsFor(msg) };
      if (msg.content !== undefined) payload.content = msg.content;
      if (msg.components !== undefined) payload.components = msg.components;
      const res = await call(`${API}/channels/${channelId}/messages/${messageId}`, 'PATCH', payload);
      if (!res.ok) console.error('[discord edit]', res.status, await res.text());
    },
  };
}
