// Shared Discord "board" helpers. A board = an embed (the coloured card) optionally carrying
// buttons/selects. Every service that posts or edits a board (games, teams, payments) uses
// these — previously each kept its own near-identical copy.
//   • opts.color   → the per-state left bar (see discord/embeds COLORS); default green.
//   • opts.content → any real ping text (@everyone), which must live in content, never the
//                    embed (mentions inside an embed never notify).
import type { Sender } from '../discord/rest';
import { boardEmbed } from '../discord/embeds';

/** Post a board; returns the new message id. */
export async function sendBoard(
  api: Sender,
  chatId: string,
  text: string,
  components?: unknown[],
  opts?: { content?: string; allowedMentions?: ('users' | 'everyone')[]; color?: number },
): Promise<string> {
  return api.send(chatId, {
    content: opts?.content,
    embeds: [boardEmbed(text, opts?.color)],
    components: components ?? [],
    allowedMentions: opts?.allowedMentions,
  });
}

/** Edit a board's embed (and buttons) in place, clearing any leftover ping content. */
export async function editBoard(
  api: Sender,
  chatId: string,
  msgId: string,
  text: string,
  components?: unknown[],
  color?: number,
): Promise<void> {
  await api.edit(chatId, msgId, { content: '', embeds: [boardEmbed(text, color)], components: components ?? [] });
}

/** Strip the buttons off a message, leaving its text/embed untouched. */
export async function removeKeyboard(api: Sender, chatId: string, msgId: string): Promise<void> {
  await api.edit(chatId, msgId, { components: [] });
}
