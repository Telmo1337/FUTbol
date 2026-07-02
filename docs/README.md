# Documentação do FUTbol

FUTbol é um bot de Discord que organiza o jogo de futebol semanal de um grupo casual: abre a
votação do dia, gere presenças e lista de espera, faz check-in à hora do jogo, monta equipas e
regista resultados, e mantém estatísticas. Corre num Cloudflare Worker (D1 + Cron), sem servidor
sempre-a-correr, em pt-PT.

Esta pasta documenta a arquitetura e o design do sistema. Para começar a usar/correr o projeto,
ver o [README](../README.md) na raiz.

## Índice

| Documento | Para quê | Para quem |
|---|---|---|
| [architecture.md](architecture.md) | Stack, modelo de execução, camadas e os fluxos HTTP e cron | Quem quer a visão geral |
| [system-design.md](system-design.md) | State machine, tick, auto-jogo, nudges e motor de stats | Quem vai mexer na lógica |
| [data-model.md](data-model.md) | Tabelas, diagrama ER, ids e migrações | Quem mexe na base de dados |
| [features.md](features.md) | Ciclo semanal, comandos e componentes, feature a feature | Quem quer saber o que o bot faz |
| [configuration.md](configuration.md) | Variáveis, secrets, feature flags e valores afináveis | Quem configura ou afina |
| [security.md](security.md) | Verificação de assinatura, secrets, escaping, gitleaks | Quem revê segurança |
| [development.md](development.md) | Setup, testes, CI, release flow e deploy | Quem desenvolve |
| [decisions.md](decisions.md) | Registo de decisões de arquitetura (ADRs) | Quem quer perceber o porquê |
| [roadmap.md](roadmap.md) | Histórico de versões e próximos passos | Quem acompanha o produto |
| [changelog.md](changelog.md) | Registo datado de incidentes e correções em produção | Quem investiga um problema |
| [v2-plan.md](v2-plan.md) | Plano histórico da v2 (estatísticas) | Referência histórica |

## Convenções desta documentação

- Prosa em português europeu, com termos técnicos da área em inglês.
- Sem emojis. Os emojis das mensagens do bot (no código) são UX intencional e ficam de fora.
- Sintaxe de menção do Discord (`@everyone`, `<@&ROLE_ID>`) só aparece dentro de code spans,
  nunca como texto plano — em GitHub ou Discord isso criaria uma menção real.
- O código é a fonte da verdade: os valores citados (timings, pesos, flags) vêm de
  `src/config.ts`, `src/db/schema.ts` e `wrangler.toml`.
