# Roadmap e histórico

Onde o projeto esteve e para onde pode ir. As versões abaixo descrevem o que foi entregue;
não há datas de entrega registadas aqui por design (a fonte do histórico é o git).

## Entregue

| Marco | O que trouxe |
|---|---|
| v1 — Ciclo semanal | Votação de dia, vencedor, presenças, lista de espera com promoção automática, avisos e fecho. A base de tudo |
| v2 — Estatísticas | Janela de check-in, fantasmas e os primeiros rankings (fiabilidade, presenças, sequências). Ver `v2-plan.md` |
| v3 — Equipas e resultados | Alpha vs Beta num painel privado + placar -> V/E/D, win rate e série de vitórias |
| v4 — Golos e assistências | Painel de captura de golos/assistências, `/topmarcadores` e boards de goleadores; atrás das flags `GOLOS_ENABLED` / `ASSISTS_ENABLED` |
| v5 — Pagamentos | Board público de quem pagou + painel de gestão e preço por pessoa; atrás de `PAGAMENTOS_ENABLED` |
| Integração field.pt | Auto-jogo a partir da disponibilidade real do campo, agora event-driven (abre quando não há jogo ativo) |
| Métricas extra | Vista mensal, Jogador do Mês, registo perfeito, early-birds, histórico paginado, datas pt-PT |
| UI/UX | Cor por estado, timestamps vivos, boards DRY e equipas Alpha/Beta lado a lado em embed fields |
| Ping ao cargo | A sondagem passa a mencionar o cargo Jogador em vez de `` `@everyone` `` |

## Em aberto

Ideias e melhorias ainda não feitas, sem compromisso de data:

- **Clean sheets / MVP** — métricas adicionais de jogo (jogos sem sofrer golos; jogador da
  partida).
- **Painel web de estatísticas** — uma vista em Cloudflare Pages por cima dos mesmos dados.
- **Rotação do token do Discord** — o único loose end de segurança identificado nas
  re-revisões; rodar o `DISCORD_BOT_TOKEN` periodicamente.

## Documento histórico

`docs/v2-plan.md` é o plano de construção original da v2 (estatísticas). É mantido como registo
de como a feature foi pensada — as definições de presença, fiabilidade e fantasma que lá estão
continuam a valer. A descrição viva dessas métricas está em [system-design.md](system-design.md).
