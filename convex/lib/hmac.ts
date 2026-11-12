const encoder = new TextEncoder();
const SCHEME = "v1=";
const MAX_SKEW_SECONDS = 300;
const SIGNATURE_BYTES = 32;

export const TIMESTAMP_HEADER = "X-LL-Timestamp";
export const SIGNATURE_HEADER = "X-LL-Signature";

type SignedRequest = {
  method: string;
  path: string;
  body: string;
};

function canonicalString(
  timestamp: string,
  { method, path, body }: SignedRequest,
): string {
  return `${timestamp}.${method.toUpperCase()}.${path}.${body}`;
}

function importKey(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[0-9a-f]+$/.test(hex) || hex.length !== SIGNATURE_BYTES * 2) {
    return null;
  }
  const bytes = new Uint8Array(SIGNATURE_BYTES);
  for (let i = 0; i < SIGNATURE_BYTES; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function signatureHeaders(
  secret: string,
  request: SignedRequest,
  nowMs: number,
): Promise<Record<string, string>> {
  const timestamp = Math.floor(nowMs / 1000).toString();
  const key = await importKey(secret, "sign");
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(canonicalString(timestamp, request)),
  );
  return {
    [TIMESTAMP_HEADER]: timestamp,
    [SIGNATURE_HEADER]: `${SCHEME}${toHex(new Uint8Array(mac))}`,
  };
}

/** crypto.subtle.verify compares in constant time. */
export async function isValidSignature(
  secret: string,
  timestamp: string | null,
  signature: string | null,
  request: SignedRequest,
  nowMs: number,
): Promise<boolean> {
  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > MAX_SKEW_SECONDS) {
    return false;
  }
  if (!signature.startsWith(SCHEME)) return false;
  const mac = fromHex(signature.slice(SCHEME.length));
  if (!mac) return false;
  const key = await importKey(secret, "verify");
  return crypto.subtle.verify(
    "HMAC",
    key,
    mac,
    encoder.encode(canonicalString(timestamp, request)),
  );
}
