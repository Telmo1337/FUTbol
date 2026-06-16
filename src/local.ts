// Local entry point: long polling + a setInterval tick, using the SAME code as the Worker.
// Talks to the real local D1 (via wrangler) so what you test is what you deploy.
import { getPlatformProxy } from 'wrangler';
import type { Env } from './types';
import { createBot } from './bot/bot';
import { createRepo } from './db/repo';
import { runTick } from './services/tick';
import { TICK_INTERVAL_MS_LOCAL } from './config';

const proxy = await getPlatformProxy<Env>();
const env = proxy.env;

if (!env.BOT_TOKEN) {
  throw new Error('Falta BOT_TOKEN — copia .dev.vars.example para .dev.vars e mete o teu token do @BotFather.');
}

const repo = createRepo(env.DB);
const bot = createBot(env);

setInterval(() => {
  runTick(bot.api, repo, Date.now()).catch((e) => console.error('[tick]', e));
}, TICK_INTERVAL_MS_LOCAL);

console.log('⚽ A iniciar o bot em modo local (long polling)...');
await bot.start({
  onStart: (info) =>
    console.log(`✅ @${info.username} a correr. Deixa esta janela aberta. Ctrl+C para parar.`),
});
