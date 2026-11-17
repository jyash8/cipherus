"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  CircleCheck,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { MIN_SAFE_ENTROPY_BITS } from "@/config/constants";

const inputClass =
  "w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

const primaryButtonClass =
  "inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButtonClass =
  "inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50";

const WRONG_PASSWORD_MESSAGE =
  "Incorrect master password, or a vault record could not be decrypted.";

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
type StatTone = "neutral" | "danger" | "warning" | "good";

interface Stat {
  label: string;
  value: string | number;
  tone: StatTone;
}

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
  if (isRecord(data) && typeof data.error === "string") {
    return data.error;
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

function scoreClass(score: number): string {
  if (score <= 1) {
    return "border-rose-500/40 bg-rose-500/10 text-rose-300";
  }
  if (score === 2) {
    return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  }
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
}

function issueClass(issue: AuditIssue): string {
  switch (issue) {
    case "weak":
    case "reused":
      return "border-rose-500/30 bg-rose-500/10 text-rose-300";
    case "duplicate":
      return "border-amber-500/30 bg-amber-500/10 text-amber-300";
    case "stale":
      return "border-slate-600 bg-slate-800/60 text-slate-300";
  }
}

function toneClass(tone: StatTone): string {
  switch (tone) {
    case "danger":
      return "text-rose-300";
    case "warning":
      return "text-amber-300";
    case "good":
      return "text-emerald-300";
    default:
      return "text-slate-100";
  }
}

function noticeClass(kind: NonNullable<Notice>["kind"]): string {
  switch (kind) {
    case "success":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    case "info":
      return "border-sky-500/30 bg-sky-500/10 text-sky-300";
    default:
      return "border-rose-500/30 bg-rose-500/10 text-rose-300";
  }
}

function buildStats(summary: AuditSummary): Stat[] {
  return [
    { label: "Credentials", value: summary.total, tone: "neutral" },
    {
      label: "Weak",
      value: summary.weak,
      tone: summary.weak > 0 ? "danger" : "neutral",
    },
    {
      label: "Reused",
      value: summary.reused,
      tone: summary.reused > 0 ? "danger" : "neutral",
    },
    {
      label: "Duplicate",
      value: summary.duplicate,
      tone: summary.duplicate > 0 ? "warning" : "neutral",
    },
    {
      label: "Stale > 90d",
      value: summary.stale,
      tone: summary.stale > 0 ? "warning" : "neutral",
    },
    {
      label: "Avg. entropy",
      value: `${summary.averageEntropyBits} bits`,
      tone:
        summary.averageEntropyBits >= MIN_SAFE_ENTROPY_BITS
          ? "good"
          : "warning",
    },
  ];
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

export default function SecurityAuditCard() {
  const [masterPassword, setMasterPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [pending, setPending] = useState<AuditAction | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      // The passphrase lives only in this component's React state and is never
      // written to storage. Drop the reference when the card unmounts.
      setMasterPassword("");
    };
  }, []);

  function handlePasswordChange(value: string): void {
    setMasterPassword(value);
    setPasswordError(null);
  }

  function requirePassword(): string | null {
    if (masterPassword.trim() === "") {
      setPasswordError(
        "Enter your master password before running an audit or exporting metadata.",
      );
      passwordInputRef.current?.focus();
      return null;
    }
    return masterPassword;
  }

  async function runAudit(): Promise<void> {
    const password = requirePassword();
    if (password === null) {
      return;
    }

    setPending("audit");
    setNotice(null);

    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ action: "audit", masterPassword: password }),
      });
      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setAudit(null);
        setNotice({
          kind: "error",
          message:
            response.status === 401
              ? WRONG_PASSWORD_MESSAGE
              : (extractServerError(data) ?? AUDIT_FALLBACK_ERROR),
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
      setNotice({
        kind: "success",
        message: `Audited ${data.summary.total} ${
          data.summary.total === 1 ? "credential" : "credentials"
        }.`,
      });
    } catch {
      setAudit(null);
      setNotice({
        kind: "error",
        message: "Network error — could not reach the audit API.",
      });
    } finally {
      setPending(null);
    }
  }

  async function runExport(): Promise<void> {
    const password = requirePassword();
    if (password === null) {
      return;
    }

    setPending("export");
    setNotice(null);

    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ action: "export", masterPassword: password }),
      });

      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        setNotice({
          kind: "error",
          message:
            response.status === 401
              ? WRONG_PASSWORD_MESSAGE
              : (extractServerError(data) ?? EXPORT_FALLBACK_ERROR),
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
        // Empty vault: the password cannot be verified, so nothing is exported.
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

      downloadBlob(blob, exportFilename(response.headers.get("Content-Disposition")));
      setNotice({
        kind: "success",
        message: `Exported ${data.credentials.length} metadata ${
          data.credentials.length === 1 ? "record" : "records"
        }.`,
      });
    } catch {
      setNotice({
        kind: "error",
        message: "Network error — could not reach the audit API.",
      });
    } finally {
      setPending(null);
    }
  }

  function handleAuditSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void runAudit();
  }

  const stats = audit ? buildStats(audit.summary) : [];
  const categoryEntries = audit ? Object.entries(audit.categories) : [];

  return (
    <section
      aria-labelledby="security-audit-heading"
      className="w-full min-w-0 max-w-full space-y-5 rounded-xl border border-slate-800 bg-slate-900/50 p-4 md:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="security-audit-heading"
          className="flex items-center gap-2 font-semibold text-slate-200"
        >
          <ShieldCheck className="size-4 text-sky-400" aria-hidden="true" />
          Security Audit
        </h2>
        <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-400">
          Vault-wide
        </span>
      </div>

      <form noValidate onSubmit={handleAuditSubmit} className="space-y-4">
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-sky-400" aria-hidden="true" />
            <label
              htmlFor="audit-master-password"
              className="text-xs font-semibold uppercase tracking-wide text-slate-400"
            >
              Master Password
            </label>
          </div>

          <div className="relative mt-2">
            <Lock
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"
              aria-hidden="true"
            />
            <input
              id="audit-master-password"
              ref={passwordInputRef}
              type={showPassword ? "text" : "password"}
              value={masterPassword}
              onChange={(event) => handlePasswordChange(event.target.value)}
              placeholder="Enter your vault passphrase"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={passwordError !== null}
              aria-describedby={
                passwordError === null
                  ? "audit-master-password-help"
                  : "audit-master-password-help audit-master-password-error"
              }
              className={`${inputClass} pl-9 pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={
                showPassword ? "Hide master password" : "Show master password"
              }
              aria-pressed={showPassword}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition hover:text-slate-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-500"
            >
              {showPassword ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>

          <p
            id="audit-master-password-help"
            className="mt-2 text-xs text-slate-500"
          >
            Held in memory for this tab only — never stored in the browser.
          </p>
          {passwordError !== null && (
            <p
              id="audit-master-password-error"
              className="mt-1 text-xs text-rose-400"
            >
              {passwordError}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2">
          <button
            type="submit"
            disabled={pending !== null}
            aria-busy={pending === "audit"}
            className={primaryButtonClass}
          >
            {pending === "audit" ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ShieldCheck className="size-4" aria-hidden="true" />
            )}
            {pending === "audit" ? "Auditing…" : "Run security audit"}
          </button>
          <button
            type="button"
            onClick={() => void runExport()}
            disabled={pending !== null}
            aria-busy={pending === "export"}
            className={secondaryButtonClass}
          >
            {pending === "export" ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="size-4" aria-hidden="true" />
            )}
            {pending === "export" ? "Exporting…" : "Export metadata"}
          </button>
        </div>
      </form>

      {notice !== null && (
        <p
          role={notice.kind === "error" ? "alert" : "status"}
          aria-live={notice.kind === "error" ? undefined : "polite"}
          className={`break-words rounded-lg border px-3 py-2 text-xs ${noticeClass(
            notice.kind,
          )}`}
        >
          {notice.message}
        </p>
      )}

      {audit !== null && (
        <div aria-labelledby="audit-results-heading" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3
              id="audit-results-heading"
              className="text-sm font-semibold text-slate-200"
            >
              Audit results
            </h3>
            <span className="text-xs text-slate-500">
              {audit.summary.total}{" "}
              {audit.summary.total === 1 ? "entry" : "entries"}
            </span>
          </div>

          <ul className="grid grid-cols-2 gap-2">
            {stats.map((stat) => (
              <li
                key={stat.label}
                className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
              >
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  {stat.label}
                </p>
                <p
                  className={`mt-0.5 text-lg font-semibold ${toneClass(
                    stat.tone,
                  )}`}
                >
                  {stat.value}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-slate-500">
            Issue counts are per credential entry.
          </p>

          {categoryEntries.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-slate-400">Categories</h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {categoryEntries.map(([category, count]) => (
                  <li
                    key={category}
                    className="rounded-full border border-slate-700 bg-slate-950/60 px-2 py-0.5 text-xs text-slate-300"
                  >
                    <span className="break-words">{category}</span>
                    <span className="ml-1 font-mono text-slate-400">
                      {count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h3 className="text-xs font-medium text-slate-400">Findings</h3>
            {audit.findings.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">
                No stored credentials to report.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {audit.findings.map((finding) => (
                  <li
                    key={finding.id}
                    className="rounded-lg border border-slate-800 bg-slate-950/40 p-3"
                  >
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                      <span className="min-w-0 break-words font-medium text-slate-200">
                        {finding.siteName}
                      </span>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${scoreClass(
                          finding.score,
                        )}`}
                      >
                        {finding.label} · {finding.score}/4
                      </span>
                    </div>
                    <p className="mt-1 break-all text-xs text-slate-400">
                      {finding.username} · {finding.category}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {finding.entropyBits} bits estimated entropy
                    </p>

                    {finding.issues.length > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {finding.issues.map((issue) => (
                          <li key={issue}>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[11px] ${issueClass(
                                issue,
                              )}`}
                            >
                              {ISSUE_LABELS[issue]}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-emerald-300">
                        <CircleCheck
                          className="size-3.5"
                          aria-hidden="true"
                        />
                        No issues found
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500">
        The export contains vault metadata only — never passwords, salts, IVs, or
        ciphertext. Both actions send the master password in the request body,
        never in the URL.
      </p>
    </section>
  );
}
