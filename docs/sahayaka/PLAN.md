# Sahayaka (සහායක) — Voice-first Task & Life Manager — Plan

> Working name: **Sahayaka**. Rename කරන්න පුළුවන්. ("N810" කියලා කිව්වේ self-hosted **n8n** කියලා assume කරලා තියෙන්නේ.)

## Context (ඇයි මේක හදන්නේ)

Digital agency එක, අනිත් business, education, personal, finance — හැම වැඩක්ම එක ගොඩට පැටලිලා. Meetings, submissions, tasks අමතක වෙනවා, timeline/plan එකක් හදාගන්න බෑ. දැනට තියෙන systems වලට log වුණොත් විතරයි notification එන්නේ. Phone එක හැමවෙලේම අතේ — ඉතින් **phone එකේ voice එකෙන් (සිංහල/English) කතා කරලා** tasks add/update/complete කරන්න, reminders/overdue/upcoming push කරන, WhatsApp එකෙනුත් වැඩ කරන, workers ලාටත් tasks දෙන්න පුළුවන්, n8n හරහා agency systems එක්ක connect වෙන app එකක් ඕන. පස්සේ මේක **SaaS product එකක් විදිහට monetize** කරන්නත් බලාපොරොත්තුයි — ඉතින් මුල ඉඳන්ම multi-tenant විදිහට හදනවා.

**තීරණ (ඔයාගේ උත්තර):** same monorepo, separate product · Cloud AI (cost අඩුවෙන්) · n8n VPS එකේම host · MVP = voice tasks + reminders, WhatsApp bot, team/workers, n8n integration.

## Process (පිළිවෙළ)

1. **Step 1 — Product plan doc + UI design** (approve කරාට පස්සේ මුලින්ම කරන්නේ මේක): `docs/sahayaka/` යටතේ feature spec, data model, voice command catalogue, roadmap, සහ **clickable HTML UI prototype** එකක් (phone-size screens). ඔයා review කරලා OK කියනකම් code ලියන්නේ නෑ.
2. **Step 2 — Development**, milestones M1→M4 (පහළ). හැම milestone එකක් අවසානයේ APK එකක් build කරලා try කරන්න දෙනවා.

## 1. Features (MVP)

### A. Voice assistant (core)

- Home screen එකේ ලොකු **mic button** (press-and-hold හෝ tap-to-talk) + Android **quick-settings tile / home widget** (M2) — app එක open නොකර කතා කරන්න.
- සිංහල, English, Singlish mix තේරුම් ගන්නවා. උදා:
  - "හෙට උදේ 10ට ABC client එක්ක meeting එකක් තියෙනවා, පැයකට කලින් මතක් කරන්න"
  - "අද කරන්න තියෙන්නේ මොනවද?" → app එක සිංහලෙන් **කියවනවා**
  - "Logo design task එක complete කරන්න" / "ඒක සිකුරාදාට දාන්න"
  - "හැම සඳුදාම උදේ 9ට team meeting" (recurring)
  - "කසුන්ට හෙට 5ට කලින් Facebook post 3ක් දෙන්න කියලා task එකක් දාන්න" (assign)
  - "New client onboarding workflow එක start කරන්න — client නම Perera Holdings" (n8n)
- නැති info තියෙනවා නම් assistant එක **ප්‍රශ්න අහනවා** ("කීයටද?", "කාටද assign කරන්නේ?") — multi-turn conversation, mic එක auto re-open.
- Delete / bulk changes වගේ දේවල් වලට voice confirmation ("ඔව්" / "නෑ").
- Typing optional — හැමදේම voice එකෙන් කරන්න පුළුවන්, ඒත් manual edit UI එකත් තියෙනවා.

### B. Tasks, planning & reminders

