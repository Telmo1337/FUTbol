// Verify that an incoming interaction really came from Discord.
// Discord signs every request with ed25519; we check it against our app's public key.
// Cloudflare Workers' Web Crypto supports Ed25519 natively, so this needs no deps.

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

// The signature already covers the timestamp, so it can't be forged — but a previously
// valid interaction could be *replayed* later. Rejecting timestamps outside a small
// window blunts that. 5 min is well clear of normal clock skew between us and Discord.
const SIGNATURE_MAX_AGE_MS = 5 * 60_000;

/**
 * @param publicKeyHex  the app's public key (hex) from the Developer Portal
 * @param signatureHex  the `X-Signature-Ed25519` header
 * @param timestamp     the `X-Signature-Timestamp` header (unix seconds, signed by Discord)
 * @param rawBody       the exact request body text (must be the unparsed bytes)
 * @param nowMs         current time; injectable for tests
 */
export async function verifyInteraction(
  publicKeyHex: string,
  signatureHex: string | null,
  timestamp: string | null,
  rawBody: string,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (!signatureHex || !timestamp) return false;
  // Freshness check (replay protection). A faked timestamp won't pass the signature
  // check below, so this only ever rejects genuine-but-stale (replayed) requests.
  const tsMs = Number(timestamp) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(nowMs - tsMs) > SIGNATURE_MAX_AGE_MS) return false;
  try {
    const key = await crypto.subtle.importKey('raw', hexToBytes(publicKeyHex), 'Ed25519', false, ['verify']);
    const message = new TextEncoder().encode(timestamp + rawBody);
    return await crypto.subtle.verify('Ed25519', key, hexToBytes(signatureHex), message);
  } catch (e) {
    console.error('[verify]', e);
    return false;
  }
}
