"use client";

import { useCallback, useState } from "react";
import CredentialForm, { type EditableCredential } from "./CredentialForm";
import VaultTable from "./VaultTable";

/**
 * Shared state hub for the vault features:
 * - the session master password (React state only, never persisted)
 * - the refresh trigger used to re-fetch the credential list
 * - the credential currently being edited, shared by the form and the table
 */
export default function VaultWorkspace() {
  const [masterPassword, setMasterPassword] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const [editingCredential, setEditingCredential] =
    useState<EditableCredential | null>(null);

  const refresh = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  const handleSaved = useCallback(() => {
    setEditingCredential(null);
    refresh();
  }, [refresh]);

  const handleCancelEdit = useCallback(() => {
    setEditingCredential(null);
  }, []);

  const handleEdit = useCallback((entry: EditableCredential) => {
    setEditingCredential(entry);
  }, []);

  return (
    <div className="space-y-6">
      <CredentialForm
        masterPassword={masterPassword}
        onMasterPasswordChange={setMasterPassword}
        editingCredential={editingCredential}
        onCancelEdit={handleCancelEdit}
        onSaved={handleSaved}
      />

      <VaultTable
        masterPassword={masterPassword}
        refreshToken={refreshToken}
        onEdit={handleEdit}
        onChanged={refresh}
      />
    </div>
  );
}
