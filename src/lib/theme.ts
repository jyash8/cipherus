export const ACCENTS = {
  sky: { label: "Sky", primary: "#0ea5e9" },
  indigo: { label: "Indigo", primary: "#6366f1" },
  violet: { label: "Violet", primary: "#8b5cf6" },
  emerald: { label: "Emerald", primary: "#10b981" },
  rose: { label: "Rose", primary: "#f43f5e" },
  amber: { label: "Amber", primary: "#f59e0b" },
} as const;

export type AccentId = keyof typeof ACCENTS;

export const SURFACES = {
  black: { label: "Pure black" },
  slate: { label: "Slate gray" },
} as const;

export type SurfaceId = keyof typeof SURFACES;

export interface ThemeSettings {
  accent: AccentId;
  surface: SurfaceId;
}

export const DEFAULT_THEME: ThemeSettings = {
  accent: "sky",
  surface: "black",
};

export const THEME_STORAGE_KEY = "cipherus.theme.v1";
export const TAB_STORAGE_KEY = "cipherus.tab.v1";

export const VIEWS = ["home", "vault", "generator", "audit"] as const;

export type ViewId = (typeof VIEWS)[number];

export function isViewId(value: unknown): value is ViewId {
  return (
    typeof value === "string" && (VIEWS as readonly string[]).includes(value)
  );
}

export function isAccentId(value: unknown): value is AccentId {
  return typeof value === "string" && value in ACCENTS;
}

export function isSurfaceId(value: unknown): value is SurfaceId {
  return typeof value === "string" && value in SURFACES;
}

export function normalizeTheme(value: unknown): ThemeSettings {
  if (typeof value !== "object" || value === null) {
    return DEFAULT_THEME;
  }

  const candidate = value as { accent?: unknown; surface?: unknown };

  return {
    accent: isAccentId(candidate.accent) ? candidate.accent : DEFAULT_THEME.accent,
    surface: isSurfaceId(candidate.surface)
      ? candidate.surface
      : DEFAULT_THEME.surface,
  };
}

export function applyTheme(theme: ThemeSettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.accent = theme.accent;
  root.dataset.bg = theme.surface;
}

export function readStoredTheme(): ThemeSettings {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return raw === null ? DEFAULT_THEME : normalizeTheme(JSON.parse(raw));
  } catch {
    return DEFAULT_THEME;
  }
}

export function persistTheme(theme: ThemeSettings): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme));
  } catch {
    // Storage can be unavailable (private mode, quota). The in-memory theme
    // still applies for this session.
  }
}

export function readStoredView(): ViewId | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TAB_STORAGE_KEY);
    return isViewId(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function persistView(view: ViewId): void {
  try {
    window.localStorage.setItem(TAB_STORAGE_KEY, view);
  } catch {
    // Same as above: persistence is a convenience, not a requirement.
  }
}
