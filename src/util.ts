// Small text helpers for Discord messages (we send markdown in message content).

/**
 * Make user-provided text (names, locations) safe to drop into a Discord message:
 *  - backslash-escape the inline markdown chars so it can't turn bold/italic/etc.
 *  - defang @ and < with an invisible zero-width space so a name like "@everyone"
 *    or "<@123>" can never become a real ping (names are inline, never line-start,
 *    so list/heading/quote chars don't need escaping).
 */
export function esc(s: string): string {
  return s
    .replace(/([\\*_~`|])/g, '\\$1')
    .replace(/@/g, '@​')
    .replace(/</g, '<​');
}

/** A Discord mention that pings the user. The id is a snowflake string. */
export function mention(p: { tgUserId: string }): string {
  return `<@${p.tgUserId}>`;
}

/** Parse the ADMIN_IDS env var ("123,456") into a set of Discord user-id strings. */
export function parseAdminIds(raw: string | undefined): Set<string> {
  const set = new Set<string>();
  if (!raw) return set;
  for (const part of raw.split(',')) {
    const id = part.trim();
    if (id) set.add(id);
  }
  return set;
}
