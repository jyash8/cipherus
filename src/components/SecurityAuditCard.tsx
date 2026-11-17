"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Download,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { MIN_SAFE_ENTROPY_BITS } from "@/config/constants";

const AUDIT_FALLBACK_ERROR =
  "Could not run the security audit. Please try again.";

const EXPORT_FALLBACK_ERROR =
  "Could not export vault metadata. Please try again.";

type AuditAction = "audit" | "export";
type AuditIssue = "weak" | "reused" | "duplicate" | "stale";

interface AuditSummary {
  total: number;
  weak: number;
  reused: number;
  duplicate: number;
  stale: number;
  averageEntropyBits: number;
}

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

interface AuditResult {
  summary: AuditSummary;
  categories: Record<string, number>;
  findings: AuditFinding[];
}

interface ExportPayload {
  count: number;
  credentials: unknown[];
}

type Notice = { kind: "error" | "success" | "info"; message: string } | null;

const ISSUE_LABELS: Record<AuditIssue, string> = {
  weak: "Weak password",
  reused: "Reused password",
  duplicate: "Duplicate site + username",
  stale: "Not updated in 90+ days",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractServerError(data: unknown): string | null {
  if (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof (data as { error?: unknown }).error === "string"
  ) {
    return (data as { error: string }).error;
  }
  return null;
}

function readMessage(data: unknown): string | null {
  if (isRecord(data) && typeof data.message === "string") {
    return data.message.trim() === "" ? null : data.message;
  }
  return null;
}

function isAuditFinding(value: unknown): value is AuditFinding {
  return (
    isRecord(value) &&
    typeof value.id === "number" &&
    typeof value.siteName === "string" &&
    typeof value.username === "string" &&
    typeof value.category === "string" &&
    typeof value.score === "number" &&
    typeof value.label === "string" &&
    typeof value.entropyBits === "number" &&
    Array.isArray(value.issues) &&
    value.issues.every(
      (issue) =>
        issue === "weak" ||
        issue === "reused" ||
        issue === "duplicate" ||
        issue === "stale",
    )
  );
}

function isAuditResult(data: unknown): data is AuditResult {
  if (
    !isRecord(data) ||
    !isRecord(data.summary) ||
    !isRecord(data.categories) ||
    !Array.isArray(data.findings)
  ) {
    return false;
  }

  const summary = data.summary;
  const summaryKeys = [
    "total",
    "weak",
    "reused",
    "duplicate",
    "stale",
    "averageEntropyBits",
  ] as const;

  return (
    summaryKeys.every((key) => typeof summary[key] === "number") &&
    data.findings.every(isAuditFinding)
  );
}

function isExportPayload(data: unknown): data is ExportPayload {
  return (
    isRecord(data) &&
    typeof data.count === "number" &&
    Array.isArray(data.credentials)
  );
}

function exportFilename(disposition: string | null): string {
  const match = disposition?.match(/filename="([^"]+)"/);
  const candidate = match?.[1]?.replace(/[^A-Za-z0-9._-]/g, "") ?? "";

  return (
    candidate ||
    `cipherus-vault-metadata-${new Date().toISOString().slice(0, 10)}.json`
  );
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Defer revocation so the browser can start the download first.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function noticeClass(kind: NonNullable<Notice>["kind"]): string {
  switch (kind) {
    case "success":
      return "notice success";
    case "info":
      return "notice info";
    default:
      return "notice error";
  }
}

function statColor(tone: "neutral" | "danger" | "warning" | "good"): string {
  switch (tone) {
    case "danger":
      return "var(--error)";
    case "warning":
      return "var(--warning)";
    case "good":
      return "var(--success)";
    default:
      return "var(--on-surface)";
  }
}

export interface SecurityAuditCardProps {
  active: boolean;
  onNotify: (message: string) => void;
}

export default function SecurityAuditCard({
  active,
  onNotify,
}: SecurityAuditCardProps) {
  const [pending, setPending] = useState<AuditAction | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const autoRan = useRef(false);

  const runAudit = useCallback(async () => {
    setPending("audit");
    setNotice(null);

    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ action: "audit" }),
      });
      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setAudit(null);
        setNotice({
          kind: "error",
          message: extractServerError(data) ?? AUDIT_FALLBACK_ERROR,
        });
        return;
      }

      const message = readMessage(data);
      if (message !== null) {
        setAudit(null);
        setNotice({ kind: "info", message });
        return;
      }

      if (!isAuditResult(data)) {
        setAudit(null);
        setNotice({
          kind: "error",
          message: "The audit API returned an unexpected response.",
        });
        return;
      }

      setAudit(data);
      setNotice(null);
    } catch {
      setAudit(null);
      setNotice({
        kind: "error",
        message: "Network error — could not reach the audit API.",
      });
    } finally {
      setPending(null);
    }
  }, []);

  useEffect(() => {
    if (!active || autoRan.current) return;

    autoRan.current = true;
    // Auto-run intentionally updates the panel when the audit tab opens. This
    // effect runs once per mount, so the render cascade it causes is bounded.
    void runAudit();
  }, [active, runAudit]);

  async function runExport() {
    setPending("export");
    setNotice(null);

    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ action: "export" }),
      });

      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        setNotice({
          kind: "error",
          message: extractServerError(data) ?? EXPORT_FALLBACK_ERROR,
        });
        return;
      }

      // Read the response as a Blob so the exact metadata body can be saved.
      const blob = await response.blob();
      const text = await blob.text();

      let data: unknown = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }

      const message = readMessage(data);
      if (message !== null) {
        setNotice({ kind: "info", message });
        return;
      }

      if (!isExportPayload(data)) {
        setNotice({
          kind: "error",
          message: "The export API returned an unexpected response.",
        });
        return;
      }

      if (data.credentials.length === 0) {
        setNotice({
          kind: "info",
          message: "The vault is empty, so there is no metadata to export.",
        });
        return;
      }

      downloadBlob(
        blob,
        exportFilename(response.headers.get("Content-Disposition")),
      );
      setNotice({
        kind: "success",
        message: `Exported ${data.credentials.length} metadata ${
          data.credentials.length === 1 ? "record" : "records"
        }.`,
      });
      onNotify(`Exported ${data.credentials.length} metadata records.`);
    } catch {
      setNotice({
        kind: "error",
        message: "Network error — could not reach the audit API.",
      });
    } finally {
      setPending(null);
    }
  }

  const stats =
    audit === null
      ? []
      : [
          {
            label: "Credentials",
            value: audit.summary.total,
            tone: "neutral" as const,
          },
          {
            label: "Weak",
            value: audit.summary.weak,
            tone: audit.summary.weak > 0 ? ("danger" as const) : ("neutral" as const),
          },
          {
            label: "Reused",
            value: audit.summary.reused,
            tone:
              audit.summary.reused > 0 ? ("danger" as const) : ("neutral" as const),
          },
          {
            label: "Duplicate",
            value: audit.summary.duplicate,
            tone:
              audit.summary.duplicate > 0
                ? ("warning" as const)
                : ("neutral" as const),
          },
          {
            label: "Stale",
            value: audit.summary.stale,
            tone:
              audit.summary.stale > 0
                ? ("warning" as const)
                : ("neutral" as const),
          },
          {
            label: "Avg entropy (bits)",
            value: audit.summary.averageEntropyBits,
            tone:
              audit.summary.averageEntropyBits >= MIN_SAFE_ENTROPY_BITS
                ? ("good" as const)
                : ("warning" as const),
          },
        ];

  return (
    <div className="panel audit-panel">
      <div className="audit-head">
        <div className="audit-head-text">
          <h2>
            <span className="tile-icon" aria-hidden="true">
              <ShieldCheck width={22} height={22} />
            </span>
            Security Audit
          </h2>
          <p>
            Analyzes the local vault for weak, reused, duplicate, and stale
            credentials.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="m-btn tonal"
            onClick={() => void runAudit()}
            disabled={pending !== null}
            aria-busy={pending === "audit"}
          >
            {pending === "audit" ? (
              <LoaderCircle
                width={18}
                height={18}
                className="spinner"
                aria-hidden="true"
              />
            ) : (
              <RefreshCw width={18} height={18} aria-hidden="true" />
            )}
            {pending === "audit" ? "Auditing…" : "Re-run audit"}
          </button>

          <button
            type="button"
            className="m-btn tonal"
            onClick={() => void runExport()}
            disabled={pending !== null}
            aria-busy={pending === "export"}
          >
            {pending === "export" ? (
              <LoaderCircle
                width={18}
                height={18}
                className="spinner"
                aria-hidden="true"
              />
            ) : (
              <Download width={18} height={18} aria-hidden="true" />
            )}
            {pending === "export" ? "Exporting…" : "Export metadata"}
          </button>
        </div>
      </div>

      {notice !== null && (
        <p
          role={notice.kind === "error" ? "alert" : "status"}
          aria-live={notice.kind === "error" ? undefined : "polite"}
          className={noticeClass(notice.kind)}
        >
          {notice.message}
        </p>
      )}

      <div className="audit-results">
        {audit === null ? (
          <div className="audit-empty">
            {pending === "audit"
              ? "Auditing the vault…"
              : "Run the audit to see findings."}
          </div>
        ) : (
          <>
            <div className="summary-grid">
              {stats.map((stat) => (
                <div key={stat.label} className="summary-item">
                  <div
                    className="n"
                    style={{ color: statColor(stat.tone) }}
                  >
                    {stat.value}
                  </div>
                  <div className="l">{stat.label}</div>
                </div>
              ))}
            </div>

            {Object.keys(audit.categories).length > 0 && (
              <div>
                <h3 className="section-label">Categories</h3>
                <div className="badges">
                  {Object.entries(audit.categories).map(([category, count]) => (
                    <span key={category} className="badge">
                      {category} · {count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="section-label">Findings</h3>
              {audit.findings.length === 0 ? (
                <p className="muted">No stored credentials to report.</p>
              ) : (
                <div className="findings">
                  {audit.findings.map((finding) => (
                    <div key={finding.id} className="finding">
                      <div className="head">
                        <span className="title">{finding.siteName}</span>
                        <span className="muted">
                          {finding.label} · {finding.entropyBits} bits
                        </span>
                      </div>
                      <div className="muted">
                        {finding.username} · {finding.category}
                      </div>
                      <div className="badges">
                        {finding.issues.length > 0 ? (
                          finding.issues.map((issue) => (
                            <span
                              key={issue}
                              className={`badge ${issue}`}
                              title={ISSUE_LABELS[issue]}
                            >
                              {issue.toUpperCase()}
                            </span>
                          ))
                        ) : (
                          <span className="badge ok">OK</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="muted">
              Issue counts are per credential entry. The export contains vault
              metadata only — never passwords, salts, IVs, or ciphertext.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