- Task: title, notes, **Area** (Agency / Business / Education / Personal / Finance — custom), project, due date/time, priority, assignee, status, amount (finance bills වලට), attachments (voice note).
- **Recurring**: daily / weekly / monthly / custom (RRULE). Complete කරාම ඊළඟ occurrence auto හැදෙනවා.
- **Smart views**: Today, **Overdue** (රතු, top එකේ), Upcoming (7 days), By Area, Timeline/calendar.
- **Reminders** server-side (phone එක off වුණත් miss වෙන්නේ නෑ) → push notification + WhatsApp + device local backup.
- **Overdue nagging**: overdue task එකක් complete කරනකම් configurable interval එකකින් මතක් කරනවා; "snooze 1h / හෙටට දාන්න" notification actions.
- **Morning briefing** (උදා 7:00) — අද tasks, meetings, overdue — voice එකෙන් කියවනවා / WhatsApp voice-friendly summary. **Evening review** — අද ඉවර නොවුණ ඒවා reschedule කරන්න අහනවා.
- Task complete කරාම assistant එක confirm කරලා කියවනවා ("හරි, logo design complete. අදට තව 3ක් ඉතුරුයි").

### C. WhatsApp bot

- ඔයාගේ WhatsApp එකෙන් bot number එකට **voice message හෝ text** යවලා same commands (task add/query/complete).
- Reminders, overdue alerts, morning briefing WhatsApp එකට.
- Workers ලාටත් ඔවුන්ගේ tasks WhatsApp එකෙන් ("done" reply කරලා complete කරන්න පුළුවන්).
- **Official WhatsApp Business Cloud API** (Meta) — monetize කරන product එකකට ban risk නැති එකම විදිහ. අලුත් number එකක් + Meta Business verification ඕන. 24h window එකෙන් පිට reminders වලට approved _utility templates_.

### D. Team / workers

- Workspace (organization) → members: **Owner, Manager, Worker**.
- Task assign, worker ට push/WhatsApp notification, status updates owner ට.
- Worker ට app login හෝ **WhatsApp-only** mode (app install නොකර).
- Team view: කාට මොනවා pending, overdue කාගේද.
- (HR/recruitment වලට දැනට තියෙන system එක replace කරන්නේ නෑ — n8n හරහා connect කරනවා.)

### E. n8n + agency systems integration

- **Outbound webhooks** (HMAC signed): `task.created`, `task.completed`, `task.overdue`, `reminder.fired` → n8n → agency systems.
- **Inbound API** (API keys): n8n/other systems වලට tasks create/update කරන්න, notifications push කරන්න (උදා: agency system එකේ new lead → app එකට task + notification).
- **Voice-callable "Actions"**: Settings එකේ n8n workflows register කරනවා (name, description, webhook URL, parameter schema). AI එකට ඒවා tools විදිහට පේනවා → "Client report එක generate කරන්න" කිව්වම අදාළ n8n workflow එක trigger වෙලා result එක කියවනවා. **මේක තමයි scalable automation core එක** — අලුත් system එකක් connect කරන්න app code වෙනස් කරන්න ඕන නෑ, n8n workflow එකක් add කරාම ඇති.

### F. Reports

- Daily / weekly: completed vs overdue, by Area, by worker, recurring adherence.
- In-app charts + WhatsApp summary + voice ("මේ සතියේ මම කොච්චර වැඩ කරාද?"). PDF export Phase 2.

### Phase 2+ (MVP එකෙන් පස්සේ)

Google Calendar sync · Email/Gmail → tasks · location-based reminders (map) · finance module (income/expenses, bill tracking) · WhatsApp voice replies (TTS audio) · web dashboard · AI weekly planning ("මේ සතියේ plan එක හදලා දෙන්න") · **SaaS billing** (StockFlow PayHere code reuse) · Play Store release · iOS.

## 2. Architecture

```
Expo app (Android APK) ──HTTPS──► sahayaka-api (NestJS/Fastify)
  mic → audio upload                ├─ Voice pipeline: STT → Claude (tool calling) → reply text
  TTS (device සිංහල voice)          ├─ Postgres (Prisma, multi-tenant organizationId)
  push + local notifications        ├─ Redis + BullMQ: reminders, nagging, briefings, recurring
                                    ├─ WhatsApp Cloud API webhook ⇄ same voice/command pipeline
                                    └─ n8n: outbound signed webhooks / inbound API keys / Actions
All on the existing n8n VPS via Docker Compose (Caddy/Traefik TLS).
```

