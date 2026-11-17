"use client";

import { useEffect, useState } from "react";
import { Folder, RefreshCw, ShieldCheck } from "lucide-react";
import type { ViewId } from "@/lib/theme";
import type { VaultEntry } from "./VaultTable";

export interface HomeViewProps {
  refreshToken: number;
  onNavigate: (view: ViewId) => void;
}

const TILES: ReadonlyArray<{
  id: ViewId;
  title: string;
  description: string;
  Icon: typeof Folder;
}> = [
  {
    id: "vault",
    title: "Encrypted vault",
    description:
      "Add, search, and reveal credentials. Secrets are encrypted with AES-256-GCM before they touch the database.",
    Icon: Folder,
  },
  {
    id: "generator",
    title: "Password generator",
    description:
      "Create strong random passwords with Web Crypto, check their estimated entropy, and save them straight to the vault.",
    Icon: RefreshCw,
  },
  {
    id: "audit",
    title: "Security audit",
    description:
      "Find weak, reused, duplicate, and stale credentials. Export metadata without exposing any secrets.",
    Icon: ShieldCheck,
  },
];

export default function HomeView({ refreshToken, onNavigate }: HomeViewProps) {
  const [entries, setEntries] = useState<VaultEntry[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/vault", { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load vault");
        const data: unknown = await response.json();
        if (cancelled) return;
        setEntries(Array.isArray(data) ? (data as VaultEntry[]) : []);
        setLoadError(false);
      } catch {
        if (cancelled) return;
        setEntries([]);
        setLoadError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  const total = entries?.length ?? null;
  const categoryCount =
    entries === null
      ? null
      : new Set(entries.map((entry) => entry.category)).size;
  const latest =
    entries === null || entries.length === 0
      ? null
      : entries.reduce((newest, entry) =>
          new Date(entry.updatedAt) > new Date(newest.updatedAt)
            ? entry
            : newest,
        );

  return (
    <div className="home">
      <div className="home-hero">
        <h1>Welcome to Cipherus</h1>
        <p>
          A local-only password manager. Metadata stays readable; every secret is
          encrypted in SQLite with a key derived from your master password.
        </p>
      </div>

      <div className="home-stats">
        <div className="stat-card">
          <div className="n">{total ?? "—"}</div>
          <div className="l">Credentials</div>
        </div>
        <div className="stat-card">
          <div className="n">{categoryCount ?? "—"}</div>
          <div className="l">Categories</div>
        </div>
        <div className="stat-card">
          <div className="n">
            {latest === null
              ? "—"
              : new Date(latest.updatedAt).toLocaleDateString()}
          </div>
          <div className="l">Last updated</div>
        </div>
      </div>

      {loadError && (
        <p className="notice error" role="alert">
          Could not load the vault summary. Open the Vault tab to try again.
        </p>
      )}

      {entries !== null && entries.length === 0 && !loadError && (
        <p className="notice info">
          No credentials saved yet. Open the vault to add one, or generate a
          password and save it directly.
        </p>
      )}

      <div className="tile-grid">
        {TILES.map(({ id, title, description, Icon }) => (
          <button
            key={id}
            type="button"
            className="tile"
            onClick={() => onNavigate(id)}
          >
            <span className="tile-icon" aria-hidden="true">
              <Icon width={24} height={24} />
            </span>
            <h3>{title}</h3>
            <p>{description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
