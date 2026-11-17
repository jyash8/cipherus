# Server key auto-unlock — design

**Date:** 2026-11-17  
**Status:** Approved for planning  
**Scope:** First-run master password setup and server-side auto-unlock for the local Cipherus vault.

## Context

Cipherus currently requires the master password on every sensitive request. Nothing about the password is persisted, so the app cannot tell whether a master password has been set, and the user must re-enter it for reveal, save, audit, and export.

This design keeps the local-only model but moves the master password into a one-time setup step. The server derives a vault key from that password, stores the key in a permission-restricted local file, and uses it for every vault operation afterwards. There is no unlock prompt after setup.

This is a personal toy project. The tradeoffs below favor a simple workflow over protection against an attacker who can already read the project directory.

## Goals

- Detect on first launch whether the vault has been initialized.
- If not, prompt for a master password and create the vault key.
- Use that key automatically for all later vault and audit requests.
- Keep the master password itself out of the database and out of the key file.
- Bind the app to loopback, because the HTTP API no longer checks a password.

## Non-goals

- Changing the master password or rotating the key.
- Recovering a lost key file or forgotten password.
- Migrating credentials encrypted under the old per-request password scheme.
- Multi-user support, remote access, or API authentication.

## Security model

The key file is the lock. Anyone who can read it can decrypt the vault, and anyone who can reach the API while the server is running can operate the vault.

Mitigations:

- Default key path: `.cipherus/vault.key`, overridable with `CIPHERUS_KEY_FILE`.
- Directory created with mode `0700`; file created with mode `0600`. On platforms that ignore POSIX modes, permissions are best-effort.
- `.cipherus/` is added to `.gitignore`.
- `pnpm dev` and `pnpm start` bind to `127.0.0.1`, so the unauthenticated API is not exposed to the LAN.
- The key file contains a scrypt-derived key, not the master password. A leaked file still exposes the vault; a leaked file plus a reused password does not additionally expose the reused password.

Known limitations, accepted for this project:

- Reading the key file is equivalent to full vault access.
- Losing the key file makes existing credentials unreadable. Re-running setup erases them.
- A stolen database plus key file cannot be protected by the master password.

## Key file

```json
{
  "version": 1,
  "kdf": "scrypt",
  "salt": "<32 hex characters>",
  "key": "<64 hex characters>",
  "createdAt": "2026-11-17T00:00:00.000Z"
}
```

- `salt` is 16 random bytes.
- `key` is `scryptSync(masterPassword, salt, 32)`, hex-encoded.
- `version` and `kdf` exist so a future format can be recognized.
- The key is stored so the server does not need the password after setup.
- A missing file means uninitialized. An unreadable or malformed file is a fatal server error, not an invitation to overwrite it.

`src/lib/vaultKey.ts` owns all file access:

- `getVaultKeyPath()` — resolves `CIPHERUS_KEY_FILE` or `<cwd>/.cipherus/vault.key`; relative environment values resolve against the current working directory.
- `readVaultKey()` — returns the parsed key or `null` when the file is absent.
- `requireVaultKey()` — returns the key or throws `VaultNotInitializedError` when the file is missing; malformed files throw a distinct key-file error.
- `initializeVault(masterPassword)` — validates, generates the salt and key, and claims the file exclusively.
- `isVaultInitialized()` — parses the file and returns `true` only for a valid key; a missing file is `false`, a malformed file throws.

The file is created with an exclusive open (`wx`) so two setup requests cannot both succeed. It is written once and never rewritten. It is read per request rather than cached, so replacing the file takes effect on the next request.

## Crypto changes

`src/lib/crypto.ts` no longer derives a key per credential row.

```ts
deriveVaultKey(masterPassword: string, saltHex: string): Buffer
encryptSecret(plainText: string, key: Buffer): { iv, ciphertext, authTag }
decryptSecret(payload: SecretPayload, key: Buffer): string
```

- AES-256-GCM remains, with a fresh 12-byte IV per encryption.
- Payload fields stay hex-encoded.
- `credentials.salt` is removed. The vault salt lives in the key file.
- Decryption failures are server errors after setup, not authentication failures.

## API contracts

### `GET /api/vault/status`

Public gate used before rendering the shell.

```json
{ "initialized": true, "credentialCount": 3 }
```

- `200` with `initialized: false` when the key file is absent.
- `500 { "error": "Vault key file is unreadable" }` when the file exists but cannot be parsed.
- `500 { "error": "Failed to read vault status" }` on database failure.

### `POST /api/vault/setup`

Request:

```json
{ "masterPassword": "...", "resetExisting": true }
```

