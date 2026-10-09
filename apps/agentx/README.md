# Agent X — mobile app

Voice-first task & life manager (සිංහල + English). Phone-first: all data lives in SQLite on the phone; AI keys are entered in the app.
Product plan, voice commands and n8n setup: [`docs/agentx`](../../docs/agentx/PLAN.md).

```bash
cd apps/agentx
npm install          # standalone npm project (not part of the pnpm workspace)
npm test             # Vitest: core logic + AI tool-use loop (no device needed)
npm run typecheck
npx expo start       # needs a development build (native modules: sqlite, audio, notifications, …)
```

**APK:** every push that touches `apps/agentx` runs the **Agent X APK** GitHub Action, which typechecks, tests and builds a release APK
(artifact `agent-x-apk`, arm64).

| Folder              | What                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------- |
| `src/core`          | Pure TypeScript: dates, repeat rules, views, briefing, AI tools, prompt, n8n payloads |
| `src/ai`            | Gemini speech-to-text, Claude / Gemini tool-use sessions, key storage                 |
| `src/db`            | SQLite schema, migrations and repositories                                            |
| `src/notifications` | Local reminders, overdue nagging, daily briefing / review                             |
| `src/integrations`  | n8n actions, events outbox, inbox polling, backups                                    |
| `src/app`           | Screens (Expo Router)                                                                 |
