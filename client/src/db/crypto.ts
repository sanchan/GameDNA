// Web Crypto API: PBKDF2 key derivation + AES-GCM encrypt/decrypt for Steam API key.
// Uses a device-specific passphrase derived from a fixed salt + user action.

const ALGO = 'AES-GCM';
const KEY_LENGTH = 256;
const ITERATIONS = 100_000;

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase) as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: ALGO, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  );
}

function toBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function encryptApiKey(
  apiKey: string,
  passphrase: string,
): Promise<{ encrypted: string; iv: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);

  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    key,
    enc.encode(apiKey),
  );

  return {
    encrypted: toBase64(ciphertext),
    iv: toBase64(iv.buffer as ArrayBuffer),
    salt: toBase64(salt.buffer as ArrayBuffer),
  };
}

export async function decryptApiKey(
  encrypted: string,
  iv: string,
  salt: string,
  passphrase: string,
): Promise<string> {
  const key = await deriveKey(passphrase, fromBase64(salt));
  const dec = new TextDecoder();
  const ivBuf = fromBase64(iv);
  const encBuf = fromBase64(encrypted);
  const plaintext = await crypto.subtle.decrypt(
    { name: ALGO, iv: ivBuf.buffer as ArrayBuffer },
    key,
    encBuf.buffer as ArrayBuffer,
  );
  return dec.decode(plaintext);
}

// Simple passphrase derived from browser fingerprint-like data.
// Not meant to be highly secure — just prevents casual access to the stored key.
export function getDevicePassphrase(): string {
  const parts = [
    navigator.userAgent,
    navigator.language,
    screen.width.toString(),
    screen.height.toString(),
    'gamedna-local-v1',
  ];
  return parts.join('|');
}
