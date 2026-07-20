// Renders for the 💶 Pagamentos public board and the admin's private panel.
// Text only — the interactions layer wraps it in an embed and attaches the select/buttons.
import { M } from '../messages';
import { formatEuros } from '../util';
import { formatDay } from '../core/time';
import { bulletList } from './list';
import type { PaymentState } from '../services/payments';

const list = (items: { displayName: string }[]): string => bulletList(items, M.pay.empty);

/** Price + collected/expected lines. Just the price-unset note when no price is set yet. */
function totals(s: PaymentState): string[] {
  if (s.priceCents == null) return [M.pay.priceUnset];
  const paidCount = s.players.filter((p) => s.paid.has(p.tgUserId)).length;
  const expected = s.priceCents * s.players.length;
  const collected = s.priceCents * paidCount;
  return [
    M.pay.priceLine(formatEuros(s.priceCents)),
    M.pay.totalsLine(
      formatEuros(collected),
      formatEuros(expected),
      formatEuros(expected - collected),
      paidCount,
      s.players.length,
    ),
  ];
}

/** The public board: price, totals, and the "já pagaram" / "em falta" buckets. */
export function renderPaymentBoard(s: PaymentState): string {
  const day = s.kickoffAt != null ? formatDay(s.kickoffAt) : '';
  const paid = s.players.filter((p) => s.paid.has(p.tgUserId));
  const owe = s.players.filter((p) => !s.paid.has(p.tgUserId));
  return [
    M.pay.boardTitle(day),
    '',
    ...totals(s),
    '',
    M.pay.paidHeader(paid.length),
    list(paid),
    '',
    M.pay.oweHeader(owe.length),
    list(owe),
    '',
    M.pay.boardFooter,
  ].join('\n');
}

/** The admin's private (ephemeral) panel: title, hint + the same totals for context. */
export function renderPaymentPanel(s: PaymentState): string {
  return [M.pay.panelTitle, M.pay.panelHint, '', ...totals(s)].join('\n');
}
