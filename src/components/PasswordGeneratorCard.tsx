"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import {
  DEFAULT_PASSWORD_LENGTH,
  MIN_SAFE_ENTROPY_BITS,
} from "@/config/constants";
import { evaluateStrength, generatePassword } from "@/lib/passwordUtils";

const MIN_LENGTH = 8;
const MAX_LENGTH = 64;

const inputClass =
  "w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

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

function meterStyles(score: number): { bar: string; text: string } {
  if (score <= 1) return { bar: "bg-rose-500", text: "text-rose-400" };
  if (score === 2) return { bar: "bg-amber-400", text: "text-amber-300" };
  return { bar: "bg-emerald-400", text: "text-emerald-300" };
}

export default function PasswordGeneratorCard() {
  const [password, setPassword] = useState("");
  const [length, setLength] = useState(DEFAULT_PASSWORD_LENGTH);
  const [uppercase, setUppercase] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const strength = useMemo(() => evaluateStrength(password), [password]);
  const meetsTarget = strength.entropyBits >= MIN_SAFE_ENTROPY_BITS;
  const styles = meterStyles(strength.score);

  function handleGenerate() {
    try {
      setPassword(
        generatePassword({ length, uppercase, numbers, symbols }),
      );
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
    } catch {
      setCopied(false);
      setError("Could not copy to the clipboard in this browser.");
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
    <div className="w-full min-w-0 max-w-full space-y-5 rounded-xl border border-slate-800 bg-slate-900/50 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-slate-200">
          <KeyRound className="size-4 text-sky-400" aria-hidden="true" />
          Password Generator
        </h2>
        <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-400">
          Web Crypto
        </span>
      </div>

      {/* Read-only password display */}
      <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
        <label htmlFor="generated-password" className="sr-only">
          Generated password
        </label>
        <div className="flex w-full min-w-0 flex-col gap-2">
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
            className={`${inputClass} min-w-0 max-w-full`}
          />
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setVisible((current) => !current)}
              aria-label={visible ? "Hide generated password" : "Show generated password"}
              aria-pressed={visible}
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-700 p-2 text-slate-400 transition hover:border-slate-500 hover:text-slate-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-500"
            >
              {visible ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!password}
              aria-label="Copy generated password"
              className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {copied ? (
                <Check className="size-4 text-emerald-400" aria-hidden="true" />
              ) : (
                <Copy className="size-4" aria-hidden="true" />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
        <p role="status" aria-live="polite" className="sr-only">
          {copied ? "Generated password copied to clipboard." : ""}
        </p>
      </div>

      {/* Strength meter */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium text-slate-400">Strength</span>
          <span id="password-strength-summary" className={`font-medium ${styles.text}`}>
            {strength.score}/4 · {strength.label}
          </span>
        </div>
        <div
          role="meter"
          aria-label="Password strength"
          aria-valuemin={0}
          aria-valuemax={4}
          aria-valuenow={strength.score}
          aria-valuetext={`${strength.label}, ${strength.score} out of 4`}
          className="flex gap-1.5"
        >
          {[0, 1, 2, 3].map((index) => (
            <span
              key={index}
              className={`h-1.5 flex-1 rounded-full ${
                index < strength.score ? styles.bar : "bg-slate-800"
              }`}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-slate-500">
            {strength.entropyBits} bits estimated entropy
          </span>
          <span
            id="password-entropy-summary"
            className={`inline-flex items-center gap-1.5 ${
              meetsTarget ? "text-emerald-300" : "text-amber-300"
            }`}
          >
            {meetsTarget ? (
              <ShieldCheck className="size-4" aria-hidden="true" />
            ) : (
              <ShieldX className="size-4" aria-hidden="true" />
            )}
            {meetsTarget
              ? `Meets ${MIN_SAFE_ENTROPY_BITS}-bit target`
              : `Below ${MIN_SAFE_ENTROPY_BITS}-bit target`}
          </span>
        </div>
      </div>

      {/* Length */}
      <div>
        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor="password-length"
            className="text-xs font-medium text-slate-400"
          >
            Length
          </label>
          <output
            htmlFor="password-length"
            className="rounded-md border border-slate-700 px-2 py-0.5 font-mono text-xs text-slate-200"
          >
            {length}
          </output>
        </div>
        <input
          id="password-length"
          type="range"
          min={MIN_LENGTH}
          max={MAX_LENGTH}
          step={1}
          value={length}
          onChange={(event) => setLength(Number(event.target.value))}
          className="mt-2 w-full min-w-0 max-w-full rounded-full accent-sky-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
        />
        <div className="mt-1 flex justify-between text-[11px] text-slate-500">
          <span>{MIN_LENGTH}</span>
          <span>{MAX_LENGTH}</span>
        </div>
      </div>

      {/* Character sets */}
      <fieldset className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
        <legend className="px-1 text-xs font-medium text-slate-400">
          Character sets
        </legend>
        <div className="grid grid-cols-1 gap-2">
          {toggles.map((toggle) => (
            <label
              key={toggle.id}
              htmlFor={toggle.id}
              className="flex min-w-0 cursor-pointer items-center gap-2 text-sm text-slate-300"
            >
              <input
                id={toggle.id}
                type="checkbox"
                checked={toggle.checked}
                onChange={(event) => toggle.onChange(event.target.checked)}
                className="size-4 rounded border-slate-700 bg-slate-950 accent-sky-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500"
              />
              {toggle.label}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Lowercase letters are always included. Options apply when you generate
          a new password.
        </p>
      </fieldset>

      {error && (
        <p
          role="alert"
          className="break-words rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleGenerate}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
      >
        <RefreshCw className="size-4" aria-hidden="true" />
        Generate password
      </button>

      <p className="text-xs text-slate-500">
        Entropy is a character-class estimate — a useful heuristic, not a
        guarantee of real-world security.
      </p>
    </div>
  );
}
