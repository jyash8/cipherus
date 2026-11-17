"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type { EditableCredential } from "./CredentialForm";

export interface VaultEntry extends EditableCredential {
  createdAt: string;
  updatedAt: string;
}

export interface VaultTableProps {
  entries: VaultEntry[] | null;
  loadError: string | null;
  masterPassword: string;
  category: string;
  search: string;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onAdd: () => void;
  onEdit: (entry: EditableCredential) => void;
  onChanged: () => void;
  onNotify: (message: string) => void;
  onRequestMasterPassword: () => void;
}

const MASKED_PASSWORD = "••••••••••••";

type Notice = { kind: "error" | "success"; message: string } | null;

type SortKey = "siteName" | "username" | "category" | "siteUrl";

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

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

export default function VaultTable({
  entries,
  loadError,
  masterPassword,
  category,
  search,
  selectedId,
  onSelect,
  onAdd,
  onEdit,
  onChanged,
  onNotify,
  onRequestMasterPassword,
}: VaultTableProps) {
  const [revealed, setRevealed] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [sortKey, setSortKey] = useState<SortKey>("siteName");
  const [sortAsc, setSortAsc] = useState(true);

  const selected =
    entries?.find((entry) => entry.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = (entries ?? []).filter((entry) => {
      if (category !== "All" && entry.category !== category) {
        return false;
      }
      if (query === "") return true;
      return [
        entry.siteName,
        entry.username,
        entry.siteUrl ?? "",
        entry.category,
      ].some((value) => value.toLowerCase().includes(query));
    });

    return list.sort((a, b) => {
      const left = (a[sortKey] ?? "").toLowerCase();
      const right = (b[sortKey] ?? "").toLowerCase();
      return sortAsc
        ? left.localeCompare(right)
        : right.localeCompare(left);
    });
  }, [entries, category, search, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((ascending) => !ascending);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  function requireMasterPassword(what: string): string | null {
    if (masterPassword.trim() !== "") {
      return masterPassword;
    }

    setNotice({
      kind: "error",
      message: `Enter your master password in the session bar above before ${what}.`,
    });
    onRequestMasterPassword();
    return null;
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

    const master = requireMasterPassword("revealing a password");
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
      const master = requireMasterPassword("copying a password");
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
      setRevealed((previous) => ({
        ...previous,
        [entry.id]: result.password,
      }));
    }

    try {
      await copyText(password);
      setCopiedId(entry.id);
      onNotify(`Password for "${entry.siteName}" copied to clipboard.`);
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
      onSelect(null);
      onChanged();
      onNotify(`"${entry.siteName}" deleted from the vault.`);
    } catch {
      setNotice({
        kind: "error",
        message: "Network error — could not delete this credential.",
      });
    } finally {
      setDeletingId(null);
    }
  }

  const revealedPassword =
    selected !== null && busyId !== selected.id
      ? revealed[selected.id]
      : undefined;

  return (
    <>
      <div className="content-toolbar">
        <button type="button" className="m-btn contained" onClick={onAdd}>
          <Plus width={18} height={18} aria-hidden="true" /> New entry
        </button>
        <button
          type="button"
          className="m-btn tonal"
          disabled={selected === null}
          onClick={() => selected !== null && onEdit(selected)}
        >
          <Pencil width={18} height={18} aria-hidden="true" /> Edit
        </button>
        <button
          type="button"
          className="m-btn tonal"
          disabled={selected === null || deletingId !== null}
          onClick={() => selected !== null && void handleDelete(selected)}
        >
          <Trash2 width={18} height={18} aria-hidden="true" /> Delete
        </button>
        <span className="status-chip">
          {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
        </span>
      </div>

      {(notice || loadError) && (
        <p
          role="alert"
          className={`notice ${(notice?.kind ?? "error") === "success" ? "success" : "error"}`}
          style={{ margin: "4px 16px 0" }}
        >
          {notice?.message ?? loadError}
        </p>
      )}

      <div className={`split${selected !== null ? " show-detail" : ""}`}>
        <div className="entry-list">
          <table>
            <thead>
              <tr>
                <th
                  aria-sort={
                    sortKey === "siteName"
                      ? sortAsc
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    className="sort-btn"
                    onClick={() => toggleSort("siteName")}
                  >
                    Site
                  </button>
                </th>
                <th
                  aria-sort={
                    sortKey === "username"
                      ? sortAsc
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    className="sort-btn"
                    onClick={() => toggleSort("username")}
                  >
                    Username
                  </button>
                </th>
                <th>Password</th>
                <th
                  aria-sort={
                    sortKey === "category"
                      ? sortAsc
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    className="sort-btn"
                    onClick={() => toggleSort("category")}
                  >
                    Category
                  </button>
                </th>
                <th>URL</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr
                  key={entry.id}
                  className={entry.id === selectedId ? "selected" : ""}
                  aria-selected={entry.id === selectedId}
                  tabIndex={0}
                  onClick={() => onSelect(entry.id)}
                  onDoubleClick={() => onEdit(entry)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onEdit(entry);
                    } else if (event.key === " ") {
                      event.preventDefault();
                      onSelect(entry.id);
                    }
                  }}
                >
                  <td className="title">
                    <span className="entry-title">
                      <span className="entry-icon" aria-hidden="true">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5Zm-3 8V6a3 3 0 0 1 6 0v3H9Z" />
                        </svg>
                      </span>
                      {entry.siteName}
                    </span>
                  </td>
                  <td>{entry.username}</td>
                  <td>
                    <span className="mono">{MASKED_PASSWORD}</span>
                  </td>
                  <td>{entry.category}</td>
                  <td>
                    {entry.siteUrl ? (
                      <a
                        href={entry.siteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {entry.siteUrl}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {entries === null && (
            <p className="empty">Loading vault…</p>
          )}

          {entries !== null && filtered.length === 0 && (
            <p className="empty">
              {entries.length === 0
                ? "No credentials saved yet. Use New entry to add one."
                : "No entries match your search or category."}
            </p>
          )}
        </div>

        <aside className="detail-pane" aria-label="Credential details">
          {selected === null ? (
            <div className="placeholder">
              Select an entry to view its details.
            </div>
          ) : (
            <>
              <button
                type="button"
                className="m-btn text detail-back"
                onClick={() => onSelect(null)}
              >
                ← Back to list
              </button>

              <h3>
                <span className="entry-icon" aria-hidden="true">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5Zm-3 8V6a3 3 0 0 1 6 0v3H9Z" />
                  </svg>
                </span>
                {selected.siteName}
              </h3>

              <div className="detail-rows">
                <div className="detail-field">
                  <div className="lbl">Username</div>
                  <div className="val">{selected.username}</div>
                </div>

                <div className="detail-field">
                  <div className="lbl">Password</div>
                  <div className="val">
                    <span className="mono">
                      {revealedPassword ?? MASKED_PASSWORD}
                    </span>
                    <button
                      type="button"
                      className="m-iconbtn"
                      style={{ width: 32, height: 32 }}
                      onClick={() => void handleToggleReveal(selected)}
                      disabled={busyId === selected.id}
                      aria-label={
                        revealedPassword !== undefined
                          ? "Hide password"
                          : "Reveal password"
                      }
                    >
                      {revealedPassword !== undefined ? (
                        <EyeOff width={18} height={18} aria-hidden="true" />
                      ) : (
                        <Eye width={18} height={18} aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      className="m-iconbtn"
                      style={{ width: 32, height: 32 }}
                      onClick={() => void handleCopy(selected)}
                      disabled={busyId === selected.id}
                      aria-label="Copy password"
                    >
                      {copiedId === selected.id ? (
                        <Check width={18} height={18} aria-hidden="true" />
                      ) : (
                        <Copy width={18} height={18} aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="detail-field">
                  <div className="lbl">URL</div>
                  <div className="val">
                    {selected.siteUrl ? (
                      <a
                        href={selected.siteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {selected.siteUrl}
                      </a>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>

                <div className="detail-field">
                  <div className="lbl">Category</div>
                  <div className="val">{selected.category}</div>
                </div>
              </div>

              <div className="divider" />

              <div className="detail-meta">
                <span>Created {formatDate(selected.createdAt)}</span>
                <span>Last modified {formatDate(selected.updatedAt)}</span>
              </div>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
