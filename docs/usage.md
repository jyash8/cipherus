# Using Cipherus

## First run

Open <http://127.0.0.1:3000>. Enter a master password of 12+ characters twice, then click **Create vault**.

The password is not stored. A derived key is saved to `.cipherus/vault.key`, and later launches open the app directly.

If the key file is missing but entries exist, setup warns that they will be erased and asks you to confirm.

## Vault

- **New entry** — fill in site, username, password, optional URL and category, then **Save credential**.
- **Search** — use the app bar field.
- **Reveal/copy** — select an entry and use the eye or copy icon.
- **Edit** — select an entry, click **Edit**. Leave the password blank to keep it.
- **Delete** — select an entry, click **Delete**, confirm.

## Generator

Open **Generator**, choose length and character sets, then **Generate**. Use **Copy** or fill the save form and click **Save to vault**.

The strength meter is an estimate, not a guarantee.

## Audit

Open **Audit**. It runs automatically and shows weak, reused, duplicate, and stale entries.

**Export metadata** downloads JSON with site details only — no passwords or ciphertext.

## Settings

Use the gear icon to change accent color and background. These settings are saved in the browser.

## Backup and reset

Back up `cipherus.db` and `.cipherus/vault.key` together.

To reset: stop the server, delete `.cipherus/vault.key`, and start again. Setup will offer to erase existing entries. Deleting the key makes old entries unreadable.

Changing the master password is not supported.

## Troubleshooting

| Problem | Check |
| --- | --- |
| Setup keeps appearing | Is `.cipherus/vault.key` readable? Is `CIPHERUS_KEY_FILE` correct? |
| "Vault key file is unreadable" | Restore a backup or remove the file to reset. |
| "Vault is not initialized" | Reload and complete setup. |
| "Failed to decrypt vault entry" | The key does not match the database. Restore the right key file. |
| Cannot connect | Use `127.0.0.1`, not a LAN address. |
