import { randomBytes } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import {
  MAX_MASTER_PASSWORD_LENGTH,
  MIN_MASTER_PASSWORD_LENGTH,
} from "@/config/constants";
import { deriveVaultKey } from "./crypto";

const DEFAULT_KEY_PATH = ".cipherus/vault.key";
const KEY_FILE_VERSION = 1;
const SALT_LENGTH = 16;
const HEX_SALT = /^[0-9a-f]{32}$/i;
const HEX_KEY = /^[0-9a-f]{64}$/i;

export function isMasterPasswordValid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= MIN_MASTER_PASSWORD_LENGTH &&
    value.length <= MAX_MASTER_PASSWORD_LENGTH
  );
}

export function getVaultKeyPath(): string {
  const configured = process.env.CIPHERUS_KEY_FILE;
  if (configured !== undefined && configured.trim() !== "") {
    return isAbsolute(configured)
      ? configured
      : resolve(process.cwd(), configured);
  }
  return resolve(process.cwd(), DEFAULT_KEY_PATH);
}

export function readVaultKey(): Buffer | null {
  let raw: string;
  try {
    raw = readFileSync(getVaultKeyPath(), "utf8");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw new Error("Vault key file is unreadable");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Vault key file is unreadable");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new Error("Vault key file is unreadable");
  }

  const record = parsed as {
    version?: unknown;
    kdf?: unknown;
    salt?: unknown;
    key?: unknown;
  };

  if (
    record.version !== KEY_FILE_VERSION ||
    record.kdf !== "scrypt" ||
    typeof record.salt !== "string" ||
    !HEX_SALT.test(record.salt) ||
    typeof record.key !== "string" ||
    !HEX_KEY.test(record.key)
  ) {
    throw new Error("Vault key file is unreadable");
  }

  return Buffer.from(record.key, "hex");
}

export function isVaultInitialized(): boolean {
  return readVaultKey() !== null;
}

export function requireVaultKey(): Buffer {
  const key = readVaultKey();
  if (key === null) {
    throw new Error("Vault is not initialized");
  }
  return key;
}

export function accessVaultKey():
  | { ok: true; key: Buffer }
  | { ok: false; response: Response } {
  try {
    return { ok: true, key: requireVaultKey() };
  } catch (error) {
    if ((error as Error).message === "Vault is not initialized") {
      return {
        ok: false,
        response: Response.json(
          { error: "Vault is not initialized" },
          { status: 409 },
        ),
      };
    }
    if ((error as Error).message === "Vault key file is unreadable") {
      return {
        ok: false,
        response: Response.json(
          { error: "Vault key file is unreadable" },
          { status: 500 },
        ),
      };
    }
    throw error;
  }
}

export function initializeVault(masterPassword: string): void {
  if (!isMasterPasswordValid(masterPassword)) {
    throw new Error(
      `Master password must be ${MIN_MASTER_PASSWORD_LENGTH}–${MAX_MASTER_PASSWORD_LENGTH} characters`,
    );
  }

  const keyPath = getVaultKeyPath();
  const saltHex = randomBytes(SALT_LENGTH).toString("hex");
  const key = deriveVaultKey(masterPassword, saltHex);

  const record = {
    version: KEY_FILE_VERSION,
    kdf: "scrypt",
    salt: saltHex,
    key: key.toString("hex"),
    createdAt: new Date().toISOString(),
  };

  try {
    mkdirSync(dirname(keyPath), { recursive: true, mode: 0o700 });
  } catch {
    throw new Error("Vault key directory could not be created");
  }

  try {
    writeFileSync(keyPath, `${JSON.stringify(record, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("Vault is already initialized");
    }
    throw new Error("Vault key file could not be written");
  }

  try {
    chmodSync(keyPath, 0o600);
  } catch {
    // best effort
  }
}