- **Speech-to-text**: Gemini Flash audio (Sinhala + Singlish mix හොඳින්, අඩු මිල); fallback Google Speech-to-Text v2 `si-LK`. Provider interface එකක් පිටුපස — පස්සේ මාරු කරන්න ලේසි.
- **Command understanding**: Claude (latest cost-efficient model, implementation වෙලාවේ `claude-api` skill එකෙන් model id confirm කරනවා) with **tool calling**: `create_task`, `update_task`, `complete_task`, `reschedule_task`, `list_tasks`, `create_recurring`, `assign_task`, `get_report`, `run_action` (n8n), `ask_clarification`. Context එකට user timezone (Asia/Colombo), today, areas, team members, recent tasks යවනවා.
- **Text-to-speech**: device Google TTS (`si-LK`) via `expo-speech` — free. Premium cloud voice පස්සේ option එකක්.
- **Notifications**: Expo Push (FCM) + server schedule; `expo-notifications` local backup + action buttons (Done / Snooze).
- **Cost estimate (MVP, 1 user + small team)**: STT + LLM ≈ $0.002–0.01 per command → මාසෙට ~$3–10. WhatsApp service replies free (24h window), utility templates ලංකාවට cents ගණනක්.

## 3. Repo layout & reuse (same monorepo, separate product)

