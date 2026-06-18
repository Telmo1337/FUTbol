// Wraps a board's markdown text into a Discord embed (the green card with a coloured
// left bar, a title and a body). The renderers still build the text; this just gives it
// the embed look. Reminder: mentions inside an embed never ping — pings stay in `content`.

/** Relva green — the default accent colour (game on, teams, result, recap, stats). */
export const FUTBOL_GREEN = 0x4caf50;

/**
 * Per-state board colours — the left bar tells you a board's phase at a glance, before
 * you read a word: blurple = a decision (voting), orange = act now (check-in), red =
 * cancelled, gold = money (pagamentos), green = all good (confirmed/teams/result).
 */
export const COLORS = {
  green: FUTBOL_GREEN,
  vote: 0x5865f2, // blurple — voting / decision pending
  checkin: 0xff9800, // orange — game time, check in now
  cancelled: 0xed4245, // red — cancelled
  payment: 0xf1c40f, // gold — pagamentos
} as const;

/** One embed field (a small titled box). `inline` lets Discord place up to ~3 side by side. */
export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface Embed {
  color: number;
  title?: string;
  description?: string;
  fields?: EmbedField[];
  footer?: { text: string };
}

/**
 * Turn a rendered board string into an embed: the first line becomes the title (markdown
 * `**` stripped, since embed titles don't render it) and the rest becomes the description
 * (markdown there works as before).
 */
export function boardEmbed(text: string, color: number = FUTBOL_GREEN): Embed {
  const lines = text.split('\n');
  const title = (lines[0] ?? '').replace(/\*\*/g, '').trim();
  const description = lines.slice(1).join('\n').trim();
  const e: Embed = { color };
  if (title) e.title = title.slice(0, 256);
  if (description) e.description = description.slice(0, 4096);
  return e;
}

/**
 * Build a structured card: title + optional description + inline fields + footer. Use this
 * (vs boardEmbed) when a board wants columns — e.g. Alpha | Beta teams side by side. Footers
 * render as small grey text and do NOT interpret markdown, so strip it before passing.
 */
export function cardEmbed(o: {
  title?: string;
  description?: string;
  fields?: EmbedField[];
  footer?: string;
  color?: number;
}): Embed {
  const e: Embed = { color: o.color ?? FUTBOL_GREEN };
  if (o.title) e.title = o.title.replace(/\*\*/g, '').trim().slice(0, 256);
  if (o.description) e.description = o.description.slice(0, 4096);
  if (o.fields?.length) {
    e.fields = o.fields.map((f) => ({ name: f.name.slice(0, 256), value: f.value.slice(0, 1024), inline: f.inline }));
  }
  if (o.footer) e.footer = { text: o.footer.slice(0, 2048) };
  return e;
}
