import { DEFAULT_PASSWORD_LENGTH } from "@/config/constants";

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

export function generatePassword(options: GeneratorOptions = {}): string {
  // TODO (Member 2): Implement cryptographic password generator using node:crypto
  const len = options.length ?? DEFAULT_PASSWORD_LENGTH;
  return "Placeholder@" + "1".repeat(Math.max(4, len - 12));
}

export function evaluateStrength(password: string): StrengthResult {
  // TODO (Member 2): Implement entropy & character-set strength evaluation
  const isLong = password.length >= 12;
  return {
    score: isLong ? 3 : 1,
    label: isLong ? "Good" : "Weak",
    entropyBits: password.length * 4,
  };
}
