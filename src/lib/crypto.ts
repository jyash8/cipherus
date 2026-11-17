import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

export interface EncryptedPayload {
  salt: string;
  iv: string;
  ciphertext: string;
  authTag: string;
}

const KEY_LENGTH = 32; // 256-bit key for AES-256-GCM
const SALT_LENGTH = 16; // 16-byte random salt
const IV_LENGTH = 12; // 12-byte GCM nonce, fresh per encryption

export function encryptSecret(plainText: string, masterPassword: string): EncryptedPayload {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = scryptSync(masterPassword, salt, KEY_LENGTH);

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    ciphertext: ciphertext.toString("hex"),
    authTag: authTag.toString("hex"),
  };
}

export function decryptSecret(payload: EncryptedPayload, masterPassword: string): string {
  const salt = Buffer.from(payload.salt, "hex");
  const iv = Buffer.from(payload.iv, "hex");
  const authTag = Buffer.from(payload.authTag, "hex");
  const ciphertext = Buffer.from(payload.ciphertext, "hex");
  const key = scryptSync(masterPassword, salt, KEY_LENGTH);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  try {
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    throw new Error("Invalid master password or corrupted vault entry");
  }
}