| New path                    | What                                                                  | Reuse from StockFlow                                                                                                                                                                                                                                           |
| --------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/sahayaka-api`         | NestJS 11 + Fastify + Prisma 6, own DB `sahayaka`                     | auth/token/2FA patterns (`apps/api/src/modules/auth/*`), `common/{crypto,guards,decorators,zod.pipe,exception.filter}.ts`, tenant-scoping Prisma extension (`apps/api/src/prisma/prisma.service.ts`), later billing/PayHere (`apps/api/src/modules/billing/*`) |
| `apps/sahayaka-mobile`      | Expo SDK 56, Expo Router, standalone npm project (like `apps/mobile`) | `apps/mobile/src/lib/{api,auth,storage,i18n,theme}.ts(x)`, `components/ui.tsx`, `eas.json` APK profile, `AGENTS.md` rules                                                                                                                                      |
| `packages/sahayaka-schemas` | Zod schemas + AI tool definitions shared by API & mobile              | pattern from `packages/schemas`                                                                                                                                                                                                                                |
| `docker/`                   | add `sahayaka` services (api, postgres, redis) to compose             | `docker/docker-compose.yml`, `apps/api/Dockerfile`                                                                                                                                                                                                             |
| `docs/sahayaka/`            | plan, spec, UI prototype                                              | —                                                                                                                                                                                                                                                              |

Shared code is **copied & adapted**, not imported, so StockFlow is never affected. `pnpm-workspace.yaml` excludes the mobile app (like `!apps/mobile`).

### Core data model (Prisma)

`Organization` · `User` · `Membership(role)` · `Area` · `Project` · `Task(areaId, projectId, assigneeId, dueAt, remindAt[], priority, status, amount, recurrenceId, source: app|voice|whatsapp|api)` · `Recurrence(rrule, nextAt)` · `Reminder(taskId, fireAt, channel, sentAt)` · `VoiceCommand(transcript, toolCalls, reply, latencyMs)` (debug + improve Sinhala accuracy) · `WhatsAppLink(phone, userId)` · `Integration/Action(name, description, webhookUrl, paramsSchema)` · `ApiKey` · `WebhookSubscription` · `AuditLog`.

### API outline (M1–M4)

| Method & path                                                           | Purpose                                                           | Milestone |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------- | --------- |
| `POST /auth/register` · `/auth/login` · `/auth/refresh`                 | Owner sign-up, bearer tokens for mobile (`x-client: mobile`)      | M1        |
| `GET/POST/PATCH/DELETE /tasks` · `POST /tasks/:id/complete` · `/snooze` | Task CRUD + actions                                               | M1        |
| `GET /views/today` · `/views/upcoming` · `/views/overdue`               | Smart views                                                       | M1        |
| `GET/POST /areas` · `/projects`                                         | Life areas & projects                                             | M1        |
| `POST /voice/command` (multipart audio or `{text}`, `conversationId`)   | STT → Claude tools → `{transcript, reply, actions[], needsReply}` | M1        |
| `GET /briefing/today`                                                   | Morning briefing text (spoken by device TTS)                      | M1        |
| `POST /devices`                                                         | Register Expo push token                                          | M1        |
| `GET/POST /whatsapp/webhook`                                            | Meta verification + incoming messages                             | M2        |
| `GET/POST /members` · `POST /invites`                                   | Team                                                              | M3        |
| `GET /reports/weekly`                                                   | Reports                                                           | M3        |
| `GET/POST /actions` · `/webhooks` · `/api-keys`                         | n8n integration settings                                          | M4        |
| `POST /public/v1/tasks` · `/public/v1/notify` (API key)                 | Inbound from n8n / agency systems                                 | M4        |

See [`VOICE_COMMANDS.md`](./VOICE_COMMANDS.md) for the voice command catalogue and AI tool definitions, and open
[`ui-prototype.html`](./ui-prototype.html) in a browser for the clickable UI prototype.

## 4. UI plan (mobile)

Bottom tabs: **Today · Upcoming · (🎤 big centre mic) · Team · More**

| Screen          | Content                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Voice overlay   | Full-screen, live waveform, transcript, assistant reply text + spoken, confirm chips (ඔව් / නෑ / Edit)                                |
| Today           | Greeting + briefing play button, **Overdue** (red) first, today's timeline (meetings + tasks), progress ring                          |
| Upcoming        | 7-day / calendar strip, grouped by day                                                                                                |
| Areas           | Agency / Business / Education / Personal / Finance cards with counts, colours                                                         |
| Task detail     | All fields, voice notes, history, swipe to complete/snooze                                                                            |
| Team            | Members, their pending/overdue, assign                                                                                                |
| Reports         | Weekly charts, by area / worker                                                                                                       |
| More / Settings | Language (සිංහල/English), voice & speech speed, briefing times, nagging interval, WhatsApp link, n8n Actions & API keys, team invites |

Design: large touch targets, one-hand use, dark mode, සිංහල-first typography (Noto Sans Sinhala), haptics. Step 1 delivers this as a clickable HTML prototype.

## 5. Roadmap (milestones)

| #   | Milestone    | Deliverable                                                                                                                                                   |
| --- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Plan + UI    | `docs/sahayaka/PLAN.md`, `VOICE_COMMANDS.md`, `ui-prototype.html` — **review & approve**                                                                      |
| M1  | Core + voice | API (auth, areas, tasks, recurring, reminders, briefing), voice pipeline, mobile app (Today/Upcoming/Areas/voice overlay, push), Docker deploy → **APK v0.1** |
| M2  | WhatsApp     | Cloud API webhook, voice-note commands, reminders/briefings on WhatsApp, Android quick tile → APK v0.2                                                        |
| M3  | Team         | Members & roles, assign, worker notifications, WhatsApp-only workers, team view, reports → APK v0.3                                                           |
| M4  | n8n          | Outbound webhooks, inbound API keys, voice-callable Actions, sample n8n workflows (JSON) → APK v0.4                                                           |
| P2  | Product      | Calendar/Gmail sync, finance, PayHere SaaS plans (reuse StockFlow billing), Play Store                                                                        |

## 6. Monetization notes (later)

Multi-tenant from day one; plans by seats / WhatsApp messages / voice minutes / integrations; PayHere (LKR) reuse; Sri Lankan SMEs & agencies as first market (Sinhala voice is the differentiator).

## 7. Things you need to prepare (මට ඕන වෙන දේවල්)

- VPS SSH/domain (e.g. `app.youragency.lk`) — M1 deploy වෙලාවේ.
- Anthropic + Google (Gemini) API keys.
- Free Expo account (APK build).
- WhatsApp: අලුත් phone number එකක් + Meta Business account (M2).
- Agency systems list (මොනවද, API/webhook support තියෙනවද) — M4 වලට.

## Verification

- **S1**: prototype opened in Chromium via Playwright, screenshots of every screen at phone width, shared for review.
- **M1–M4**: `pnpm --filter sahayaka-api test` (Jest unit + e2e like `apps/api/test`), tool-calling tests with a fixture set of Sinhala/Singlish/English commands (expected tool + args), `tsc --noEmit` + `npx expo lint` for mobile, `docker compose up` smoke test, WhatsApp webhook tested with Meta test number, n8n sample workflow round-trip, then `npm run build:apk` (EAS preview profile) and install on your phone.
- Commits pushed to `claude/task-management-app-1rk6n9`.
