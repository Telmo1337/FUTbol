-- Nova regra de fecho da sondagem: a votação vive 7 dias (VOTE_MAX_WAIT_MS) e fecha mais
-- cedo assim que um horário reúne `min_players` votos; antes disto o deadline era
-- "slot mais cedo − 6h". Alinha as sondagens ainda abertas com a regra nova, para não
-- fecharem/cancelarem horas depois de abrir por causa do primeiro horário.
-- Aplicar: wrangler d1 migrations apply futbol-db --local (e --remote no deploy).
UPDATE games SET vote_deadline = created_at + 604800000 WHERE status = 'VOTING';
