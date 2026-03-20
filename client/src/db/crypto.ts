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

// Device-derived passphrase for local API key obfuscation.
//
// THREAT MODEL v3: The passphrase now incorporates an optional user-provided
// PIN. Without a PIN the keyspace is ~8 values (browser language codes) which
// can be brute-forced trivially. With a 4-digit PIN the keyspace jumps to
// ~80,000 combinations (8 languages × 10,000 PINs), which is impractical for
// casual attacks while still being lightweight for the user.
//
// GameDNA stores data locally, so anyone with filesystem access already owns
// the machine. The goal is to prevent the API key from sitting in plaintext
// in the DB and to deter casual inspection — not to defend against a targeted
// attacker with full disk access.
//
// For real security in Tauri desktop builds, consider using the OS keychain
// (tauri-plugin-stronghold or keyring integration) in the future.

let _userPin: string | null = null;

/** Set the user's encryption PIN for the current session. */
export function setEncryptionPin(pin: string | null): void {
  _userPin = pin;
}

/** Get the currently set encryption PIN (null if none). */
export function getEncryptionPin(): string | null {
  return _userPin;
}

export function getDevicePassphrase(): string {
  const parts = [
    navigator.language,
    'gamedna-local-v3',
  ];
  if (_userPin) parts.push(_userPin);
  return parts.join('|');
}

/** v2 passphrase (no PIN) — used for migration from v2 to v3. */
export function getV2DevicePassphrase(): string {
  return [navigator.language, 'gamedna-local-v2'].join('|');
}

// Legacy passphrase that included userAgent — used for migration only.
export function getLegacyDevicePassphrase(): string {
  const parts = [
    navigator.userAgent,
    navigator.language,
    screen.width.toString(),
    screen.height.toString(),
    'gamedna-local-v1',
  ];
  return parts.join('|');
}

// ── API Key Validation ────────────────────────────────────────────────────

/** Validate that a string looks like a Steam Web API key (32 hex chars). */
export function isValidSteamApiKeyFormat(key: string): boolean {
  return /^[0-9A-Fa-f]{32}$/.test(key.trim());
}

/** Validate Ollama URL format. */
export function isValidOllamaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
