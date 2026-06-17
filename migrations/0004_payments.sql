-- v5 "💶 pagamentos": acompanhar quem já pagou cada jogo + o preço por pessoa.
-- Uma linha em `payments` = este jogador já pagou este jogo (presença = pago; ausência = deve).
-- O preço vive no próprio jogo (em cêntimos, para não haver erros de vírgula flutuante);
-- `payment_msg_id` guarda o quadro público de pagamentos para o editarmos no sítio.
-- Aplicar: wrangler d1 migrations apply futbol-db --local (e --remote no deploy).
-- Manter em sync com src/db/schema.ts.
ALTER TABLE games ADD COLUMN price_per_person_cents INTEGER;
ALTER TABLE games ADD COLUMN payment_msg_id TEXT;

CREATE TABLE payments (
  game_id    INTEGER NOT NULL,
  tg_user_id TEXT    NOT NULL,
  paid_at    INTEGER NOT NULL,
  PRIMARY KEY (game_id, tg_user_id)
);
CREATE INDEX idx_payments_game ON payments (game_id);
