import { esc } from '../util';

/** "• Name" bullet list, one per line — or `empty` when there's nothing to list. */
export const bulletList = (items: { displayName: string }[], empty: string): string =>
  items.length === 0 ? empty : items.map((p) => `• ${esc(p.displayName)}`).join('\n');
