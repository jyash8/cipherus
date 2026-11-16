export interface EncryptedPayload {
  salt: string;
  iv: string;
  ciphertext: string;
  authTag: string;
}

export function encryptSecret(plainText: string, masterPassword: string): EncryptedPayload {
  // TODO (Member 1): Implement scrypt key derivation + AES-256-GCM encryption
  throw new Error("encryptSecret not implemented yet");
}

export function decryptSecret(payload: EncryptedPayload, masterPassword: string): string {
  // TODO (Member 1): Implement scrypt key derivation + AES-256-GCM decryption
  throw new Error("decryptSecret not implemented yet");
}
