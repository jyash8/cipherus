"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, Lock } from "lucide-react";
import { CATEGORIES } from "@/config/constants";

export interface EditableCredential {
  id: number;
  siteName: string;
  siteUrl: string | null;
  username: string;
  category: string;
}

export interface CredentialFormProps {
  masterPassword: string;
  onMasterPasswordChange: (value: string) => void;
  editingCredential: EditableCredential | null;
  onCancelEdit: () => void;
  onSaved: () => void;
}

interface FieldErrors {
  siteName?: string;
  username?: string;
  password?: string;
  masterPassword?: string;
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

export default function CredentialForm(props: CredentialFormProps) {
  const formKey = props.editingCredential
    ? `edit-${props.editingCredential.id}`
    : "new";

  // Remounting by key resets every field when the edit target changes, which
  // avoids state-syncing effects and keeps each form session independent.
  return <CredentialFormFields key={formKey} {...props} />;
}

function CredentialFormFields({
  masterPassword,
  onMasterPasswordChange,
  editingCredential,
  onCancelEdit,
  onSaved,
}: CredentialFormProps) {
  const isEditing = editingCredential !== null;

  const [siteName, setSiteName] = useState(editingCredential?.siteName ?? "");
  const [siteUrl, setSiteUrl] = useState(editingCredential?.siteUrl ?? "");
  const [username, setUsername] = useState(editingCredential?.username ?? "");
  const [category, setCategory] = useState<string>(
    editingCredential?.category ?? "General",
  );
  const [password, setPassword] = useState("");

  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Session-only visibility toggles. The master password itself lives in the
  // parent's React state and is never written to localStorage or cookies.
  const [showMasterPassword, setShowMasterPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const trimmedName = siteName.trim();
    const trimmedUsername = username.trim();
    const hasPasswordInput = password.length > 0;

    const nextErrors: FieldErrors = {};
    if (!trimmedName) {
      nextErrors.siteName = "Site name is required.";
    }
    if (!trimmedUsername) {
      nextErrors.username = "Username or email is required.";
    }
    if (!isEditing && !hasPasswordInput) {
      nextErrors.password = "Password is required for a new entry.";
    }
    if ((!isEditing || hasPasswordInput) && masterPassword.trim() === "") {
      nextErrors.masterPassword =
        "Enter your master password to encrypt this entry.";
    }

    setErrors(nextErrors);
    setServerError(null);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const payload: Record<string, string | null> = {
      siteName: trimmedName,
      siteUrl: siteUrl.trim() === "" ? null : siteUrl.trim(),
      username: trimmedUsername,
      category,
    };
    if (hasPasswordInput) {
      payload.password = password;
    }
    // Only needed when a secret is being encrypted; the API ignores it otherwise.
    if (masterPassword.trim() !== "") {
      payload.masterPassword = masterPassword;
    }

    const endpoint =
      isEditing && editingCredential
        ? `/api/vault/${editingCredential.id}`
        : "/api/vault";
    const method = isEditing ? "PUT" : "POST";

    setSubmitting(true);
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        setServerError(
          extractServerError(data) ??
            (response.status === 401
              ? "Invalid master password or corrupted vault entry."
              : "Could not save the credential. Please try again."),
        );
        return;
      }

      setPassword("");
      setShowPassword(false);
      onSaved();
    } catch {
      setServerError("Network error — could not reach the vault API.");
    } finally {
      setSubmitting(false);
    }
  }

  const categoryOptions: readonly string[] = CATEGORIES.includes(
    category as (typeof CATEGORIES)[number],
  )
    ? CATEGORIES
    : [...CATEGORIES, category];

  return (
    <form noValidate onSubmit={handleSubmit} className="form-stack">
      <div className="form-grid">
        <div className="m-textfield">
          <label htmlFor="site-name">Site name</label>
          <input
            id="site-name"
            value={siteName}
            onChange={(event) => setSiteName(event.target.value)}
            placeholder="GitHub"
            autoComplete="off"
            aria-invalid={Boolean(errors.siteName)}
            aria-describedby={errors.siteName ? "site-name-error" : undefined}
          />
          {errors.siteName && (
            <p id="site-name-error" className="field-error">
              {errors.siteName}
            </p>
          )}
        </div>

        <div className="m-textfield">
          <label htmlFor="site-url">Site URL</label>
          <input
            id="site-url"
            value={siteUrl}
            onChange={(event) => setSiteUrl(event.target.value)}
            placeholder="https://github.com"
            inputMode="url"
            autoComplete="off"
          />
        </div>

        <div className="m-textfield">
          <label htmlFor="username">Username / email</label>
          <input
            id="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="you@example.com"
            autoComplete="off"
            aria-invalid={Boolean(errors.username)}
            aria-describedby={errors.username ? "username-error" : undefined}
          />
          {errors.username && (
            <p id="username-error" className="field-error">
              {errors.username}
            </p>
          )}
        </div>

        <div className="m-textfield">
          <label htmlFor="category">Category</label>
          <select
            id="category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {categoryOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="m-textfield full">
          <label htmlFor="credential-password">
            Password
            {isEditing && (
              <span className="muted" style={{ marginLeft: 8 }}>
                (leave blank to keep the current password)
              </span>
            )}
          </label>
          <div className="with-icon">
            <input
              id="credential-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={
                isEditing ? "New password (optional)" : "Enter a password"
              }
              autoComplete="new-password"
              spellCheck={false}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={
                errors.password ? "credential-password-error" : undefined
              }
            />
            <button
              type="button"
              className="m-iconbtn reveal"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
            >
              {showPassword ? (
                <EyeOff width={16} height={16} aria-hidden="true" />
              ) : (
                <Eye width={16} height={16} aria-hidden="true" />
              )}
            </button>
          </div>
          {errors.password && (
            <p id="credential-password-error" className="field-error">
              {errors.password}
            </p>
          )}
        </div>

        <div className="m-textfield full">
          <label htmlFor="form-master-password">
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <KeyRound width={14} height={14} aria-hidden="true" />
              Master password
            </span>
          </label>
          <div className="with-icon">
            <input
              id="form-master-password"
              type={showMasterPassword ? "text" : "password"}
              value={masterPassword}
              onChange={(event) =>
                onMasterPasswordChange(event.target.value)
              }
              placeholder="Enter your vault passphrase"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(errors.masterPassword)}
              aria-describedby={
                errors.masterPassword ? "form-master-password-error" : undefined
              }
            />
            <button
              type="button"
              className="m-iconbtn reveal"
              onClick={() => setShowMasterPassword((visible) => !visible)}
              aria-label={
                showMasterPassword
                  ? "Hide master password"
                  : "Show master password"
              }
              aria-pressed={showMasterPassword}
            >
              {showMasterPassword ? (
                <EyeOff width={16} height={16} aria-hidden="true" />
              ) : (
                <Eye width={16} height={16} aria-hidden="true" />
              )}
            </button>
          </div>
          <p className="muted">
            Held in memory for this tab only — never stored in the browser.
          </p>
          {errors.masterPassword && (
            <p id="form-master-password-error" className="field-error">
              {errors.masterPassword}
            </p>
          )}
        </div>
      </div>

      {serverError && (
        <p role="alert" className="notice error">
          {serverError}
        </p>
      )}

      <div className="dialog-actions inline">
        <button
          type="button"
          className="m-btn text"
          onClick={onCancelEdit}
          disabled={submitting}
        >
          Cancel
        </button>
        <button type="submit" className="m-btn contained" disabled={submitting}>
          <Lock width={16} height={16} aria-hidden="true" />
          {submitting
            ? "Saving…"
            : isEditing
              ? "Update credential"
              : "Save credential"}
        </button>
      </div>
    </form>
  );
}
