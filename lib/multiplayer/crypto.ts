/**
 * End-to-end encryption between the host and each guest.
 *
 * Broadcast messages reach everyone on the channel, so the host seals each player's
 * redacted view with a key only that player shares (ECDH P-256 → AES-GCM). The same key
 * authenticates guest moves: a move that doesn't decrypt with your key isn't from you.
 */
const subtle = () => globalThis.crypto.subtle;

export interface Sealed {
  iv: string;
  ct: string;
}

export interface Identity {
  keyPair: CryptoKeyPair;
  /** base64 raw public key, shared through presence. */
  publicKey: string;
}

export interface StoredIdentity {
  privateJwk: JsonWebKey;
  publicJwk: JsonWebKey;
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const ECDH = { name: "ECDH", namedCurve: "P-256" } as const;

async function publicKeyB64(key: CryptoKey) {
  return toBase64(new Uint8Array(await subtle().exportKey("raw", key)));
}

export async function generateIdentity(): Promise<Identity> {
  const keyPair = await subtle().generateKey(ECDH, true, ["deriveKey"]);
  return { keyPair, publicKey: await publicKeyB64(keyPair.publicKey) };
}

/** Lets a refreshed tab keep its identity (sessionStorage only — never leaves the tab). */
export async function exportIdentity(id: Identity): Promise<StoredIdentity> {
  return {
    privateJwk: await subtle().exportKey("jwk", id.keyPair.privateKey),
    publicJwk: await subtle().exportKey("jwk", id.keyPair.publicKey),
  };
}

export async function importIdentity(stored: StoredIdentity): Promise<Identity> {
  const privateKey = await subtle().importKey("jwk", stored.privateJwk, ECDH, true, ["deriveKey"]);
  const publicKey = await subtle().importKey("jwk", stored.publicJwk, ECDH, true, []);
  return { keyPair: { privateKey, publicKey }, publicKey: await publicKeyB64(publicKey) };
}

export async function deriveSharedKey(own: Identity, peerPublicKey: string): Promise<CryptoKey> {
  const peer = await subtle().importKey("raw", fromBase64(peerPublicKey), ECDH, false, []);
  return subtle().deriveKey({ name: "ECDH", public: peer }, own.keyPair.privateKey, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function seal(key: CryptoKey, data: unknown): Promise<Sealed> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(data));
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv }, key, plain));
  return { iv: toBase64(iv), ct: toBase64(ct) };
}

/** Throws if the message was not sealed with this key (wrong sender, or tampered). */
export async function open<T>(key: CryptoKey, sealed: Sealed): Promise<T> {
  const plain = await subtle().decrypt({ name: "AES-GCM", iv: fromBase64(sealed.iv) }, key, fromBase64(sealed.ct));
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

export const isSealed = (x: unknown): x is Sealed =>
  !!x && typeof x === "object" && typeof (x as Sealed).iv === "string" && typeof (x as Sealed).ct === "string";
