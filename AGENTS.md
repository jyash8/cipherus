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
- `better-sqlite3` is a native module; a failed install on Windows needs local build tools, not a code change.

## Architecture

- `@/*` maps to `src/*` (`tsconfig.json`).
- `src/app/page.tsx` is the dashboard and deliberately contains two "mounting slot" sections: password generator/audit (member 2) and encrypted vault (member 1). Components belong in `src/components/` (created by the vault work).
- `src/db/index.ts` exports a singleton `db` (better-sqlite3 + Drizzle with full schema). Never import it from client components — it can only run server-side.
- `src/db/schema.ts` has one `credentials` table: plaintext metadata (`siteName`, `siteUrl`, `username`, `category`) plus per-row `salt`, `iv`, `ciphertext`, `authTag`. Metadata is safe to list; secret columns must never be selected by list endpoints.
- Crypto contract (`src/lib/crypto.ts`): scrypt key derivation (32-byte key from master password + 16-byte salt) + AES-256-GCM with a 12-byte IV, all payload fields hex-encoded. The master password is user-supplied per request and never stored; do not introduce server-side sessions/keys for it.
- `src/lib/passwordUtils.ts` holds the generator/strength stubs; tuning constants live in `src/config/constants.ts`.

## Branch state (read before implementing)

- `main` and the current `feature-member2` branch are the scaffold + stubs. `origin/feature-member1` already contains the implemented crypto, `/api/vault` CRUD + reveal routes, and `VaultTable`/`CredentialForm`/`VaultWorkspace` — not merged here. Check `git log origin/feature-member1` / `git show` before reimplementing any vault, crypto, or API code.
- Expect merge conflicts in `src/app/page.tsx` and `src/config/constants.ts`: member 1 already raised `DEFAULT_PASSWORD_LENGTH` to 20 while this branch still has 16.
- Route handlers follow Next 16 conventions: dynamic `params` is a `Promise` and must be awaited; feature-member1 declares its own `type RouteContext = { params: Promise<{ id: string }> }`.

## Toolchain notes

- The generated Next.js block at the top of this file is rewritten by `next dev`; keep it committed instead of deleting it.
- `next.config.ts` enables `cacheComponents` and `partialPrefetching`, and wires Tailwind v4 through the Turbopack CSS rule (`@tailwindcss/turbopack`). There is no PostCSS config — don't add one.
- Run `pnpm install` before consulting `node_modules/next/dist/docs/`; the Next.js version is newer than most training data, so verify APIs (typed routes, caching) there rather than guessing.
