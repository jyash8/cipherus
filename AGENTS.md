<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Cipherus

Local-only password manager with encrypted credential storage: Next.js 16 App Router, React 19, Drizzle ORM + better-sqlite3, Tailwind v4. Team exercise built on two feature branches.

## Commands

- Use **pnpm** (`pnpm-lock.yaml` is the only lockfile; the npm lockfile was removed). `pnpm install`, `pnpm dev`, `pnpm build`, `pnpm start`.
- Lint: `pnpm lint` (flat ESLint config in `eslint.config.mjs`).
- Typecheck: `pnpm exec tsc --noEmit`, but run `pnpm dev` or `pnpm build` at least once first — route helpers like `LayoutProps<"/">` are global types generated into `.next/types` (see `tsconfig.json`), which a fresh clone does not have.
- There is no test script or test framework; do not add one unless asked.
- Database: `pnpm exec drizzle-kit push` creates/syncs `cipherus.db` in the repo root (schema in `src/db/schema.ts`). No migrations are committed and `out: "./drizzle"` does not exist yet; use `generate` only if you intend to start tracking them. Override the DB path with `DB_FILE_NAME`.
- Vault key: created on first run at `.cipherus/vault.key`, or at `CIPHERUS_KEY_FILE` when set (relative values resolve from the working directory). The directory is `0700` and the file `0600`; both are git-ignored. Delete it to return the app to first-run setup (existing credentials become unreadable).
- `better-sqlite3` is a native module; a failed install on Windows needs local build tools, not a code change.

## Architecture

- `@/*` maps to `src/*` (`tsconfig.json`).
- `src/app/page.tsx` renders `AppShell`, which owns the tab/theme shell and the first-run status gate. Components live in `src/components/`.
- `src/db/index.ts` exports a singleton `db` (better-sqlite3 + Drizzle with full schema). Never import it from client components — it can only run server-side.
- `src/db/schema.ts` has one `credentials` table: plaintext metadata (`siteName`, `siteUrl`, `username`, `category`) plus `iv`, `ciphertext`, `authTag`. Metadata is safe to list; secret columns must never be selected by list endpoints.
- Crypto contract (`src/lib/crypto.ts`): `scryptSync(masterPassword, salt, 32)` derives the vault key once (`deriveVaultKey`), then AES-256-GCM with a fresh 12-byte IV encrypts each secret. Payload fields are hex-encoded. The salt lives in the key file, not in the database.
- `src/lib/vaultKey.ts` owns key-file access (`getVaultKeyPath`, `readVaultKey`, `requireVaultKey`, `initializeVault`, `isVaultInitialized`) and `accessVaultKey()`, which maps key errors to `409`/`500`. `src/lib/api.ts` holds shared route helpers. Vault and audit routes call `accessVaultKey()`; there is no per-request master password and no server-side session. The API is intentionally unauthenticated, so `pnpm dev`/`pnpm start` bind to `127.0.0.1`.
- `src/lib/passwordUtils.ts` holds the generator/strength stubs; tuning constants live in `src/config/constants.ts`.

## Repository state

- `main` is the integrated app: `feature-member1` and `feature-member2` are merged, along with the Material shell and server-key auto-unlock work. There are no outstanding feature branches.
- Route handlers follow Next 16 conventions: dynamic `params` is a `Promise` and must be awaited; `src/app/api/vault/[id]/route.ts` declares `type RouteContext = { params: Promise<{ id: string }> }`.
- `docs/superpowers/` is local-only design material and is git-ignored. Keep tracked docs in `README.md`, `CONTRIBUTING.md`, and `docs/usage.md`.

## Toolchain notes

- The generated Next.js block at the top of this file is rewritten by `next dev`; keep it committed instead of deleting it.
- `next.config.ts` enables `cacheComponents` and `partialPrefetching`, and wires Tailwind v4 through the Turbopack CSS rule (`@tailwindcss/turbopack`). There is no PostCSS config — don't add one.
- Run `pnpm install` before consulting `node_modules/next/dist/docs/`; the Next.js version is newer than most training data, so verify APIs (typed routes, caching) there rather than guessing.
