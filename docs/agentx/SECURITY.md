# Agent X — security & privacy

## What the app can access on the phone

| Permission                             | Why                                                     |
| -------------------------------------- | ------------------------------------------------------- |
| Microphone                             | Only while you hold / tap the mic button                |
| Notifications, exact alarms, boot      | Reminders, also after a restart                         |
| Internet, network state                | Gemini, Claude, your n8n                                |
| Fingerprint / biometric                | Optional app lock                                       |
| Vibrate, wake lock, foreground service | Reminders and audio (added by Expo / Android libraries) |

No contacts, SMS, call log, photos, camera, location or file storage. `SYSTEM_ALERT_WINDOW`, storage and Firebase push permissions
that the libraries add by default are removed (`android.blockedPermissions` in `apps/agentx/app.json`).

## Where data goes

| Destination                | What                                                                        |
| -------------------------- | --------------------------------------------------------------------------- |
| Phone (app-private SQLite) | All tasks, areas, systems, settings                                         |
| Android Keystore           | Gemini / Claude API keys (never in the database or backups)                 |
| Google Gemini              | The voice clip of each command                                              |
| Anthropic Claude           | The command text plus the task list it needs (today, overdue, next 7 days)  |
| Your n8n (optional)        | Only what you configure in Systems; HTTPS only (http just on local network) |

> **Gemini free tier:** Google may use content sent with free API keys to improve its products. Turn on billing for the key's project in
> Google AI Studio to keep voice clips out of that. Anthropic does not train on API data by default.

## Protections

- **Prompt injection:** text from inbox items, task titles and system replies is marked as data in the AI instructions, and deleting a
  task or running an action marked "Ask before running" needs a **Yes tap from you in an app dialog** — the AI can't approve it itself.
- **Webhooks:** HTTPS required; every request is signed (`X-AgentX-Signature`, HMAC-SHA256 with the system's secret).
- **App lock:** optional fingerprint / phone PIN on open and after 1 minute in the background (More → Security).
- **Lock screen:** optional "hide reminder details on the lock screen".
- **Backups:** the backup file has no keys or secrets, but it does contain your tasks — keep it somewhere private.

## Release signing key (one-time setup)

Builds are signed with React Native's public debug key until the repository has its own key. With the debug key, someone could build a
fake "update" that installs over Agent X and reads its data. To use your own key:

1. GitHub → **jambolk2255/claudedev → Settings → Secrets and variables → Actions → New repository secret**.
2. Add the four secrets from the `agentx-signing-secrets.txt` file (sent in the Claude session):
   `AGENTX_KEYSTORE_BASE64`, `AGENTX_KEYSTORE_PASSWORD`, `AGENTX_KEY_ALIAS`, `AGENTX_KEY_PASSWORD`.
3. Re-run the **Agent X APK** workflow (Actions → Agent X APK → Run workflow). The build log prints the signer; it should say
   `CN=Agent X` instead of `CN=Android Debug`.
4. On the phone: **More → Backup → Save a backup file**, uninstall the old Agent X once (different key), install the new APK, then
   **Restore from a backup file** and re-enter the API keys.

Keep the signing file safe (password manager). Later updates install over the app normally.
