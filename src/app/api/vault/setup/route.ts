import { count } from "drizzle-orm";
import { db } from "@/db";
import { credentials } from "@/db/schema";
import {
  MAX_MASTER_PASSWORD_LENGTH,
  MIN_MASTER_PASSWORD_LENGTH,
} from "@/config/constants";
import {
  initializeVault,
  isMasterPasswordValid,
  isVaultInitialized,
} from "@/lib/vaultKey";

async function readJsonBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return null;
    }
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function countCredentials(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(credentials);
  return row?.value ?? 0;
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body) {
    return Response.json(
      { error: "Request body must be a valid JSON object" },
      { status: 400 },
    );
  }

  const { masterPassword, resetExisting } = body;
  if (!isMasterPasswordValid(masterPassword)) {
    return Response.json(
      {
        error: `Master password must be ${MIN_MASTER_PASSWORD_LENGTH}–${MAX_MASTER_PASSWORD_LENGTH} characters`,
      },
      { status: 400 },
    );
  }

  let keyClaimed = false;

  try {
    if (isVaultInitialized()) {
      return Response.json(
        { error: "Vault is already initialized" },
        { status: 409 },
      );
    }

    const credentialCount = await countCredentials();
    if (credentialCount > 0 && resetExisting !== true) {
      return Response.json(
        {
          error: "Existing credentials must be erased",
          credentialCount,
        },
        { status: 409 },
      );
    }

    initializeVault(masterPassword);
    keyClaimed = true;

    if (resetExisting === true) {
      await db.delete(credentials);
    }

    return Response.json(
      { initialized: true, credentialCount: 0 },
      { status: 201 },
    );
  } catch (error) {
    const message = (error as Error).message;
    if (message === "Vault is already initialized") {
      return Response.json(
        { error: "Vault is already initialized" },
        { status: 409 },
      );
    }
    if (message === "Vault key file is unreadable") {
      return Response.json(
        { error: "Vault key file is unreadable" },
        { status: 500 },
      );
    }
    if (keyClaimed) {
      return Response.json(
        {
          error:
            "Vault key was created, but existing credentials could not be erased",
        },
        { status: 500 },
      );
    }
    return Response.json(
      { error: "Failed to initialize the vault" },
      { status: 500 },
    );
  }
}
