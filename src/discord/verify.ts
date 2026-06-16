// Verify that an incoming interaction really came from Discord.
// Discord signs every request with ed25519; we check it against our app's public key.
// Cloudflare Workers' Web Crypto supports Ed25519 natively, so this needs no deps.

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/**
 * @param publicKeyHex  the app's public key (hex) from the Developer Portal
 * @param signatureHex  the `X-Signature-Ed25519` header
 * @param timestamp     the `X-Signature-Timestamp` header
 * @param rawBody       the exact request body text (must be the unparsed bytes)
 */
export async function verifyInteraction(
  publicKeyHex: string,
  signatureHex: string | null,
  timestamp: string | null,
  rawBody: string,
): Promise<boolean> {
  if (!signatureHex || !timestamp) return false;
  try {
    const key = await crypto.subtle.importKey('raw', hexToBytes(publicKeyHex), 'Ed25519', false, ['verify']);
    const message = new TextEncoder().encode(timestamp + rawBody);
    return await crypto.subtle.verify('Ed25519', key, hexToBytes(signatureHex), message);
  } catch (e) {
    console.error('[verify]', e);
    return false;
  }
}
