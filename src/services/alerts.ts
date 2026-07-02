// Admin alerting: DMs every ADMIN_IDS user when a failure would otherwise stay silent (a tick
// error, or a Discord message edit that failed). Best-effort only — this must never throw, since
// it runs from inside catch blocks and error-handling paths that are already reacting to a failure.
import type { Env } from '../types';
import { parseAdminIds } from '../util';

const API = 'https://discord.com/api/v10';

async function openDm(env: Env, userId: string): Promise<string | null> {
  const res = await fetch(`${API}/users/@me/channels`, {
    method: 'POST',
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient_id: userId }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { id: string };
  return json.id;
}

/** DM every configured admin with `text`. Swallows all failures (logs only) — a broken alert
 *  path must never mask or compound the original failure it's reporting. */
export async function alertAdmins(env: Env, text: string): Promise<void> {
  for (const userId of parseAdminIds(env.ADMIN_IDS)) {
    try {
      const dmChannelId = await openDm(env, userId);
      if (!dmChannelId) continue;
      const res = await fetch(`${API}/channels/${dmChannelId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) console.error('[alert] DM send failed', userId, res.status);
    } catch (e) {
      console.error('[alert] failed to notify admin', userId, e);
    }
  }
}
