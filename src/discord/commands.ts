// Slash command definitions. Registered once per guild via scripts/register-commands.ts.
// Names must be lowercase (Discord rule); none take options — /novojogo opens a modal.

export const COMMANDS = [
  { name: 'novojogo', description: 'Abrir uma votação de dia (só admin)' },
  { name: 'jogo', description: 'Ver / repor o jogo atual no canal' },
  { name: 'fecharvotacao', description: 'Fechar já a votação (só admin)' },
  { name: 'cancelar', description: 'Cancelar o jogo atual (só admin)' },
  { name: 'stats', description: 'Ranking de presenças e fiabilidade' },
  { name: 'eu', description: 'As tuas estatísticas (só tu vês)' },
  { name: 'euquem', description: 'Ver o teu ID de Discord' },
  { name: 'ajuda', description: 'Lista de comandos' },
];
