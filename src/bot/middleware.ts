import type { Context } from 'grammy';
import { parseAdminIds } from '../util';
import type { Env } from '../types';

/** v1: admins come from the ADMIN_IDS env var. (players.is_admin is reserved for later.) */
export function isAdmin(env: Env, userId: number | undefined): boolean {
  if (userId == null) return false;
  return parseAdminIds(env.ADMIN_IDS).has(userId);
}

export function playerFromCtx(
  ctx: Context,
): { tgUserId: number; displayName: string; username: string | null } | null {
  const u = ctx.from;
  if (!u) return null;
  const displayName = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Jogador';
  return { tgUserId: u.id, displayName, username: u.username ?? null };
}
