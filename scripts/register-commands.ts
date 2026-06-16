// Registers the slash commands on your server (guild). Run once, and again whenever
// you change COMMANDS.  Reads secrets from .dev.vars (same as local dev):
//   npm run register
// Needs DISCORD_APPLICATION_ID, DISCORD_GUILD_ID and DISCORD_BOT_TOKEN in .dev.vars.
import { getPlatformProxy } from 'wrangler';
import type { Env } from '../src/types';
import { COMMANDS } from '../src/discord/commands';

const proxy = await getPlatformProxy<Env>();
const env = proxy.env;

const appId = env.DISCORD_APPLICATION_ID;
const guildId = env.DISCORD_GUILD_ID;
const token = env.DISCORD_BOT_TOKEN;
if (!appId || !guildId || !token) {
  throw new Error(
    'Faltam segredos no .dev.vars: DISCORD_APPLICATION_ID, DISCORD_GUILD_ID e DISCORD_BOT_TOKEN.',
  );
}

const res = await fetch(`https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`, {
  method: 'PUT', // bulk overwrite: this list becomes the full set of guild commands
  headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(COMMANDS),
});

const text = await res.text();
await proxy.dispose();

if (!res.ok) {
  console.error(`❌ Registo falhou (${res.status}):`, text);
  throw new Error('command registration failed');
}
console.log(`✅ ${COMMANDS.length} comandos registados no servidor ${guildId}.`);
