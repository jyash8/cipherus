import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

export interface SecretPayload {
  iv: string;
  ciphertext: string;
  authTag: string;
}

const KEY_LENGTH = 32; // 256-bit key for AES-256-GCM
const IV_LENGTH = 12; // 12-byte GCM nonce, fresh per encryption

/** Derives the long-lived vault key from the master password and vault salt. */
export function deriveVaultKey(masterPassword: string, saltHex: string): Buffer {
  const salt = Buffer.from(saltHex, "hex");
  if (salt.length === 0) {
    throw new Error("Vault salt must be valid hex");
  }
  return scryptSync(masterPassword, salt, KEY_LENGTH);
}

export function encryptSecret(plainText: string, key: Buffer): SecretPayload {
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString("hex"),
    ciphertext: ciphertext.toString("hex"),
    authTag: authTag.toString("hex"),
  };
}

export function decryptSecret(payload: SecretPayload, key: Buffer): string {
  const iv = Buffer.from(payload.iv, "hex");
  const authTag = Buffer.from(payload.authTag, "hex");
  const ciphertext = Buffer.from(payload.ciphertext, "hex");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  try {
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    throw new Error("Vault entry could not be decrypted");
  }
}
