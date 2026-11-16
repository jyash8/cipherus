"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, Lock, Plus } from "lucide-react";

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

const CATEGORIES = ["General", "Work", "Finance", "Social", "Development"] as const;

const inputClass =
  "w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

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
      if (!isEditing) {
        setSiteName("");
        setSiteUrl("");
        setUsername("");
        setCategory("General");
      }
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
    <div className="space-y-5 rounded-xl border border-slate-800 bg-slate-900/50 p-4 md:p-5">
      {/* Session master password bar */}
      <section
        aria-labelledby="master-password-label"
        className="rounded-lg border border-slate-800 bg-slate-950/40 p-3"
      >
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-sky-400" aria-hidden="true" />
          <h3
            id="master-password-label"
            className="text-xs font-semibold uppercase tracking-wide text-slate-400"
          >
            Session Master Password
          </h3>
        </div>

        <div className="relative mt-2">
          <Lock
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"
            aria-hidden="true"
          />
          <input
            id="master-password"
            type={showMasterPassword ? "text" : "password"}
            value={masterPassword}
            onChange={(event) => onMasterPasswordChange(event.target.value)}
            placeholder="Enter your vault passphrase"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(errors.masterPassword)}
            aria-describedby={
              errors.masterPassword ? "master-password-error" : undefined
            }
            className={`${inputClass} pl-9 pr-10`}
          />
          <button
            type="button"
            onClick={() => setShowMasterPassword((visible) => !visible)}
            aria-label={
              showMasterPassword ? "Hide master password" : "Show master password"
            }
            aria-pressed={showMasterPassword}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition hover:text-slate-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-500"
          >
            {showMasterPassword ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>

        <p className="mt-2 text-xs text-slate-500">
          Held in memory for this tab only — never stored in the browser.
        </p>
        {errors.masterPassword && (
          <p id="master-password-error" className="mt-1 text-xs text-rose-400">
            {errors.masterPassword}
          </p>
        )}
      </section>

      {/* Add / edit credential form */}
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-semibold text-slate-200">
            <Lock className="size-4 text-sky-400" aria-hidden="true" />
            {isEditing ? "Edit Credential" : "Add Credential"}
          </h2>
          {isEditing && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-500"
            >
              Cancel
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="site-name"
              className="mb-1 block text-xs font-medium text-slate-400"
            >
              Site Name
            </label>
            <input
              id="site-name"
              value={siteName}
              onChange={(event) => setSiteName(event.target.value)}
              placeholder="GitHub"
              autoComplete="off"
              aria-invalid={Boolean(errors.siteName)}
              aria-describedby={errors.siteName ? "site-name-error" : undefined}
              className={inputClass}
            />
            {errors.siteName && (
              <p id="site-name-error" className="mt-1 text-xs text-rose-400">
                {errors.siteName}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="site-url"
              className="mb-1 block text-xs font-medium text-slate-400"
            >
              Site URL
            </label>
            <input
              id="site-url"
              value={siteUrl}
              onChange={(event) => setSiteUrl(event.target.value)}
              placeholder="https://github.com"
              inputMode="url"
              autoComplete="off"
              className={inputClass}
            />
          </div>

          <div>
            <label
              htmlFor="username"
              className="mb-1 block text-xs font-medium text-slate-400"
            >
              Username / Email
            </label>
            <input
              id="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="you@example.com"
              autoComplete="off"
              aria-invalid={Boolean(errors.username)}
              aria-describedby={errors.username ? "username-error" : undefined}
              className={inputClass}
            />
            {errors.username && (
              <p id="username-error" className="mt-1 text-xs text-rose-400">
                {errors.username}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="category"
              className="mb-1 block text-xs font-medium text-slate-400"
            >
              Category
            </label>
            <select
              id="category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className={inputClass}
            >
              {categoryOptions.map((option) => (
                <option key={option} value={option} className="bg-slate-900">
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="credential-password"
              className="mb-1 block text-xs font-medium text-slate-400"
            >
              Password
              {isEditing && (
                <span className="ml-2 font-normal text-slate-500">
                  (leave blank to keep the current password)
                </span>
              )}
            </label>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"
                aria-hidden="true"
              />
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
                className={`${inputClass} pl-9 pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
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
            {errors.password && (
              <p
                id="credential-password-error"
                className="mt-1 text-xs text-rose-400"
              >
                {errors.password}
              </p>
            )}
          </div>
        </div>

        {serverError && (
          <p
            role="alert"
            className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"
          >
            {serverError}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="size-4" aria-hidden="true" />
            {submitting
              ? "Saving…"
              : isEditing
                ? "Update Credential"
                : "Save Credential"}
          </button>
        </div>
      </form>
    </div>
  );
}
