"use client";

import { MIN_SAFE_ENTROPY_BITS } from "@/config/constants";
import { evaluateStrength } from "@/lib/passwordUtils";

export interface StrengthMeterProps {
  password: string;
  summaryId?: string;
  entropyId?: string;
}

function meterClass(score: number): string {
  if (score <= 1) return "weak";
  if (score === 2) return "fair";
  return "good";
}

export default function StrengthMeter({
  password,
  summaryId,
  entropyId,
}: StrengthMeterProps) {
  const strength = evaluateStrength(password);
  const meetsTarget = strength.entropyBits >= MIN_SAFE_ENTROPY_BITS;

  return (
    <div className="meter">
      <div className="meter-hint">
        <span>Strength</span>
        <span id={summaryId}>
          {strength.label} · {strength.score}/4
        </span>
      </div>
      <div
        className="meter-track"
        role="meter"
        aria-label="Password strength"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={strength.score}
        aria-valuetext={`${strength.label}, ${strength.score} out of 4`}
      >
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className={`meter-bar${
              index < strength.score
                ? ` filled ${meterClass(strength.score)}`
                : ""
            }`}
          />
        ))}
      </div>
      <div className="meter-hint">
        <span id={entropyId}>
          {strength.entropyBits} bits estimated entropy
        </span>
        <span
          style={{
            color: meetsTarget ? "var(--success)" : "var(--warning)",
          }}
        >
          {meetsTarget
            ? `Meets ${MIN_SAFE_ENTROPY_BITS}-bit target`
            : `Below ${MIN_SAFE_ENTROPY_BITS}-bit target`}
        </span>
      </div>
    </div>
  );
}
