"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import type { EditableCredential } from "./CredentialForm";

export interface VaultEntry extends EditableCredential {
  createdAt: string;
  updatedAt: string;
}

export interface VaultTableProps {
  masterPassword: string;
  refreshToken: number;
  onEdit: (entry: EditableCredential) => void;
  onChanged: () => void;
}

const MASKED_PASSWORD = "••••••••••••";
const CATEGORIES = [
  "General",
  "Work",
  "Finance",
  "Social",
  "Development",
] as const;

const buttonClass =
  "inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 transition hover:border-slate-500 hover:text-slate-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50";

type Notice = { kind: "error" | "success"; message: string } | null;

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

function readPassword(data: unknown): string | null {
  if (
    typeof data === "object" &&
    data !== null &&
    "password" in data &&
    typeof (data as { password?: unknown }).password === "string"
  ) {
    return (data as { password: string }).password;
  }
  return null;
}

async function fetchPassword(
  id: number,
  masterPassword: string,
): Promise<{ ok: true; password: string } | { ok: false; message: string }> {
  try {
    const response = await fetch(`/api/vault/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ masterPassword }),
    });
    const data: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        ok: false,
        message:
          response.status === 401
            ? "Incorrect master password — this entry could not be decrypted."
            : (extractServerError(data) ??
              "Could not reveal this password. Please try again."),
      };
    }

    const password = readPassword(data);
    if (password === null) {
      return { ok: false, message: "The vault returned an unexpected response." };
    }
    return { ok: true, password };
  } catch {
    return { ok: false, message: "Network error — could not reach the vault API." };
  }
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  // Fallback for non-secure contexts (e.g. plain http on a LAN address).
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error("Clipboard copy failed");
  }
}

export default function VaultTable({
  masterPassword,
  refreshToken,
  onEdit,
  onChanged,
}: VaultTableProps) {
  const [entries, setEntries] = useState<VaultEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [revealed, setRevealed] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/vault", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Failed to load vault");
        }
        const data: unknown = await response.json();
        if (cancelled) return;
        setEntries(Array.isArray(data) ? (data as VaultEntry[]) : []);
        setLoadError(null);
      } catch {
        if (cancelled) return;
        setEntries([]);
        setLoadError("Could not load the vault. Please try refreshing.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  const categoryOptions = useMemo(() => {
    const options = new Set<string>(CATEGORIES);
    (entries ?? []).forEach((entry) => options.add(entry.category));
    return ["All", ...Array.from(options)];
  }, [entries]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (entries ?? []).filter((entry) => {
      if (category !== "All" && entry.category !== category) {
        return false;
      }
      if (query === "") {
        return true;
      }
      return [entry.siteName, entry.username, entry.siteUrl ?? "", entry.category].some(
        (value) => value.toLowerCase().includes(query),
      );
    });
  }, [entries, search, category]);

  function requireMasterPassword(what = "revealing or copying a password"): string | null {
    if (masterPassword.trim() === "") {
      setNotice({
        kind: "error",
        message: `Enter your master password above before ${what}.`,
      });
      return null;
    }
    return masterPassword;
  }

  async function handleToggleReveal(entry: VaultEntry) {
    if (revealed[entry.id] !== undefined) {
      setRevealed((previous) => {
        const next = { ...previous };
        delete next[entry.id];
        return next;
      });
      return;
    }

    const master = requireMasterPassword();
    if (master === null) return;

    setBusyId(entry.id);
    setNotice(null);
    const result = await fetchPassword(entry.id, master);
    setBusyId(null);

    if (result.ok) {
      setRevealed((previous) => ({ ...previous, [entry.id]: result.password }));
    } else {
      setNotice({ kind: "error", message: result.message });
    }
  }

  async function handleCopy(entry: VaultEntry) {
    let password = revealed[entry.id];

    if (password === undefined) {
      const master = requireMasterPassword();
      if (master === null) return;

      setBusyId(entry.id);
      setNotice(null);
      const result = await fetchPassword(entry.id, master);
      setBusyId(null);

      if (!result.ok) {
        setNotice({ kind: "error", message: result.message });
        return;
      }
      password = result.password;
      setRevealed((previous) => ({ ...previous, [entry.id]: result.password }));
    }

    try {
      await copyText(password);
      setCopiedId(entry.id);
      setNotice({
        kind: "success",
        message: `Password for "${entry.siteName}" copied to clipboard.`,
      });
      window.setTimeout(() => {
        setCopiedId((current) => (current === entry.id ? null : current));
      }, 2000);
    } catch {
      setNotice({
        kind: "error",
        message: "Could not copy to the clipboard in this browser.",
      });
    }
  }

  async function handleDelete(entry: VaultEntry) {
    const confirmed = window.confirm(
      `Delete "${entry.siteName}"? This cannot be undone.`,
    );
    if (!confirmed) return;

    const master = requireMasterPassword("deleting this credential");
    if (master === null) return;

    setDeletingId(entry.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/vault/${entry.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ masterPassword: master }),
      });
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        setNotice({
          kind: "error",
          message:
            response.status === 401
              ? "Incorrect master password — this entry could not be deleted."
              : (extractServerError(data) ?? "Could not delete this credential."),
        });
        return;
      }

      setRevealed((previous) => {
        const next = { ...previous };
        delete next[entry.id];
        return next;
      });
      setNotice({
        kind: "success",
        message: `"${entry.siteName}" deleted from the vault.`,
      });
      onChanged();
    } catch {
      setNotice({
        kind: "error",
        message: "Network error — could not delete this credential.",
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-slate-200">Stored Credentials</h2>
        <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-400">
          {entries?.length ?? 0} saved
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"
            aria-hidden="true"
          />
          <input
            id="vault-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search site, username, or URL"
            aria-label="Search credentials"
            className="w-full rounded-lg border border-slate-800 bg-slate-950/60 py-2 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div>
          <label htmlFor="vault-category-filter" className="sr-only">
            Filter by category
          </label>
          <select
            id="vault-category-filter"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            {categoryOptions.map((option) => (
              <option key={option} value={option} className="bg-slate-900">
                {option === "All" ? "All categories" : option}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(notice || loadError) && (
        <p
          role="alert"
          className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
            (notice?.kind ?? "error") === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-rose-500/30 bg-rose-500/10 text-rose-300"
          }`}
        >
          {notice?.message ?? loadError}
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="px-2 py-2 font-medium">Site</th>
              <th className="px-2 py-2 font-medium">Username</th>
              <th className="px-2 py-2 font-medium">Category</th>
              <th className="px-2 py-2 font-medium">Password</th>
              <th className="px-2 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry) => {
              const isRevealed = revealed[entry.id] !== undefined;
              const isBusy = busyId === entry.id;

              return (
                <tr
                  key={entry.id}
                  className="border-t border-slate-800/70 align-middle transition-colors hover:bg-slate-800/20"
                >
                  <td className="px-2 py-3">
                    <div className="font-medium text-slate-200">{entry.siteName}</div>
                    {entry.siteUrl && (
                      <a
                        href={entry.siteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all text-xs text-sky-400 hover:underline"
                      >
                        {entry.siteUrl}
                      </a>
                    )}
                  </td>
                  <td className="break-all px-2 py-3 text-slate-300">
                    {entry.username}
                  </td>
                  <td className="px-2 py-3">
                    <span className="rounded-full border border-slate-700 bg-slate-950/60 px-2 py-0.5 text-xs text-slate-300">
                      {entry.category}
                    </span>
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <code
                        className={`font-mono text-xs ${
                          isRevealed
                            ? "break-all text-slate-200"
                            : "tracking-widest text-slate-500"
                        }`}
                      >
                        {isRevealed ? revealed[entry.id] : MASKED_PASSWORD}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleToggleReveal(entry)}
                        disabled={isBusy}
                        aria-label={
                          isRevealed
                            ? `Hide password for ${entry.siteName}`
                            : `Reveal password for ${entry.siteName}`
                        }
                        className={buttonClass}
                      >
                        {isRevealed ? (
                          <EyeOff className="size-3.5" aria-hidden="true" />
                        ) : (
                          <Eye className="size-3.5" aria-hidden="true" />
                        )}
                        {isRevealed ? "Hide" : "Reveal"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy(entry)}
                        disabled={isBusy}
                        aria-label={`Copy password for ${entry.siteName}`}
                        className={buttonClass}
                      >
                        {copiedId === entry.id ? (
                          <Check className="size-3.5 text-emerald-400" aria-hidden="true" />
                        ) : (
                          <Copy className="size-3.5" aria-hidden="true" />
                        )}
                        Copy
                      </button>
                    </div>
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => onEdit(entry)}
                        aria-label={`Edit ${entry.siteName}`}
                        className={buttonClass}
                      >
                        <Pencil className="size-3.5" aria-hidden="true" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(entry)}
                        disabled={deletingId === entry.id}
                        aria-label={`Delete ${entry.siteName}`}
                        className={`${buttonClass} hover:border-rose-500/60 hover:text-rose-300`}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {entries === null && (
          <p className="px-2 py-6 text-center text-sm text-slate-500">
            Loading vault…
          </p>
        )}

        {entries !== null && filtered.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-slate-500">
            {entries.length === 0
              ? "No credentials saved yet. Add one using the form above."
              : "No entries match your search or category filter."}
          </p>
        )}
      </div>
    </div>
  );
}
