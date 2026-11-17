"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  Code,
  Folder,
  Landmark,
  Users,
} from "lucide-react";
import { CATEGORIES } from "@/config/constants";
import CredentialForm, { type EditableCredential } from "./CredentialForm";
import Modal from "./Modal";
import VaultTable, { type VaultEntry } from "./VaultTable";

export interface VaultWorkspaceProps {
  refreshToken: number;
  onChanged: () => void;
  search: string;
  drawerOpen: boolean;
  onDrawerClose: () => void;
  onNotify: (message: string) => void;
}

const CATEGORY_ICONS: Record<string, typeof Folder> = {
  Work: Briefcase,
  Finance: Landmark,
  Social: Users,
  Development: Code,
};

function CategoryIcon({ category }: { category: string }) {
  const Icon = CATEGORY_ICONS[category] ?? Folder;
  return <Icon width={18} height={18} aria-hidden="true" />;
}

export default function VaultWorkspace({
  refreshToken,
  onChanged,
  search,
  drawerOpen,
  onDrawerClose,
  onNotify,
}: VaultWorkspaceProps) {
  const [entries, setEntries] = useState<VaultEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [category, setCategory] = useState("All");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EditableCredential | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/vault", { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load vault");
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

  const categories = useMemo(() => {
    const names = new Set<string>(CATEGORIES);
    (entries ?? []).forEach((entry) => names.add(entry.category));
    return Array.from(names);
  }, [entries]);

  const counts = useMemo(() => {
    const result: Record<string, number> = { All: entries?.length ?? 0 };
    (entries ?? []).forEach((entry) => {
      result[entry.category] = (result[entry.category] ?? 0) + 1;
    });
    return result;
  }, [entries]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(entry: EditableCredential) {
    setEditing(entry);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
  }

  function handleSaved() {
    const wasEditing = editing !== null;
    closeForm();
    onChanged();
    onNotify(wasEditing ? "Credential updated." : "Credential saved to the vault.");
  }

  function selectCategory(next: string) {
    setCategory(next);
    setSelectedId(null);
    onDrawerClose();
  }

  return (
    <>
      <aside
        id="vault-drawer"
        className={`m-drawer${drawerOpen ? " open" : ""}`}
        aria-label="Categories"
      >
        <div className="drawer-section-title">Categories</div>

        <button
          type="button"
          className={`m-nav-item${category === "All" ? " selected" : ""}`}
          onClick={() => selectCategory("All")}
          aria-current={category === "All" ? "page" : undefined}
        >
          <span className="icon">
            <Folder width={18} height={18} aria-hidden="true" />
          </span>
          <span>All categories</span>
          <span className="count">{counts.All ?? 0}</span>
        </button>

        {categories.map((name) => (
          <button
            key={name}
            type="button"
            className={`m-nav-item indent-1${category === name ? " selected" : ""}`}
            onClick={() => selectCategory(name)}
            aria-current={category === name ? "page" : undefined}
          >
            <span className="icon">
              <CategoryIcon category={name} />
            </span>
            <span>{name}</span>
            {counts[name] ? <span className="count">{counts[name]}</span> : null}
          </button>
        ))}
      </aside>

      <div
        className={`drawer-scrim${drawerOpen ? " open" : ""}`}
        onClick={onDrawerClose}
        aria-hidden="true"
      />

      <main className="content vault-content" id="main-content">
        <VaultTable
          entries={entries}
          loadError={loadError}
          category={category}
          search={search}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAdd={openCreate}
          onEdit={openEdit}
          onChanged={onChanged}
          onNotify={onNotify}
        />
      </main>

      <Modal
        open={formOpen}
        title={editing ? "Edit entry" : "New entry"}
        onClose={closeForm}
        initialFocusSelector="#site-name"
      >
        <CredentialForm
          editingCredential={editing}
          onCancelEdit={closeForm}
          onSaved={handleSaved}
        />
      </Modal>
    </>
  );
}
