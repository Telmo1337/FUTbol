// Slash command definitions. Registered once per guild via scripts/register-commands.ts.
// Names must be lowercase (Discord rule). Most take no options — /novojogo opens a modal —
// but /stats and /comparar take USER options (type 6 = a native member picker), so the
// caller mentions/chooses players instead of typing names.

interface CommandOption {
  type: number; // Discord application command option type (6 = USER)
  name: string;
  description: string;
  required?: boolean;
}
interface Command {
  name: string;
  description: string;
  options?: CommandOption[];
}

const USER = 6;

export const COMMANDS: Command[] = [
  { name: 'novojogo', description: 'Abrir uma votação de dia (só admin)' },
  { name: 'jogo', description: 'Ver / repor o jogo atual no canal' },
  { name: 'fecharvotacao', description: 'Fechar já a votação (só admin)' },
  { name: 'cancelar', description: 'Cancelar o jogo atual (só admin)' },
  { name: 'equipas', description: 'Montar / editar as equipas do jogo (só admin)' },
  { name: 'resultado', description: 'Registar o placar do último jogo (só admin)' },
  { name: 'testjogo', description: 'Criar um jogo de teste com jogadores falsos (só canal de teste)' },
  {
    name: 'stats',
    description: 'Rankings do grupo, ou o cartão de um jogador',
    options: [{ type: USER, name: 'jogador', description: 'Ver o cartão deste jogador (público)', required: false }],
  },
  { name: 'eu', description: 'As tuas estatísticas (só tu vês)' },
  {
    name: 'comparar',
    description: 'Comparar dois jogadores lado a lado',
    options: [
      { type: USER, name: 'a', description: 'Primeiro jogador', required: true },
      { type: USER, name: 'b', description: 'Segundo jogador', required: true },
    ],
  },
  { name: 'meuid', description: 'Ver o teu ID de Discord' },
  { name: 'ajuda', description: 'Lista de comandos' },
];
