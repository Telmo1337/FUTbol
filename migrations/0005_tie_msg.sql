-- Guarda o id da mensagem "🤝 Empate na votação!" para a podermos editar/desarmar
-- depois do admin escolher (ou o jogo ser cancelado/expirar) — antes disso os
-- botões ficavam vivos para sempre e um segundo clique só via um erro genérico.
-- Aplicar: wrangler d1 migrations apply futbol-db --local (e --remote no deploy).
-- Manter em sync com src/db/schema.ts.
ALTER TABLE games ADD COLUMN tie_msg_id TEXT;
