import { eq } from "drizzle-orm";
import { db } from "@/db";
import { credentials } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { accessVaultKey } from "@/lib/vaultKey";

type RouteContext = { params: Promise<{ id: string }> };

const credentialMetadata = {
  id: credentials.id,
  siteName: credentials.siteName,
  siteUrl: credentials.siteUrl,
  username: credentials.username,
  category: credentials.category,
  createdAt: credentials.createdAt,
  updatedAt: credentials.updatedAt,
};

type CredentialUpdate = Partial<
  Omit<typeof credentials.$inferInsert, "id" | "createdAt">
>;

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

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function POST(_request: Request, { params }: RouteContext) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (id === null) {
    return Response.json({ error: "Invalid credential id" }, { status: 400 });
  }

  const vaultKey = accessVaultKey();
  if (!vaultKey.ok) return vaultKey.response;

  let row: typeof credentials.$inferSelect | undefined;
  try {
    [row] = await db
      .select()
      .from(credentials)
      .where(eq(credentials.id, id))
      .limit(1);
  } catch {
    return Response.json({ error: "Failed to reveal vault entry" }, { status: 500 });
  }

  if (!row) {
    return Response.json({ error: "Credential not found" }, { status: 404 });
  }

  try {
    const password = decryptSecret(row, vaultKey.key);
    return Response.json({ password });
  } catch {
    return Response.json(
      { error: "Failed to decrypt vault entry" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (id === null) {
    return Response.json({ error: "Invalid credential id" }, { status: 400 });
  }

  const body = await readJsonBody(request);
  if (!body) {
    return Response.json(
      { error: "Request body must be a valid JSON object" },
      { status: 400 },
    );
  }

  const vaultKey = accessVaultKey();
  if (!vaultKey.ok) return vaultKey.response;

  const { siteName, siteUrl, username, category, password } = body;
  const updates: CredentialUpdate = {};

  if (siteName !== undefined) {
    if (!isNonEmptyString(siteName)) {
      return Response.json({ error: "siteName must be a non-empty string" }, { status: 400 });
    }
    updates.siteName = siteName.trim();
  }

  if (siteUrl !== undefined) {
    if (siteUrl !== null && typeof siteUrl !== "string") {
      return Response.json({ error: "siteUrl must be a string or null" }, { status: 400 });
    }
    updates.siteUrl =
      typeof siteUrl === "string" && siteUrl.trim() !== "" ? siteUrl.trim() : null;
  }

  if (username !== undefined) {
    if (!isNonEmptyString(username)) {
      return Response.json({ error: "username must be a non-empty string" }, { status: 400 });
    }
    updates.username = username.trim();
  }

  if (category !== undefined) {
    if (!isNonEmptyString(category)) {
      return Response.json({ error: "category must be a non-empty string" }, { status: 400 });
    }
    updates.category = category.trim();
  }

  if (password !== undefined) {
    if (!isNonEmptyString(password)) {
      return Response.json({ error: "password must be a non-empty string" }, { status: 400 });
    }
    Object.assign(updates, encryptSecret(password, vaultKey.key));
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  updates.updatedAt = new Date();

  try {
    const [updated] = await db
      .update(credentials)
      .set(updates)
      .where(eq(credentials.id, id))
      .returning(credentialMetadata);

    if (!updated) {
      return Response.json({ error: "Credential not found" }, { status: 404 });
    }

    return Response.json(updated);
  } catch {
    return Response.json({ error: "Failed to update vault entry" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (id === null) {
    return Response.json({ error: "Invalid credential id" }, { status: 400 });
  }

  const vaultKey = accessVaultKey();
  if (!vaultKey.ok) return vaultKey.response;

  try {
    const result = await db.delete(credentials).where(eq(credentials.id, id));

    if (result.changes === 0) {
      return Response.json({ error: "Credential not found" }, { status: 404 });
    }

    return Response.json({ deleted: true });
  } catch {
    return Response.json({ error: "Failed to delete vault entry" }, { status: 500 });
  }
}
