import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { env } from "@job-checker/observability/env";

const VERSION = 1;

function key(): Buffer {
  const configured = env().MASTER_KEY;
  try {
    const decoded = Buffer.from(configured, "base64");
    if (decoded.length === 32) return decoded;
  } catch {
    // fall through to derivation
  }
  return scryptSync(configured, "job-checker-master-key", 32);
}

export function sha256Hex(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function encryptBuffer(plaintext: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION]), iv, tag, ciphertext]);
}

export function decryptBuffer(payload: Buffer): Buffer {
  if (payload.length < 1 + 12 + 16 + 1) throw new Error("Invalid ciphertext");
  const version = payload[0];
  if (version !== VERSION) throw new Error("Unsupported ciphertext version");
  const iv = payload.subarray(1, 13);
  const tag = payload.subarray(13, 29);
  const ciphertext = payload.subarray(29);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function encryptString(value: string): Buffer {
  return encryptBuffer(Buffer.from(value, "utf8"));
}

export function decryptString(value: Buffer | null): string | null {
  if (!value) return null;
  try {
    return decryptBuffer(value).toString("utf8");
  } catch {
    return null;
  }
}
