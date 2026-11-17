# Contributing

1. Branch from `main`.
2. Make one focused change.
3. Run `pnpm lint`, `pnpm exec tsc --noEmit`, and `pnpm build`.
4. Open a pull request.
5. One teammate reviews, then merge and delete the branch.

Use Conventional Commits, e.g. `feat(vault): add edit dialog`.

Selected Implementation Commits:

- `c7e2ee8` — `feat(crypto): implement scrypt key derivation and AES-256-GCM vault encryption`
- `98a74ba` — `feat(lib): implement cryptographic password generator and strength evaluator`
- `8c26c9d` — `feat(vault): add first-run setup and server-key auto-unlock`

Branches:

- `feature-member1` — vault crypto, database, vault API and UI
- `feature-member2` — password generator, audit API and UI, export

Contributions:

- Yash Joshi — project setup, schema, crypto, vault APIs and UI, server key file, first-run setup
- Shresth Gupta — password generator library and UI, security audit API, audit dashboard, export, AGENTS.md

Code review: check no secrets are committed, vault mutations use `accessVaultKey()`, destructive actions need confirmation, server-only files aren't imported by client components, and lint/typecheck/build pass.

## Pull Requests and Code Reviews

| Pull Request | Author | Reviewer | Status |
|---|---|---|---|
| [PR #1](https://github.com/jyash8/cipherus/pull/1) | Yash Joshi | Shresth Gupta | Approved and merged |
| [PR #2](https://github.com/jyash8/cipherus/pull/2) | Shresth Gupta | Yash Joshi | Approved and merged |

Both members reviewed each other's contributions before the feature branches were integrated into the main branch.

## Merge Conflict Resolution

During collaborative development, both members modified the same line in `src/config/constants.ts` on their respective feature branches.

This resulted in a merge conflict during branch integration. The conflicting changes were inspected, manually resolved, and committed to complete the integration.

Screenshots documenting the conflict, resolution and final result are included in the project submission evidence.
