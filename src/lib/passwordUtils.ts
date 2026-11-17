import {
  DEFAULT_PASSWORD_LENGTH,
  MIN_SAFE_ENTROPY_BITS,
} from "@/config/constants";

export interface GeneratorOptions {
  length?: number;
  uppercase?: boolean;
  numbers?: boolean;
  symbols?: boolean;
}

export interface StrengthResult {
  score: number; // 0 to 4
  label: "Weak" | "Fair" | "Good" | "Strong";
  entropyBits: number;
}

/** Explicit printable ASCII symbols (28 characters). */
const SYMBOLS = "!@#$%^&*()-_=+[]{};:,.<>?/|~";
const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";

const MAX_PASSWORD_LENGTH = 128;

/**
 * Returns an unbiased random integer in [0, maxExclusive).
 *
 * Uses rejection sampling instead of `% maxExclusive` directly: byte values
 * above the largest multiple of `maxExclusive` are discarded, so every index
 * has exactly the same probability.
 */
function randomInt(maxExclusive: number): number {
  const webCrypto = globalThis.crypto;

  if (!webCrypto || typeof webCrypto.getRandomValues !== "function") {
    throw new Error("The Web Crypto API is required to generate passwords");
  }

  const maxValid = Math.floor(256 / maxExclusive) * maxExclusive;
  const bytes = new Uint8Array(1);

  for (;;) {
    webCrypto.getRandomValues(bytes);
    const value = bytes[0];

    if (value < maxValid) {
      return value % maxExclusive;
    }
  }
}

/**
 * Generates a cryptographically random password using the Web Crypto API.
 *
 * At least one character from every enabled set is guaranteed to be present.
 * Invalid lengths throw a RangeError rather than silently producing a weaker
 * or longer password.
 */
export function generatePassword(options: GeneratorOptions = {}): string {
  const enabledSets = [LOWERCASE];

  if (options.uppercase !== false) {
    enabledSets.push(UPPERCASE);
  }
  if (options.numbers !== false) {
    enabledSets.push(DIGITS);
  }
  if (options.symbols !== false) {
    enabledSets.push(SYMBOLS);
  }

  const length = options.length ?? DEFAULT_PASSWORD_LENGTH;

  if (!Number.isInteger(length)) {
    throw new RangeError("Password length must be an integer");
  }
  if (length < enabledSets.length) {
    throw new RangeError(
      `Password length must be at least ${enabledSets.length} to include every enabled character set`,
    );
  }
  if (length > MAX_PASSWORD_LENGTH) {
    throw new RangeError(`Password length must not exceed ${MAX_PASSWORD_LENGTH}`);
  }

  const pool = enabledSets.join("");
  const characters: string[] = [];

  // Reserve one slot per enabled set so the guarantee survives shuffling.
  for (const set of enabledSets) {
    characters.push(set[randomInt(set.length)]);
  }
  while (characters.length < length) {
    characters.push(pool[randomInt(pool.length)]);
  }

  // Fisher-Yates shuffle with the same unbiased random source.
  for (let i = characters.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [characters[i], characters[j]] = [characters[j], characters[i]];
  }

  return characters.join("");
}

/** Well-known weak fragments that should never count as full-strength entropy. */
const OBVIOUS_SEQUENCES = [
  "123456",
  "abcdef",
  "qwerty",
  "asdf",
  "zxcv",
  "password",
  "letmein",
  "welcome",
  "admin",
];

const MAX_PENALTY_FACTOR = 0.25;

function isAlphaNumericCode(code: number): boolean {
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) // a-z
  );
}

function scoreForEntropy(entropyBits: number): number {
  if (entropyBits < 28) return 0;
  if (entropyBits < 40) return 1;
  if (entropyBits < MIN_SAFE_ENTROPY_BITS) return 2;
  if (entropyBits < 80) return 3;
  return 4;
}

const LABELS: StrengthResult["label"][] = ["Weak", "Weak", "Fair", "Good", "Strong"];

/**
 * Estimates password strength heuristically.
 *
 * Entropy is approximated as `length * log2(poolSize)`, using the character
 * classes observed in the password, then reduced for repeated characters,
 * identical-character runs, monotonic sequences, and obvious weak fragments.
 *
 * This is a heuristic estimate for UI feedback and auditing, not a guarantee
 * of real-world security: dictionary attacks, credential reuse, and targeted
 * guessing are not modelled.
 */
export function evaluateStrength(password: string): StrengthResult {
  if (password.length === 0) {
    return { score: 0, label: "Weak", entropyBits: 0 };
  }

  let poolSize = 0;
  if (/[a-z]/.test(password)) poolSize += LOWERCASE.length;
  if (/[A-Z]/.test(password)) poolSize += UPPERCASE.length;
  if (/[0-9]/.test(password)) poolSize += DIGITS.length;
  if (/[^A-Za-z0-9]/.test(password)) poolSize += SYMBOLS.length;

  const baseEntropy = password.length * Math.log2(Math.max(poolSize, 2));

  // 1) Repeated characters, scaled by length so long passphrases are not
  // punished as harshly as short passwords made of a few repeated characters.
  const uniqueCharacters = new Set(password).size;
  const repeatedCharacters = password.length - uniqueCharacters;
  let penalty = (repeatedCharacters / password.length) * 0.4;

  // 2) Identical-character runs of three or more (e.g. "aaaa"), with longer
  // runs carrying a larger penalty.
  let identicalRunPenalty = 0;
  let runLength = 1;
  for (let i = 1; i < password.length; i += 1) {
    if (password[i] === password[i - 1]) {
      runLength += 1;
    } else {
      if (runLength >= 3) identicalRunPenalty += 0.1 + 0.02 * (runLength - 3);
      runLength = 1;
    }
  }
  if (runLength >= 3) identicalRunPenalty += 0.1 + 0.02 * (runLength - 3);
  penalty += identicalRunPenalty;

  // 3) Monotonic alphanumeric sequences of three or more (e.g. "abc", "321").
  const normalized = password.toLowerCase();
  let sequentialRuns = 0;
  let sequenceLength = 1;
  for (let i = 1; i < normalized.length; i += 1) {
    const previous = normalized.charCodeAt(i - 1);
    const current = normalized.charCodeAt(i);

    if (
      isAlphaNumericCode(previous) &&
      isAlphaNumericCode(current) &&
      Math.abs(current - previous) === 1
    ) {
      sequenceLength += 1;
    } else {
      if (sequenceLength >= 3) sequentialRuns += 1;
      sequenceLength = 1;
    }
  }
  if (sequenceLength >= 3) sequentialRuns += 1;
  penalty += sequentialRuns * 0.25;

  // 4) Obvious weak fragments anywhere in the password.
  const obviousSequences = OBVIOUS_SEQUENCES.reduce(
    (count, sequence) => count + (normalized.includes(sequence) ? 1 : 0),
    0,
  );
  penalty += obviousSequences * 0.35;

  const penaltyFactor = Math.max(MAX_PENALTY_FACTOR, 1 - penalty);
  const entropyBits = Math.round(baseEntropy * penaltyFactor);
  const score = scoreForEntropy(entropyBits);

  return {
    score,
    label: LABELS[score],
    entropyBits,
  };
}
