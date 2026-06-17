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

/**
 * Master switch for the ⚽ golos/assistências feature (capture panel, /stats boards,
 * /eu & /comparar lines, /historico scorer, /topmarcadores). ON unless GOLOS_ENABLED is
 * explicitly off ("false"/"0"/"off"/"no") — so it defaults on and you flip the env var to
 * disable, no code change. Past events are kept while off and reappear when re-enabled.
 */
export function golosEnabled(env: { GOLOS_ENABLED?: string }): boolean {
  const v = (env.GOLOS_ENABLED ?? '').trim().toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'off' && v !== 'no';
}

/**
 * Sub-switch for 🅰️ assistências only (the assist select, board, lines + /historico assist
 * tally). ON by default; set ASSISTS_ENABLED off to drop assists while keeping goals — goals
 * are objective (the ball went in), assists are a subjective manual call. Always AND this with
 * golosEnabled at the call site: assists are part of the golos feature, so off-golos = off-assists.
 */
export function assistsEnabled(env: { ASSISTS_ENABLED?: string }): boolean {
  const v = (env.ASSISTS_ENABLED ?? '').trim().toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'off' && v !== 'no';
}

/**
 * Master switch for the 💶 pagamentos feature (the /pagamentos board + admin panel). ON by
 * default; set PAGAMENTOS_ENABLED to "false"/"0"/"off"/"no" to hide it without a code change.
 * Same shape as golosEnabled — flip the env var to enable in prod once you've tested it.
 */
export function pagamentosEnabled(env: { PAGAMENTOS_ENABLED?: string }): boolean {
  const v = (env.PAGAMENTOS_ENABLED ?? '').trim().toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'off' && v !== 'no';
}

/** Format a cent amount as a pt-PT euro string, e.g. 550 → "5,50€". */
export function formatEuros(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')}€`;
}
