import { desc } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { credentials } from "@/db/schema";
import { encryptSecret } from "@/lib/crypto";
import { accessVaultKey } from "@/lib/vaultKey";

const credentialMetadata = {
  id: credentials.id,
  siteName: credentials.siteName,
  siteUrl: credentials.siteUrl,
  username: credentials.username,
  category: credentials.category,
  createdAt: credentials.createdAt,
  updatedAt: credentials.updatedAt,
};

async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function GET() {
  await connection();

  try {
    const entries = await db
      .select(credentialMetadata)
      .from(credentials)
      .orderBy(desc(credentials.updatedAt));

    return Response.json(
      entries,
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Failed to fetch vault entries" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body) {
    return Response.json(
      { error: "Request body must be a valid JSON object" },
      { status: 400 },
    );
  }

  const { siteName, siteUrl, username, category, password } = body;

  if (
    !isNonEmptyString(siteName) ||
    !isNonEmptyString(username) ||
    !isNonEmptyString(password)
  ) {
    return Response.json(
      { error: "siteName, username, and password are required" },
      { status: 400 },
    );
  }

  if (siteUrl !== undefined && siteUrl !== null && typeof siteUrl !== "string") {
    return Response.json({ error: "siteUrl must be a string" }, { status: 400 });
  }

  if (category !== undefined && category !== null && typeof category !== "string") {
    return Response.json({ error: "category must be a string" }, { status: 400 });
  }

  const vaultKey = accessVaultKey();
  if (!vaultKey.ok) return vaultKey.response;

  try {
    const encrypted = encryptSecret(password, vaultKey.key);

    const [created] = await db
      .insert(credentials)
      .values({
        siteName: siteName.trim(),
        siteUrl:
          typeof siteUrl === "string" && siteUrl.trim() !== "" ? siteUrl.trim() : null,
        username: username.trim(),
        category:
          typeof category === "string" && category.trim() !== ""
            ? category.trim()
            : "General",
        ...encrypted,
      })
      .returning(credentialMetadata);

    return Response.json(created, { status: 201 });
  } catch {
    return Response.json({ error: "Failed to create vault entry" }, { status: 500 });
  }
}
