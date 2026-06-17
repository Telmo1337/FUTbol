// The 💶 "Definir preço" modal (a popup) and the parser for the amount the admin types.
// The price lives per-game in cents; rendering/format is in util.formatEuros, the panel +
// public board components in discord/components, the wiring in discord/interactions.
import { M } from '../messages';

/** The price modal, opened from the admin payment panel. `currentCents` prefills the field. */
export function paymentPriceModal(gameId: number, currentCents: number | null) {
  const input: Record<string, unknown> = {
    type: 4, // text input
    custom_id: 'preco',
    label: M.pay.priceField,
    style: 1, // short
    required: true,
    max_length: 8,
    placeholder: '5,00',
  };
  if (currentCents != null) input.value = (currentCents / 100).toFixed(2).replace('.', ',');
  return {
    custom_id: `pgpricem:${gameId}`,
    title: M.pay.priceModalTitle,
    components: [{ type: 1, components: [input] }],
  };
}

/** Parse "5", "5,50", "5.5", " 5€ " → cents. Rejects junk, negatives, zero, and silly amounts. */
export function parsePriceField(raw: string): { cents: number } | { error: string } {
  const t = (raw ?? '').replace(/€/g, '').replace(/\s+/g, '').replace(',', '.');
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(t)) return { error: M.pay.errBadPrice };
  const eur = Number(t);
  if (!Number.isFinite(eur) || eur <= 0) return { error: M.pay.errBadPrice };
  return { cents: Math.round(eur * 100) };
}
