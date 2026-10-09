# Agent X — Voice-first Task & Life Manager — Plan

> "N810" → self-hosted **n8n** කියලා assume කරලා තියෙන්නේ.

## Context (ඇයි මේක හදන්නේ)

Digital agency එක, අනිත් business, education, personal, finance — හැම වැඩක්ම එක ගොඩට පැටලිලා. Meetings, submissions, tasks අමතක වෙනවා,
timeline/plan එකක් හදාගන්න බෑ. දැනට තියෙන systems වලට log වුණොත් විතරයි notification එන්නේ. Phone එක හැමවෙලේම අතේ — ඉතින්
**phone එකේ voice එකෙන් (සිංහල/English) කතා කරලා** tasks add/update/complete කරන්න, reminders/overdue/upcoming මතක් කරන, n8n හරහා agency
systems එක්ක connect වෙන app එකක් — **Agent X**. පස්සේ SaaS product එකක් විදිහට monetize කරන්නත් බලාපොරොත්තුයි.

## Decisions so far

| Topic        | Decision                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------- |
| Name         | **Agent X**                                                                                 |
| Colours      | Royal blue `#2D5BFF` + near-black `#0B0D12` + white `#FFFFFF`; **dark theme default**       |
| Storage      | **Phone-first** (SQLite on the phone) + backups; optional sync server later (team/WhatsApp) |
| AI keys      | User enters Gemini / Claude keys **inside the app** (Settings → API keys, secure storage)   |
| Integrations | **n8n is the hub** between Agent X and every other system                                   |
| WhatsApp     | Later (structure ready)                                                                     |
| APK          | Built by **GitHub Actions** on every push → download artifact `agent-x-apk`                 |
| Code         | `apps/agentx` (Expo, standalone npm project) in this monorepo; StockFlow is untouched       |

## Data phone එකේ save කරන එක — අවුලක් තියෙනවද?

**කරන්න පුළුවන්, MVP එකට ඒක තමයි හොඳම විදිහ.**

- ✅ Server එකක් ඕන නෑ — APK එක install කරපු ගමන් වැඩ.
- ✅ Internet නැතුවත් tasks, reminders, notifications වැඩ (reminders phone එකේම schedule වෙනවා).
- ✅ Data ඔයාගේ phone එකේ විතරයි. AI එකට යන්නේ ඔයා කියන command එක (audio/text) විතරයි.
- ⚠️ Phone එක නැති වුණොත් / reset කළොත් data නැති වෙනවා → **Backup**: Settings එකෙන් backup file එකක් save කරන්න, සහ n8n
  "backup webhook" එකකට දිනපතා auto backup (n8n → Google Drive). Restore එකත් app එකේම.
- ⚠️ Team (workers) සහ WhatsApp වලට එකම data එක කිහිප දෙනෙක්ට පේන්න ඕන නිසා **shared server එකක්** ඕන වෙනවා → v0.3 දී optional
  **sync server** එකක් එකතු කරනවා. ඒකට ලේසි වෙන්න දැන්ම හැම record එකකටම UUID id, `updatedAt`, `deletedAt` තියෙනවා.
- 🔐 API keys Android Keystore (`expo-secure-store`) එකේ encrypt වෙලා තියෙන්නේ. Backup file එකට keys යන්නේ නෑ.

## Systems linkage — අනිත් systems එක්ක connect වෙන්නේ කොහොමද?

Agent X හැම system එකකටම වෙන වෙනම connect කරන්නේ නෑ. **n8n තමයි adapter / hub එක**:

```
 Agent X (phone)  ⇄  n8n (ඔයාගේ self-hosted)  ⇄  Agency CRM · HR · Ads · Shop POS · Google Drive · WhatsApp (later)
```

App එකේ **Systems** tab එකේ ඔයාට ඕන තරම් systems එකතු කරන්න පුළුවන් (නම, icon, n8n URL, secret). එක system එකකට කොටස් 3ක්:

1. **⚡ Voice actions (Agent X → system, on demand)** — action එකක් = නම + "කියන්නේ මෙහෙමයි" description + n8n webhook URL + params
   (උදා: `clientName`) + "confirm first". AI එකට මේ actions tools විදිහට පේනවා. "Perera Holdings onboarding start කරන්න" කිව්වම →
   n8n webhook එකට `POST {action, params}` → n8n එකේ workflow එක CRM/Drive/email වැඩ කරලා `{"say": "…"}` return කරනවා → Agent X ඒක
   කියවනවා.
2. **📤 Events (Agent X → system, automatic)** — `task.created`, `task.completed`, `task.overdue` toggle කරන්න පුළුවන්. Event එකක් වුණාම app
   එක n8n events webhook එකට JSON එකක් යවනවා (`X-AgentX-Signature` HMAC-SHA256 header එකත් එක්ක). Offline නම් outbox එකේ තියාගෙන පස්සේ
   යවනවා.
3. **📥 Inbox (system → Agent X)** — n8n "inbox" webhook URL එකක් දුන්නොත් app එක open කරද්දී සහ background එකේ (~15 min) ඒක check කරනවා.
   n8n `[{ "type": "task", "title": "...", "dueAt": "...", "area": "Agency" }, { "type": "notify", "title": "...", "body": "..." }]` වගේ
   return කරාම Agent X ඒවා tasks / notifications විදිහට දානවා. (උදා: CRM එකේ අලුත් lead එකක් → Agent X task + notification.)

මේ විදිහට **අලුත් system එකක් connect කරන්න app code වෙනස් කරන්න ඕන නෑ** — n8n workflow එකක් හදලා Systems එකට URL එක දැම්මම ඇති.
Sample n8n workflows and a step-by-step setup guide: [`n8n/README.md`](./n8n/README.md).

