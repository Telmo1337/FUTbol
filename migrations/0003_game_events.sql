-- v4 "golos + assistências": eventos individuais por jogo. Cada linha = 1 golo (kind 'G')
-- ou 1 assistência (kind 'A') de um jogador num jogo. Daqui derivam as boards
-- ⚽ Goleadores / 🅰️ Assistências, as linhas no /eu e o "marcador do jogo" no /historico.
-- O id autoincrement deixa o "anular último" ser um DELETE do max(id).
-- Aplicar: wrangler d1 migrations apply futbol-db --local (e --remote no deploy).
-- Manter em sync com src/db/schema.ts.
CREATE TABLE game_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id    INTEGER NOT NULL,
  tg_user_id TEXT    NOT NULL,
  kind       TEXT    NOT NULL,   -- 'G' golo | 'A' assistência
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_game_events_game ON game_events (game_id);