- `masterPassword` must be a string of 12–1024 characters. It is not trimmed.
- If the key file exists: `409 { "error": "Vault is already initialized" }`.
- If credentials exist and `resetExisting !== true`: `409` with `{ "error": "Existing credentials must be erased", "credentialCount": n }`.
- The key file is claimed first, then existing credentials are deleted when requested. This ordering avoids deleting data without having created a usable key.
- `201 { "initialized": true, "credentialCount": 0 }` on success.
- `500` if the key file or database cannot be written; the client shows the error and retries status.

### Vault routes

- `POST /api/vault` and all `POST`/`PUT`/`DELETE` operations on `/api/vault/[id]` call `requireVaultKey()`.
- `VaultNotInitializedError` maps to `409 { "error": "Vault is not initialized" }`; malformed or unreadable key files map to `500 { "error": "Vault key file is unreadable" }`.
- `masterPassword` is no longer read from request bodies. A legacy field is ignored.
- Reveal decrypts with the server key. A decryption failure returns `500 { "error": "Failed to decrypt vault entry" }`.
- Update encrypts a new password with the server key. Metadata-only updates do not touch ciphertext.
- Delete no longer needs to decrypt the row.

### Audit route

Request:

```json
{ "action": "audit" }
```

- `masterPassword` is removed.
- The route calls `requireVaultKey()` and returns `409` before setup.
- An empty vault returns a zero summary and empty findings for `audit`, and `{ "count": 0, "credentials": [] }` for `export`. The old "empty vault cannot verify the password" branch is removed.
- A decryption failure returns `500 { "error": "Failed to decrypt vault records" }`.

## Client flow

`AppShell` owns a `status` state: `"loading" | "setup" | "error" | "ready"`.

1. On mount, fetch `GET /api/vault/status`.
2. Loading: full-screen check card with a spinner.
3. Setup: render `SetupView` instead of the app bar and tabs.
4. Error: render the error card with a Retry action.
5. Ready: render the existing shell and views.

`SetupView`:

- Master password and confirmation fields with show/hide buttons.
- Strength and estimated entropy hint, reusing `evaluateStrength`.
- Minimum 12 characters, enforced client-side and server-side.
- When `credentialCount > 0`, a warning and a required checkbox: "I understand these N entries will be permanently erased."
- Submit calls `POST /api/vault/setup` with `{ masterPassword, resetExisting }`.
- Success calls `onInitialized`, which moves the shell to `ready` and bumps the vault refresh token.

## UI removals

- Vault session password bar and all master-password props.
- Master password field in the credential dialog.
- Master password field in the generator save panel.
- Audit password field, auto-run gating, and shared-password plumbing.
- "Incorrect master password" branches in reveal/copy/delete/audit.
- Status bar text becomes "Server vault key active".

The setup screen is the only place a master password is entered.

## Database

`src/db/schema.ts` removes `salt` from `credentials`. The table keeps metadata, `iv`, `ciphertext`, and `authTag`. The development database is empty, so no data migration is needed; `pnpm exec drizzle-kit push` applies the schema change. Re-running setup with existing rows deletes them.

## Files

New:

- `src/lib/vaultKey.ts`
- `src/components/SetupView.tsx`
- `src/app/api/vault/status/route.ts`
- `src/app/api/vault/setup/route.ts`

Modified:

- `src/db/schema.ts`
- `src/lib/crypto.ts`
- `src/app/api/vault/route.ts`
- `src/app/api/vault/[id]/route.ts`
- `src/app/api/audit/route.ts`
- `src/components/AppShell.tsx`
- `src/components/VaultWorkspace.tsx`
- `src/components/VaultTable.tsx`
- `src/components/CredentialForm.tsx`
- `src/components/PasswordGeneratorCard.tsx`
- `src/components/SecurityAuditCard.tsx`
- `src/app/cipherus.css`
- `package.json`
- `.gitignore`
- `AGENTS.md`

## Verification

1. `pnpm exec drizzle-kit push` on the empty development database.
2. `pnpm build`, `pnpm exec tsc --noEmit`, `pnpm lint`.
3. Fresh state: no `.cipherus/vault.key`, empty `credentials`.
4. `pnpm dev` reports only `127.0.0.1`; confirm the listener is loopback.
5. Browser: setup screen appears; vault APIs return `409` before setup; setting a 12+ character password creates `.cipherus/vault.key` with mode `0600`; the shell loads without another prompt.
6. Create, reveal, edit, and delete a credential; save from the generator; run audit and export.
7. Reload: no setup screen and no password prompt.
8. Remove the key file, reload: setup appears with the existing-entry warning and erase checkbox; confirm and set a new password.
9. Confirm `.cipherus/` is ignored by git.
10. Clean up: delete the test key file and test credentials so the user's next launch shows first-run setup.

## Risks

- The key file is a single point of failure. Back it up if the vault matters.
- The API is unauthenticated while the server runs; loopback binding is required.
- No password change or recovery flow exists.
- Running the app on a shared OS account gives every user of that account vault access.
