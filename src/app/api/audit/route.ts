import { asc } from "drizzle-orm";
import { MIN_SAFE_ENTROPY_BITS } from "@/config/constants";
import { db } from "@/db";
import { credentials, type Credential } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { evaluateStrength } from "@/lib/passwordUtils";

const STALE_AFTER_DAYS = 90;
const STALE_AFTER_MS = STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;

/**
 * Both actions require the master password. The audit needs it to score each
 * stored password, and the metadata export decrypts every record first so plain
 * metadata cannot be pulled without proving knowledge of the password.
 *
 * A wrong password and a corrupted record intentionally share one response so
 * the endpoint cannot be used as an oracle.
 */
const INVALID_MASTER_PASSWORD_ERROR =
  "Invalid master password or corrupted vault records";

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

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return Response.json(body, {
    status,
    // The audit result depends on a secret supplied per request, so no response
    // may be stored by a browser, proxy, or CDN.
    headers: { "Cache-Control": "no-store", ...headers },
  });
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

function decryptRow(row: Credential, masterPassword: string): string {
  return decryptSecret(
    {
      salt: row.salt,
      iv: row.iv,
      ciphertext: row.ciphertext,
      authTag: row.authTag,
    },
    masterPassword,
  );
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
    message:
      "The vault is empty, so the master password cannot be verified. Add a credential first, then run the audit again.",
  });
}

function emptyExportResponse(): Response {
  return jsonResponse({
    count: 0,
    credentials: [],
    message:
      "The vault is empty, so the master password cannot be verified. Add a credential first, then export again.",
  });
}

/**
 * Verifies the master password against every record before returning any
 * metadata. Decrypted values are discarded immediately and never placed in the
 * response; only the non-secret metadata columns are mapped out.
 */
function exportVaultMetadata(
  rows: Credential[],
  masterPassword: string,
): Response {
  for (const row of rows) {
    try {
      decryptRow(row, masterPassword);
    } catch {
      return jsonResponse({ error: INVALID_MASTER_PASSWORD_ERROR }, 401);
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

/**
 * Decrypts each entry once, keeps the plaintext only for this request, and
 * reduces it to a sanitized finding. Every map is cleared in `finally`.
 */
function runAudit(rows: Credential[], masterPassword: string): Response {
  const plaintextByEntry = new Map<number, string>();
  const idsByPassword = new Map<string, number[]>();
  const duplicateGroups = new Map<string, number[]>();
  const categoryCounts = new Map<string, number>();

  try {
    // Any decryption failure is reported as the same safe 401: the response
    // must not reveal whether the password was wrong or a record was corrupt.
    for (const row of rows) {
      try {
        plaintextByEntry.set(row.id, decryptRow(row, masterPassword));
      } catch {
        return jsonResponse({ error: INVALID_MASTER_PASSWORD_ERROR }, 401);
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
      const key = normalizedDuplicateKey(row.siteName, row.username);
      const group = duplicateGroups.get(key);
      if (group) {
        group.push(row.id);
      } else {
        duplicateGroups.set(key, [row.id]);
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
        // Unreachable: every row was decrypted above. Fail closed rather than
        // exposing a partial audit.
        return jsonResponse({ error: INVALID_MASTER_PASSWORD_ERROR }, 401);
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
    // Plaintext exists only for the lifetime of this request. JavaScript strings
    // cannot be wiped in place, but all references are dropped here.
    plaintextByEntry.clear();
    idsByPassword.clear();
    duplicateGroups.clear();
    categoryCounts.clear();
  }
}

/**
 * Single POST endpoint. The action defaults to "audit"; pass
 * `{ "action": "export", "masterPassword": "..." }` for verified metadata.
 *
 * Export is POST-only on purpose: requiring the password in a JSON body keeps it
 * out of URLs, logs, and browser history, and a GET cannot trigger a download
 * without proving knowledge of the password.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body) {
    return jsonResponse(
      { error: "Request body must be a valid JSON object" },
      400,
    );
  }

  // Only trim for validation; the original value is passed to decryptSecret so
  // passwords containing meaningful leading/trailing spaces still work.
  const masterPassword = body.masterPassword;
  if (
    typeof masterPassword !== "string" ||
    masterPassword.trim().length === 0
  ) {
    return jsonResponse(
      { error: "masterPassword must be a non-empty string" },
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

  try {
    const rows = await db
      .select()
      .from(credentials)
      .orderBy(asc(credentials.id));

    // No records means no ciphertext to verify the password against, so both
    // actions fail open to an explanatory message instead of a misleading 401.
    if (rows.length === 0) {
      return action === "export"
        ? emptyExportResponse()
        : emptyAuditResponse();
    }

    return action === "export"
      ? exportVaultMetadata(rows, masterPassword)
      : runAudit(rows, masterPassword);
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
