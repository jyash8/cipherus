"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  RefreshCw,
} from "lucide-react";
import { CATEGORIES, DEFAULT_PASSWORD_LENGTH } from "@/config/constants";
import { generatePassword } from "@/lib/passwordUtils";
import StrengthMeter from "./StrengthMeter";

const MIN_LENGTH = 8;
const MAX_LENGTH = 64;

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

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

export interface PasswordGeneratorCardProps {
  onSaved: (message: string) => void;
  onNotify: (message: string) => void;
}

export default function PasswordGeneratorCard({
  onSaved,
  onNotify,
}: PasswordGeneratorCardProps) {
  const [password, setPassword] = useState("");
  const [length, setLength] = useState(DEFAULT_PASSWORD_LENGTH);
  const [uppercase, setUppercase] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [siteName, setSiteName] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [username, setUsername] = useState("");
  const [category, setCategory] = useState<string>("General");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Generate only after hydration so server and client markup stay identical.
  useEffect(() => {
    try {
      // Initial generation intentionally runs after mount; generating during
      // render (or in a useState initializer) would desync hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPassword(generatePassword({ length: DEFAULT_PASSWORD_LENGTH }));
    } catch (cause) {
      setError(
        cause instanceof RangeError
          ? cause.message
          : "Could not generate a password in this browser.",
      );
    }
  }, []);

  useEffect(() => {
    if (!copied) return;

    const timeout = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  function handleGenerate() {
    try {
      setPassword(generatePassword({ length, uppercase, numbers, symbols }));
      setCopied(false);
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof RangeError
          ? cause.message
          : "Could not generate a password in this browser.",
      );
    }
  }

  async function handleCopy() {
    if (!password) return;

    try {
      await copyText(password);
      setCopied(true);
      setError(null);
      onNotify("Generated password copied to clipboard.");
    } catch {
      setCopied(false);
      setError("Could not copy to the clipboard in this browser.");
    }
  }

  async function handleSave() {
    if (saving) return;

    const trimmedName = siteName.trim();
    const trimmedUsername = username.trim();

    if (!password) {
      setSaveError("Generate a password before saving it.");
      return;
    }
    if (!trimmedName) {
      setSaveError("Site name is required.");
      return;
    }
    if (!trimmedUsername) {
      setSaveError("Username or email is required.");
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const response = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteName: trimmedName,
          siteUrl: siteUrl.trim() === "" ? null : siteUrl.trim(),
          username: trimmedUsername,
          category,
          password,
        }),
      });

      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const serverMessage =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof (data as { error?: unknown }).error === "string"
            ? (data as { error: string }).error
            : null;

        setSaveError(
          serverMessage ?? "Could not save the credential. Please try again.",
        );
        return;
      }

      setSiteName("");
      setSiteUrl("");
      setUsername("");
      setCategory("General");
      onSaved(`"${trimmedName}" saved to the vault.`);
    } catch {
      setSaveError("Network error — could not reach the vault API.");
    } finally {
      setSaving(false);
    }
  }

  const toggles = [
    {
      id: "include-uppercase",
      label: "Uppercase (A–Z)",
      checked: uppercase,
      onChange: setUppercase,
    },
    {
      id: "include-numbers",
      label: "Numbers (0–9)",
      checked: numbers,
      onChange: setNumbers,
    },
    {
      id: "include-symbols",
      label: "Symbols (!@#$…)",
      checked: symbols,
      onChange: setSymbols,
    },
  ] as const;

  return (
    <div className="panel generator-panel">
      <h2>
        <span className="tile-icon" aria-hidden="true">
          <KeyRound width={22} height={22} />
        </span>
        Password Generator
      </h2>

      <div className="gen-grid">
        <div className="gen-controls">
          <div className="m-textfield">
            <label htmlFor="generated-password">Generated password</label>
            <div className="generator-output">
              <input
                id="generated-password"
                type={visible ? "text" : "password"}
                value={password}
                readOnly
                placeholder="Generating…"
                autoComplete="off"
                spellCheck={false}
                aria-describedby="password-strength-summary password-entropy-summary"
                onFocus={(event) => event.currentTarget.select()}
              />
              <button
                type="button"
                className="m-btn tonal"
                onClick={() => setVisible((current) => !current)}
                aria-label={
                  visible ? "Hide generated password" : "Show generated password"
                }
                aria-pressed={visible}
              >
                {visible ? (
                  <EyeOff width={18} height={18} aria-hidden="true" />
                ) : (
                  <Eye width={18} height={18} aria-hidden="true" />
                )}
                {visible ? "Hide" : "Show"}
              </button>
              <button
                type="button"
                className="m-btn contained"
                onClick={() => void handleCopy()}
                disabled={!password}
                aria-label="Copy generated password"
              >
                {copied ? (
                  <Check width={18} height={18} aria-hidden="true" />
                ) : (
                  <Copy width={18} height={18} aria-hidden="true" />
                )}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                className="m-btn tonal"
                onClick={handleGenerate}
              >
                <RefreshCw width={18} height={18} aria-hidden="true" />
                Generate
              </button>
            </div>
          </div>

          <StrengthMeter
            password={password}
            summaryId="password-strength-summary"
            entropyId="password-entropy-summary"
          />

          <div className="range-row">
            <label htmlFor="password-length">Length</label>
            <input
              id="password-length"
              type="range"
              min={MIN_LENGTH}
              max={MAX_LENGTH}
              step={1}
              value={length}
              onChange={(event) => setLength(Number(event.target.value))}
            />
            <output htmlFor="password-length" className="output-chip">
              {length}
            </output>
          </div>

          <div className="checks">
            {toggles.map((toggle) => (
              <label
                key={toggle.id}
                className="check"
                htmlFor={toggle.id}
              >
                <input
                  id={toggle.id}
                  type="checkbox"
                  checked={toggle.checked}
                  onChange={(event) => toggle.onChange(event.target.checked)}
                />
                {toggle.label}
              </label>
            ))}
          </div>

          <p className="muted">
            Lowercase letters are always included. Entropy is a character-class
            estimate — a useful heuristic, not a guarantee of real-world
            security.
          </p>

          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
        </div>

        <div className="save-form">
          <h3>Save to vault</h3>
          <p className="muted">
            Saves the generated password with the metadata below.
          </p>

          <div className="save-grid">
            <div className="m-textfield full">
              <label htmlFor="gen-site-name">Title</label>
              <input
                id="gen-site-name"
                value={siteName}
                onChange={(event) => setSiteName(event.target.value)}
                placeholder="GitHub"
                autoComplete="off"
              />
            </div>

            <div className="m-textfield full">
              <label htmlFor="gen-username">User name</label>
              <input
                id="gen-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="you@example.com"
                autoComplete="off"
              />
            </div>

            <div className="m-textfield full">
              <label htmlFor="gen-site-url">URL</label>
              <input
                id="gen-site-url"
                value={siteUrl}
                onChange={(event) => setSiteUrl(event.target.value)}
                placeholder="https://github.com"
                inputMode="url"
                autoComplete="off"
              />
            </div>

            <div className="m-textfield full">
              <label htmlFor="gen-category">Category</label>
              <select
                id="gen-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                {CATEGORIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {saveError && (
            <p role="alert" className="notice error">
              {saveError}
            </p>
          )}

          <button
            type="button"
            className="m-btn contained"
            onClick={() => void handleSave()}
            disabled={saving}
            style={{ alignSelf: "flex-start" }}
          >
            <Lock width={18} height={18} aria-hidden="true" />
            {saving ? "Saving…" : "Save to vault"}
          </button>
        </div>
      </div>
    </div>
  );
}
