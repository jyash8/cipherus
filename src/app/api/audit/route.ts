import { asc } from "drizzle-orm";
import { MIN_SAFE_ENTROPY_BITS } from "@/config/constants";
import { db } from "@/db";
import { credentials, type Credential } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { accessVaultKey } from "@/lib/vaultKey";
import { evaluateStrength } from "@/lib/passwordUtils";

const STALE_AFTER_DAYS = 90;
const STALE_AFTER_MS = STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;

const DECRYPT_ERROR = "Failed to decrypt vault records";

type AuditAction = "audit" | "export";

type AuditIssue = "weak" | "reused" | "duplicate" | "stale";

interface AuditFinding {
  id: number;
  siteName: string;
  username: string;
  category: string;
  score: number;
  label: string;
  entropyBits: number;
  issues: AuditIssue[];
}

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

function isAuditAction(value: unknown): value is AuditAction {
  return value === "audit" || value === "export";
}

function normalizedDuplicateKey(siteName: string, username: string): string {
  return JSON.stringify([
    siteName.trim().toLowerCase(),
    username.trim().toLowerCase(),
  ]);
}

function decryptRow(row: Credential, key: Buffer): string {
  return decryptSecret(
    {
      iv: row.iv,
      ciphertext: row.ciphertext,
      authTag: row.authTag,
    },
    key,
  );
}

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

function emptyAuditResponse(): Response {
  return jsonResponse({
    summary: {
      total: 0,
      weak: 0,
      reused: 0,
      duplicate: 0,
      stale: 0,
      averageEntropyBits: 0,
    },
    categories: {},
    findings: [],
  });
}

function emptyExportResponse(): Response {
  return jsonResponse({ count: 0, credentials: [] });
}

function exportVaultMetadata(rows: Credential[], key: Buffer): Response {
  for (const row of rows) {
    try {
      decryptRow(row, key);
    } catch {
      return jsonResponse({ error: DECRYPT_ERROR }, 500);
    }
  }

  const metadata = rows.map((row) => ({
    id: row.id,
    siteName: row.siteName,
    siteUrl: row.siteUrl,
    username: row.username,
    category: row.category,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));

  const date = new Date().toISOString().slice(0, 10);

  return jsonResponse(
    { count: metadata.length, credentials: metadata },
    200,
    {
      "Content-Disposition": `attachment; filename="cipherus-vault-metadata-${date}.json"`,
    },
  );
}

function runAudit(rows: Credential[], key: Buffer): Response {
  const plaintextByEntry = new Map<number, string>();
  const idsByPassword = new Map<string, number[]>();
  const duplicateGroups = new Map<string, number[]>();
  const categoryCounts = new Map<string, number>();

  try {
    for (const row of rows) {
      try {
        plaintextByEntry.set(row.id, decryptRow(row, key));
      } catch {
        return jsonResponse({ error: DECRYPT_ERROR }, 500);
      }
    }

    for (const [id, plaintext] of plaintextByEntry) {
      const group = idsByPassword.get(plaintext);
      if (group) {
        group.push(id);
      } else {
        idsByPassword.set(plaintext, [id]);
      }
    }

    for (const row of rows) {
      const duplicateKey = normalizedDuplicateKey(row.siteName, row.username);
      const group = duplicateGroups.get(duplicateKey);
      if (group) {
        group.push(row.id);
      } else {
        duplicateGroups.set(duplicateKey, [row.id]);
      }
      categoryCounts.set(
        row.category,
        (categoryCounts.get(row.category) ?? 0) + 1,
      );
    }

    const now = Date.now();
    const findings: AuditFinding[] = [];
    let totalEntropyBits = 0;
    let weakCount = 0;
    let reusedCount = 0;
    let duplicateCount = 0;
    let staleCount = 0;

    for (const row of rows) {
      const plaintext = plaintextByEntry.get(row.id);
      if (plaintext === undefined) {
        return jsonResponse({ error: DECRYPT_ERROR }, 500);
      }

      const strength = evaluateStrength(plaintext);
      const issues: AuditIssue[] = [];

      if (strength.entropyBits < MIN_SAFE_ENTROPY_BITS) {
        issues.push("weak");
        weakCount += 1;
      }
      if ((idsByPassword.get(plaintext)?.length ?? 0) > 1) {
        issues.push("reused");
        reusedCount += 1;
      }
      if (
        (duplicateGroups.get(
          normalizedDuplicateKey(row.siteName, row.username),
        )?.length ?? 0) > 1
      ) {
        issues.push("duplicate");
        duplicateCount += 1;
      }
      if (now - row.updatedAt.getTime() > STALE_AFTER_MS) {
        issues.push("stale");
        staleCount += 1;
      }

      totalEntropyBits += strength.entropyBits;
      findings.push({
        id: row.id,
        siteName: row.siteName,
        username: row.username,
        category: row.category,
        score: strength.score,
        label: strength.label,
        entropyBits: strength.entropyBits,
        issues,
      });
    }

    const categories = Object.fromEntries(
      Array.from(categoryCounts.entries()).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );

    return jsonResponse({
      summary: {
        total: rows.length,
        weak: weakCount,
        reused: reusedCount,
        duplicate: duplicateCount,
        stale: staleCount,
        averageEntropyBits:
          Math.round((totalEntropyBits / rows.length) * 10) / 10,
      },
      categories,
      findings,
    });
  } finally {
    plaintextByEntry.clear();
    idsByPassword.clear();
    duplicateGroups.clear();
    categoryCounts.clear();
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body) {
    return jsonResponse(
      { error: "Request body must be a valid JSON object" },
      400,
    );
  }

  const action = body.action ?? "audit";
  if (!isAuditAction(action)) {
    return jsonResponse(
      { error: 'action must be "audit" or "export"' },
      400,
    );
  }

  const vaultKey = accessVaultKey();
  if (!vaultKey.ok) return vaultKey.response;

  try {
    const rows = await db
      .select()
      .from(credentials)
      .orderBy(asc(credentials.id));

    if (rows.length === 0) {
      return action === "export" ? emptyExportResponse() : emptyAuditResponse();
    }

    return action === "export"
      ? exportVaultMetadata(rows, vaultKey.key)
      : runAudit(rows, vaultKey.key);
  } catch {
    return jsonResponse(
      {
        error:
          action === "export"
            ? "Failed to export vault metadata"
            : "Failed to run the security audit",
      },
      500,
    );
  }
}
