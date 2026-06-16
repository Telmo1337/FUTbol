// Small HTML helpers for Telegram messages (we use parse_mode: 'HTML' everywhere).

/** Escape user-provided text so it can't break our HTML markup. */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** An HTML mention that actually pings the user (works even without a @username). */
export function mention(p: { tgUserId: number; displayName: string }): string {
  return `<a href="tg://user?id=${p.tgUserId}">${esc(p.displayName)}</a>`;
}

/** Parse the ADMIN_IDS env var ("123,456") into a set of numeric ids. */
export function parseAdminIds(raw: string | undefined): Set<number> {
  const set = new Set<number>();
  if (!raw) return set;
  for (const part of raw.split(',')) {
    const n = Number(part.trim());
    if (Number.isFinite(n) && n !== 0) set.add(n);
  }
  return set;
}
