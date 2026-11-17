"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Menu, Search, Settings as SettingsIcon } from "lucide-react";
import { APP_NAME } from "@/config/constants";
import {
  ACCENTS,
  DEFAULT_THEME,
  SURFACES,
  TAB_STORAGE_KEY,
  THEME_STORAGE_KEY,
  applyTheme,
  persistTheme,
  persistView,
  readStoredTheme,
  readStoredView,
  type AccentId,
  type SurfaceId,
  type ThemeSettings,
  type ViewId,
} from "@/lib/theme";
import HomeView from "./HomeView";
import Modal from "./Modal";
import PasswordGeneratorCard from "./PasswordGeneratorCard";
import SecurityAuditCard from "./SecurityAuditCard";
import VaultWorkspace from "./VaultWorkspace";

const NAV_ITEMS: ReadonlyArray<{ id: ViewId; label: string }> = [
  { id: "home", label: "Home" },
  { id: "vault", label: "Vault" },
  { id: "generator", label: "Generator" },
  { id: "audit", label: "Audit" },
];

const VIEW_LABELS: Record<ViewId, string> = {
  home: "Home",
  vault: "Vault",
  generator: "Generator",
  audit: "Audit",
};

export default function AppShell() {
  const [view, setView] = useState<ViewId>("home");
  const [theme, setTheme] = useState<ThemeSettings>(() => readStoredTheme());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [masterPassword, setMasterPassword] = useState("");
  const [search, setSearch] = useState("");
  const [vaultRefreshToken, setVaultRefreshToken] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  const snackTimer = useRef<number | null>(null);

  // Restore the last tab after hydration. The server always renders Home, so
  // this cannot be read during render without a hydration mismatch.
  useEffect(() => {
    const stored = readStoredView();
    if (stored !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setView(stored);
    }
  }, []);

  // Re-apply on mount (React Strict Mode clears attributes it does not manage
  // during the development remount) and whenever the theme changes.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === THEME_STORAGE_KEY) {
        setTheme(readStoredTheme());
      } else if (event.key === TAB_STORAGE_KEY) {
        const stored = readStoredView();
        if (stored !== null) setView(stored);
      }
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    return () => {
      if (snackTimer.current !== null) {
        window.clearTimeout(snackTimer.current);
      }
    };
  }, []);

  const notify = useCallback((message: string) => {
    setSnack(message);
    if (snackTimer.current !== null) {
      window.clearTimeout(snackTimer.current);
    }
    snackTimer.current = window.setTimeout(() => {
      setSnack(null);
      snackTimer.current = null;
    }, 4000);
  }, []);

  const navigate = useCallback((next: ViewId) => {
    setView(next);
    setDrawerOpen(false);
    persistView(next);
  }, []);

  const updateTheme = useCallback((next: ThemeSettings) => {
    setTheme(next);
    applyTheme(next);
    persistTheme(next);
  }, []);

  const handleVaultChanged = useCallback(() => {
    setVaultRefreshToken((token) => token + 1);
  }, []);

  const handleGeneratorSaved = useCallback(
    (message: string) => {
      handleVaultChanged();
      notify(message);
    },
    [handleVaultChanged, notify],
  );

  const resetTheme = useCallback(() => {
    updateTheme(DEFAULT_THEME);
  }, [updateTheme]);

  return (
    <>
      <div className="app">
        <header className="m-appbar">
          <button
            type="button"
            className={`m-iconbtn menu-btn${view === "vault" ? "" : " hidden"}`}
            onClick={() => setDrawerOpen((open) => !open)}
            aria-label="Show categories"
            title="Categories"
            aria-controls="vault-drawer"
            aria-expanded={drawerOpen}
          >
            <Menu width={22} height={22} aria-hidden="true" />
          </button>

          <button
            type="button"
            className="brand"
            onClick={() => navigate("home")}
            aria-label="Go to home"
          >
            <span className="logo" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5Zm-3 8V6a3 3 0 0 1 6 0v3H9Zm3 5a1.5 1.5 0 0 1 1 2.8V18h-2v-1.2A1.5 1.5 0 0 1 12 14Z" />
              </svg>
            </span>
            <span className="title">{APP_NAME}</span>
          </button>

          <nav className="seg-nav" aria-label="Sections">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`seg${view === item.id ? " active" : ""}`}
                onClick={() => navigate(item.id)}
                aria-current={view === item.id ? "page" : undefined}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {view === "vault" && (
            <div className="search">
              <Search className="search-icon" aria-hidden="true" />
              <input
                className="search-input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search site, username, or URL"
                aria-label="Search credentials"
                id="vault-search"
              />
            </div>
          )}

          <div className="appbar-actions">
            <button
              type="button"
              className="m-iconbtn"
              onClick={() => setSettingsOpen(true)}
              aria-label="Open settings"
              title="Settings"
            >
              <SettingsIcon width={22} height={22} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="layout">
          {view === "vault" ? (
            <VaultWorkspace
              masterPassword={masterPassword}
              onMasterPasswordChange={setMasterPassword}
              refreshToken={vaultRefreshToken}
              onChanged={handleVaultChanged}
              search={search}
              drawerOpen={drawerOpen}
              onDrawerClose={() => setDrawerOpen(false)}
              onNotify={notify}
            />
          ) : (
            <main className="content" id="main-content">
              {view === "home" && (
                <HomeView
                  refreshToken={vaultRefreshToken}
                  onNavigate={navigate}
                />
              )}

              {view === "generator" && (
                <PasswordGeneratorCard
                  masterPassword={masterPassword}
                  onMasterPasswordChange={setMasterPassword}
                  onSaved={handleGeneratorSaved}
                  onNotify={notify}
                />
              )}

              {view === "audit" && (
                <SecurityAuditCard
                  active={view === "audit"}
                  masterPassword={masterPassword}
                  onMasterPasswordChange={setMasterPassword}
                  onNotify={notify}
                />
              )}
            </main>
          )}
        </div>

        <footer className="m-statusbar">
          <span>{VIEW_LABELS[view]}</span>
          <span>Local encrypted vault</span>
          <span className="spacer" />
          <span>
            {masterPassword.trim() === ""
              ? "Master password not entered"
              : "Master password in memory"}
          </span>
        </footer>
      </div>

      <Modal
        open={settingsOpen}
        title="Settings"
        onClose={() => setSettingsOpen(false)}
        initialFocusSelector="#settings-done"
        footer={
          <>
            <button
              type="button"
              className="m-btn text"
              onClick={resetTheme}
            >
              Reset
            </button>
            <button
              type="button"
              id="settings-done"
              className="m-btn contained"
              onClick={() => setSettingsOpen(false)}
            >
              Done
            </button>
          </>
        }
      >
        <div className="settings-row">
          <h4>Accent color</h4>
          <div className="settings-swatches">
            {(Object.keys(ACCENTS) as AccentId[]).map((accent) => (
              <button
                key={accent}
                type="button"
                className={`swatch${theme.accent === accent ? " active" : ""}`}
                style={{ background: ACCENTS[accent].primary }}
                onClick={() =>
                  updateTheme({ ...theme, accent })
                }
                title={ACCENTS[accent].label}
                aria-label={`${ACCENTS[accent].label} accent`}
                aria-pressed={theme.accent === accent}
              />
            ))}
          </div>
        </div>

        <div className="settings-row">
          <h4>Background</h4>
          <div className="bg-pills">
            {(Object.keys(SURFACES) as SurfaceId[]).map((surface) => (
              <button
                key={surface}
                type="button"
                className={`bg-pill${theme.surface === surface ? " active" : ""}`}
                onClick={() =>
                  updateTheme({ ...theme, surface })
                }
                aria-pressed={theme.surface === surface}
              >
                {SURFACES[surface].label}
              </button>
            ))}
          </div>
        </div>

        <p className="muted">
          Accent color, background, and the active tab are saved in this browser.
        </p>
      </Modal>

      <div
        className={`m-snackbar${snack !== null ? " open" : ""}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span>{snack ?? ""}</span>
        <button
          type="button"
          className="action"
          onClick={() => setSnack(null)}
        >
          OK
        </button>
      </div>
    </>
  );
}
