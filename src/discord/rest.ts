// Discord REST client + the `Sender` interface that services/games.ts depends on.
// The cron path and the interaction handlers both post/edit messages through this.
// The selftest provides a fake Sender that records calls instead of hitting the API.
import type { Env } from '../types';
import { GROUP_ROLE_ID } from '../config';
import { alertAdmins } from '../services/alerts';
import { M } from '../messages';

const API = 'https://discord.com/api/v10';

/** A message to post or edit. `content` = markdown text; `components` = action rows. */
export interface OutMessage {
  content?: string;
  components?: unknown[];
  /** Rich embeds (the pretty board cards). NOTE: mentions inside embeds never ping. */
  embeds?: unknown[];
  /**
   * Which mention kinds Discord is allowed to resolve into real pings for THIS message.
   * Defaults to user mentions only. The "come and vote" message opts into `'roles'` (the
   * Jogador role) or `'everyone'`; nothing else can ping the whole server even if its text
   * somehow contained @everyone or a role mention.
   */
  allowedMentions?: ('users' | 'everyone' | 'roles')[];
}

/** The send/edit surface the engine needs. Real impl below; fake one in the selftest. */
export interface Sender {
  /** Post a message to a channel; resolves to the new message id (a snowflake string). */
  send(channelId: string, msg: OutMessage): Promise<string>;
  /** Edit a message in place. Omitted fields are left untouched (Discord PATCH semantics). */
  edit(channelId: string, messageId: string, msg: OutMessage): Promise<void>;
}

// Per-message allow-list. Default: user mentions only; the group ping is opt-in per message
// (see OutMessage.allowedMentions). When the group ping is the Jogador role, we whitelist that
// role id EXPLICITLY (roles:[id]) instead of a blanket parse:['roles']: same notification
// behaviour, but scoped to exactly that role — it can never resolve a stray @everyone or some
// other role smuggled into the text, and it stays safe even if the bot is later granted
// MENTION_EVERYONE. User text is also defanged in util.esc(), so a name can't smuggle a ping either.
function mentionsFor(msg: OutMessage) {
  const kinds = msg.allowedMentions ?? ['users'];
  if (GROUP_ROLE_ID && kinds.includes('roles')) {
    return { parse: kinds.filter((k) => k !== 'roles'), roles: [GROUP_ROLE_ID] };
  }
  return { parse: kinds };
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
        embeds: msg.embeds ?? [],
        components: msg.components ?? [],
        allowed_mentions: mentionsFor(msg),
      });
      if (!res.ok) {
        console.error('[discord send]', res.status, await res.text());
        throw new Error(`discord send failed: ${res.status}`);
      }
      const json = (await res.json()) as { id?: unknown };
      if (typeof json.id !== 'string') throw new Error('discord send: malformed response (no message id)');
      return json.id;
    },

    async edit(channelId, messageId, msg) {
      const payload: Record<string, unknown> = { allowed_mentions: mentionsFor(msg) };
      if (msg.content !== undefined) payload.content = msg.content;
      if (msg.embeds !== undefined) payload.embeds = msg.embeds;
      if (msg.components !== undefined) payload.components = msg.components;
      const res = await call(`${API}/channels/${channelId}/messages/${messageId}`, 'PATCH', payload);
      if (!res.ok) {
        console.error('[discord edit]', res.status, await res.text());
        await alertAdmins(env, M.alert.editFailed(channelId, messageId, res.status));
      }
    },
  };
}

/** Edit the original reply of a DEFERRED interaction, via the interaction webhook (no bot
 *  token needed — the token in the interaction payload authorizes this). Used to deliver the
 *  real result/toast after we've already ack'd a button tap to beat Discord's 3s deadline.
 *  Best-effort: never throws, since callers use this from inside their own error handling. */
export async function editInteractionReply(applicationId: string, token: string, content: string): Promise<void> {
  try {
    const res = await fetch(`${API}/webhooks/${applicationId}/${token}/messages/@original`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) console.error('[discord editInteractionReply]', res.status, await res.text());
  } catch (e) {
    console.error('[discord editInteractionReply] failed', e);
  }
}
