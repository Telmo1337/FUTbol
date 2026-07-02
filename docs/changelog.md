# Changelog

Registo cronológico de incidentes e correções em produção — o "o que aconteceu e o que foi
feito", com datas. Diferente do [roadmap](roadmap.md) (marcos de produto, sem datas por design);
este ficheiro é sobre bugs, incidentes e a resposta a eles.

> **Política de atualização:** este ficheiro só é atualizado quando o utilizador pede
> explicitamente ("regista isto no changelog" ou equivalente) — não é mantido automaticamente a
> cada tarefa ou PR.

## 2026-07-02 — Desempate bloqueado + sondagem tardia (PR #29)

**Incidente.** O jogo id 54 (sondagem semanal) fechou empatado, mas um clique de desempate foi
aceite para um horário que nem estava empatado ("Sáb 09:00", 1 voto). A partir daí, todos os
cliques seguintes davam só "Algo correu mal 😬" — o admin ficou sem forma de escolher o horário
certo. O quadro de votação antigo também ficou pendurado com botões vivos.

**Causa raiz.**
- `resolveTie` aceitava qualquer slot do jogo, sem validar se era futuro ou se pertencia ao
  conjunto empatado; o repost de `/jogo` num jogo em desempate mostrava botões para todos os
  slots, incluindo datas passadas.
- O prompt "🤝 Empate na votação!" nunca era desarmado (o id da mensagem não era guardado), por
  isso os seus botões continuavam vivos indefinidamente.
- `openRsvp` gravava o estado `RSVP_OPEN` antes de publicar o quadro de inscrições — se essa
  publicação falhasse, o jogo ficava preso sem quadro e sem forma de voltar ao fluxo de
  desempate.

**Correção.**
- `resolveTie` passa a devolver um resultado específico (`ok` / `past-slot` / `not-tiebreak` /
  `bad-slot`), mapeado para mensagens pt-PT distintas.
- O id da mensagem do prompt de desempate é guardado (`games.tie_msg_id`, migração
  `0005_tie_msg.sql`) e desarmado ao resolver, cancelar (`/cancelar`) ou repor (`/jogo`).
- `closeVoting` filtra slots futuros antes de escolher o vencedor: sem slots futuros ⇒ jogo
  cancelado (não por decisão do admin, para a cron poder relançar sozinha) com mensagem clara.
- `openRsvp` tranca o vencedor com escrita condicional e reverte o estado se a publicação do
  quadro falhar, em vez de deixar o jogo preso.
- A cron passa a expirar um desempate cujos horários já passaram todos.
- Ativado o Cloudflare Workers Logs em produção (grátis, retenção de 3 dias), para os erros hoje
  silenciosos ficarem pesquisáveis da próxima vez.
- 12 novos testes em `scripts/selftest.ts` reproduzem o cenário exato do incidente.

**Recuperação.** Confirmado via D1 que o jogo 54 estava exatamente como previsto (`RSVP_OPEN` sem
quadro de inscrições publicado). Após o deploy da correção, o jogo foi marcado `CANCELLED` na
base de dados — a cron relançou sozinha uma sondagem nova (jogo 55) dentro de um minuto, sem
intervenção manual adicional.
