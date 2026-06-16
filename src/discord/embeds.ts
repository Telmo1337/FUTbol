// Wraps a board's markdown text into a Discord embed (the green card with a coloured
// left bar, a title and a body). The renderers still build the text; this just gives it
// the embed look. Reminder: mentions inside an embed never ping — pings stay in `content`.

/** Relva green — the single accent colour for every FUTbol board. */
export const FUTBOL_GREEN = 0x4caf50;

export interface Embed {
  color: number;
  title?: string;
  description?: string;
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
