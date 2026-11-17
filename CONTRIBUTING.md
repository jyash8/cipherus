# Contributing

1. Branch from `main`.
2. Make one focused change.
3. Run `pnpm lint`, `pnpm exec tsc --noEmit`, and `pnpm build`.
4. Open a pull request.
5. One teammate reviews, then merge and delete the branch.

Use Conventional Commits, e.g. `feat(vault): add edit dialog`.

Commits so far:

- `c7e2ee8` — `feat(crypto): implement scrypt key derivation and AES-256-GCM vault encryption`
- `98a74ba` — `feat(lib): implement cryptographic password generator and strength evaluator`
- `9341c95` — `feat(vault): add first-run setup and server-key auto-unlock`

Branches:

- `feature-member1` — vault crypto, database, vault API and UI
- `feature-member2` — password generator, audit API and UI, export

Contributions:

- Yash Joshi — project setup, schema, crypto, vault APIs and UI, server key file, first-run setup
- Shresth Gupta — password generator library and UI, security audit API, audit dashboard, export, AGENTS.md

Code review: check no secrets are committed, vault mutations use `accessVaultKey()`, destructive actions need confirmation, server-only files aren't imported by client components, and lint/typecheck/build pass.
