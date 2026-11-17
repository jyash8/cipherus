"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, LoaderCircle, Lock } from "lucide-react";
import {
  APP_NAME,
  MAX_MASTER_PASSWORD_LENGTH,
  MIN_MASTER_PASSWORD_LENGTH,
} from "@/config/constants";
import StrengthMeter from "./StrengthMeter";

export interface SetupViewProps {
  credentialCount: number;
  onInitialized: () => void;
}

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  visible: boolean;
  onChange: (value: string) => void;
  onToggleVisibility: () => void;
  autoFocus?: boolean;
}

function PasswordField({
  id,
  label,
  value,
  placeholder,
  visible,
  onChange,
  onToggleVisibility,
  autoFocus = false,
}: PasswordFieldProps) {
  return (
    <div className="m-textfield full">
      <label htmlFor={id}>{label}</label>
      <div className="with-icon">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete="new-password"
          spellCheck={false}
          autoFocus={autoFocus}
        />
        <button
          type="button"
          className="m-iconbtn reveal"
          onClick={onToggleVisibility}
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
        >
          {visible ? (
            <EyeOff width={16} height={16} aria-hidden="true" />
          ) : (
            <Eye width={16} height={16} aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}

function extractServerCount(data: unknown): number | null {
  if (
    typeof data === "object" &&
    data !== null &&
    "credentialCount" in data &&
    typeof (data as { credentialCount?: unknown }).credentialCount === "number"
  ) {
    return (data as { credentialCount: number }).credentialCount;
  }
  return null;
}

/**
 * First-run screen. This is the only place a master password is entered; the
 * server derives a vault key from it and stores only the key.
 */
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

export default function SetupView({
  credentialCount,
  onInitialized,
}: SetupViewProps) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [eraseConfirmed, setEraseConfirmed] = useState(false);
  const [entryCount, setEntryCount] = useState(credentialCount);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasExistingEntries = entryCount > 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    if (password.length < MIN_MASTER_PASSWORD_LENGTH) {
      setError(
        `The master password must be at least ${MIN_MASTER_PASSWORD_LENGTH} characters.`,
      );
      return;
    }
    if (password.length > MAX_MASTER_PASSWORD_LENGTH) {
      setError(
        `The master password must be at most ${MAX_MASTER_PASSWORD_LENGTH} characters.`,
      );
      return;
    }
    if (password !== confirmation) {
      setError("The master password and confirmation do not match.");
      return;
    }
    if (hasExistingEntries && !eraseConfirmed) {
      setError("Confirm that the existing entries may be erased.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/vault/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          masterPassword: password,
          resetExisting: hasExistingEntries,
        }),
      });
      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const serverError = extractServerError(data);
        if (serverError === "Vault is already initialized") {
          onInitialized();
          return;
        }

        const serverCount = extractServerCount(data);
        if (serverCount !== null && serverCount !== entryCount) {
          setEntryCount(serverCount);
          setEraseConfirmed(false);
        }

        setError(serverError ?? "Could not set up the vault. Please try again.");
        return;
      }

      onInitialized();
    } catch {
      setError("Network error — could not reach the vault API.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="setup-screen">
      <div className="setup-card panel">
        <div className="setup-brand">
          <span className="logo" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5Zm-3 8V6a3 3 0 0 1 6 0v3H9Zm3 5a1.5 1.5 0 0 1 1 2.8V18h-2v-1.2A1.5 1.5 0 0 1 12 14Z" />
            </svg>
          </span>
          <span>{APP_NAME}</span>
        </div>

        <div className="setup-heading">
          <h1>Create your vault</h1>
          <p className="muted">
            Choose a master password once. {APP_NAME} derives a vault key from it
            and uses that key automatically, so you will not be asked again.
          </p>
        </div>

        <form className="form-stack" noValidate onSubmit={handleSubmit}>
          <PasswordField
            id="setup-master-password"
            label="Master password"
            value={password}
            placeholder={`At least ${MIN_MASTER_PASSWORD_LENGTH} characters`}
            visible={showPassword}
            onChange={setPassword}
            onToggleVisibility={() => setShowPassword((visible) => !visible)}
            autoFocus
          />

          <div aria-live="polite">
            <StrengthMeter password={password} />
          </div>

          <PasswordField
            id="setup-confirmation"
            label="Confirm master password"
            value={confirmation}
            placeholder="Type it again"
            visible={showConfirmation}
            onChange={setConfirmation}
            onToggleVisibility={() =>
              setShowConfirmation((visible) => !visible)
            }
          />

          {hasExistingEntries && (
            <div className="setup-warning">
              <p className="notice error">
                Setting a new master password creates a new vault key. All{" "}
                {entryCount} existing{" "}
                {entryCount === 1 ? "entry" : "entries"} will be permanently
                erased and cannot be recovered.
              </p>
              <label className="check" htmlFor="setup-erase-confirm">
                <input
                  id="setup-erase-confirm"
                  type="checkbox"
                  checked={eraseConfirmed}
                  onChange={(event) => setEraseConfirmed(event.target.checked)}
                />
                I understand these {entryCount}{" "}
                {entryCount === 1 ? "entry" : "entries"} will be permanently
                erased.
              </label>
            </div>
          )}

          {error !== null && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="m-btn contained setup-submit"
            disabled={submitting}
          >
            {submitting ? (
              <LoaderCircle
                width={18}
                height={18}
                className="spinner"
                aria-hidden="true"
              />
            ) : (
              <Lock width={18} height={18} aria-hidden="true" />
            )}
            {submitting ? "Creating vault…" : "Create vault"}
          </button>
        </form>

        <p className="muted setup-note">
          The master password itself is never stored. Only a scrypt-derived key
          is written to a local, git-ignored key file. Back that file up — losing
          it makes the vault unreadable.
        </p>
      </div>
    </div>
  );
}
