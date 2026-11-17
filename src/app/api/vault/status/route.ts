import { count } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { credentials } from "@/db/schema";
import { isVaultInitialized } from "@/lib/vaultKey";

async function countCredentials(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(credentials);
  return row?.value ?? 0;
}

export async function GET() {
  await connection();

  try {
    const initialized = isVaultInitialized();
    const credentialCount = await countCredentials();

    return Response.json(
      { initialized, credentialCount },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if ((error as Error).message === "Vault key file is unreadable") {
      return Response.json(
        { error: "Vault key file is unreadable" },
        { status: 500 },
      );
    }
    return Response.json(
      { error: "Failed to read vault status" },
      { status: 500 },
    );
  }
}