### Payload formats

| Direction | Request                                                                                                                     | Response                                      |
| --------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Action    | `POST <action URL>` `{ "action": "client_onboarding", "params": {…}, "sentAt": "…", "app": "agentx" }`                      | `{ "say": "text to speak", "tasks"?: [...] }` |
| Event     | `POST <events URL>` `{ "event": "task.completed", "task": {…}, "sentAt": "…" }`                                             | any 2xx                                       |
| Inbox     | `GET <inbox URL>?since=<ISO>`                                                                                               | `[{ "type": "task" \| "notify", … }]`         |
| Backup    | `POST <backup URL>` `{ "version": 1, "exportedAt": "…", "areas": [...], "tasks": [...], "systems": [...] }`                 | any 2xx                                       |
| Signature | header `X-AgentX-Signature: sha256=<hex HMAC-SHA256 with the system secret>` of the body (POST) or query string (inbox GET) |                                               |

## Features — v0.1 (this build)

- **Voice assistant** — centre 🎤 button: hold to talk (or type). සිංහල / English / Singlish. Assistant asks follow-up questions ("කීයටද?"),
  confirms destructive actions, speaks replies (phone's Google TTS, `si-LK`). See [`VOICE_COMMANDS.md`](./VOICE_COMMANDS.md).
- **Tasks** — title, notes, area, due date/time, priority, reminders, repeat (daily/weekly/monthly/custom RRULE), amount (bills), assignee
  name (text for now).
- **Views** — Today (overdue first, red), Upcoming (7 days), Areas.
- **Reminders** — local notifications with **Done / Snooze 1h** buttons, overdue nagging (interval), quiet hours, 7:00 morning briefing,
  20:00 evening review.
- **Customizable Areas** — add/rename/icon/reorder/delete (Agency, Business, Education, Personal, Finance seeded).
- **Systems** — n8n linkage above.
- **Settings** — language, theme (dark default), speech on/off, API keys, reminder times, backup export/import + backup webhook.

## Architecture (v0.1, phone-first)

```
┌─────────────────────────── Agent X (Android APK, Expo) ───────────────────────────┐
│ UI (Expo Router)  ──►  core (pure TS: dates, RRULE, views, AI tools, briefing)     │
│      │                    │                                                       │
│ expo-audio (record)   SQLite (tasks, areas, systems, actions, outbox, settings)   │
│ expo-speech (TTS)     expo-notifications (scheduled reminders, actions)           │
│ secure-store (keys)   background task (inbox poll, outbox flush, auto backup)     │
└──────┬───────────────────────────────┬───────────────────────────────┬───────────┘
       │ audio                          │ text + tools                   │ webhooks
   Gemini API (speech→text)       Claude API (tool calling)          n8n (self-hosted)
```

- **Speech-to-text**: Gemini (audio in → transcript), good with Sinhala + Singlish.
- **Understanding**: Claude tool calling. If only a Gemini key is set, Gemini function calling is used instead.
- **Text-to-speech**: on-device (`expo-speech`), free.
- **Cost**: ~$0.002–0.01 per command → personal use ~$3–10 / month.

## Roadmap

| #   | Milestone            | Deliverable                                                                                           |
| --- | -------------------- | ----------------------------------------------------------------------------------------------------- |
| S1  | Plan + UI            | ✅ this folder, [`ui-prototype.html`](./ui-prototype.html)                                            |
| M1  | Phone app v0.1       | Tasks, voice, reminders, areas, systems (n8n), backup, settings → **APK via GitHub Actions**          |
| M2  | Polish from real use | Sinhala prompt tuning from voice logs, home-screen widget / quick tile, reports screen, calendar view |
| M3  | Sync server + team   | Optional self-hosted server (on the n8n VPS): multi-device sync, workers, assign, team view           |
| M4  | WhatsApp             | WhatsApp Cloud API via n8n or the sync server: voice-note commands, reminders, worker replies         |
| P2  | Product / SaaS       | Accounts, plans, PayHere billing (reuse StockFlow billing), Play Store                                |

## Code layout

| Path                               | What                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `apps/agentx/`                     | Expo SDK 56 app (standalone npm project, excluded from the pnpm workspace) |
| `apps/agentx/src/core/`            | Pure TypeScript logic, unit-tested with Vitest                             |
| `apps/agentx/src/db/`              | SQLite schema, migrations, repositories                                    |
| `apps/agentx/src/ai/`              | Gemini speech-to-text, Claude / Gemini agent loop                          |
| `apps/agentx/src/notifications/`   | Reminder scheduling and notification actions                               |
| `apps/agentx/src/integrations/`    | n8n actions, events outbox, inbox poll, backup                             |
| `.github/workflows/agentx-apk.yml` | Typecheck + tests + Android release APK artifact                           |
| `docs/agentx/n8n/`                 | Sample n8n workflows                                                       |

## Install the APK

1. Phone එකේ browser එකෙන් මේ link එක open කරන්න (හැම push එකකටම අලුත් build එකකින් update වෙනවා):
   **https://github.com/jambolk2255/claudedev/releases/download/agentx-latest/agent-x.apk**
2. Download වුණාම `agent-x.apk` open කරන්න → Chrome / Files app එකට "Install unknown apps" allow කරන්න → **Install**.
3. Agent X → **තව → AI API keys** → Gemini key (aistudio.google.com) සහ Claude key (console.anthropic.com) paste කරන්න.
4. Notifications සහ microphone permission දෙන්න.

(GitHub → Actions → **Agent X APK** run එකේ `agent-x-apk` artifact එකෙනුත් ගන්න පුළුවන් — ඒකට GitHub login එකක් ඕන.)
