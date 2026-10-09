# Sahayaka — Voice command catalogue

මේ ලිස්ට් එකේ තියෙන්නේ app එක (සහ WhatsApp bot එක) තේරුම් ගන්න ඕන command වර්ග, ඒ හැම එකක්ම AI
එක call කරන **tool** එක, සහ assistant එක දෙන **reply** එක. M1 development වලදී මේවාම **test fixtures**
විදිහට පාවිච්චි කරනවා (expected tool + arguments check කරන්න).

## How it works (pipeline)

1. **Record** — mic button (app) හෝ WhatsApp voice note → audio (m4a / ogg).
2. **Speech-to-text** — Gemini Flash audio (සිංහල + Singlish + English) → transcript.
3. **Understand** — Claude with tool calling. Context: today's date, timezone `Asia/Colombo`, user's areas,
   team members, open tasks (titles + ids), conversation history (multi-turn).
4. **Act** — API runs the tool(s) inside a DB transaction. Destructive / bulk actions return
   `needsConfirmation` first.
5. **Reply** — short reply in the user's language → shown + spoken by device TTS (`si-LK` / `en-US`).
   If `needsReply`, the mic opens again automatically.

Rules for the assistant:

- Reply in the language the user spoke (සිංහල → සිංහල, English → English, Singlish → සිංහල).
- Keep spoken replies short (1–2 sentences). Lists: max 5 items spoken, "තව 3ක් තියෙනවා" for the rest.
- Missing **required** info → ask one question at a time (`ask_clarification`). Missing optional info →
  use defaults (area = guessed from context, priority = normal, reminder = 30 min before for meetings).
- Relative dates resolved in `Asia/Colombo`: "අද", "හෙට", "අනිද්දා", "ලබන සඳුදා", "සතියකින්", "උදේ / දවල් /
  හවස / රෑ" (09:00 / 12:00 / 16:00 / 20:00 defaults).
- Ambiguous task match ("ඒ task එක") → use the last task in the conversation; else ask which one.

## AI tools

| Tool                | Arguments (summary)                                                                                                 | Confirmation                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `create_task`       | `title`, `notes?`, `area?`, `project?`, `dueAt?`, `allDay?`, `priority?`, `remindBefore?[]`, `assignee?`, `amount?` | no                                        |
| `update_task`       | `taskId`, any field above                                                                                           | no                                        |
| `complete_task`     | `taskId`                                                                                                            | no (undo offered)                         |
| `reschedule_task`   | `taskId`, `dueAt`                                                                                                   | no                                        |
| `delete_task`       | `taskId`                                                                                                            | **yes**                                   |
| `list_tasks`        | `view` (today / overdue / upcoming / area / assignee / search), `filters?`                                          | no                                        |
| `create_recurring`  | `title`, `rrule`, `time?`, `area?`, `assignee?`, `remindBefore?[]`                                                  | no                                        |
| `assign_task`       | `taskId` or new task fields, `memberName`                                                                           | no                                        |
| `snooze_reminder`   | `taskId`, `until`                                                                                                   | no                                        |
| `get_briefing`      | `day` (today / tomorrow)                                                                                            | no                                        |
| `get_report`        | `period` (today / week / month), `groupBy?` (area / member)                                                         | no                                        |
| `run_action`        | `actionKey`, `params` (n8n workflow registered in Settings)                                                         | **yes** if the action is marked "confirm" |
| `ask_clarification` | `question`, `expecting` (time / date / person / choice / yes_no)                                                    | —                                         |

## Command catalogue (examples → expected tool)

### Create

| User says                                                                | Tool & key args                                                                                 | Reply                                                    |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| හෙට උදේ 10ට ABC client එක්ක meeting එකක් තියෙනවා, පැයකට කලින් මතක් කරන්න | `create_task` title "ABC client meeting", dueAt tomorrow 10:00, remindBefore [60m], area Agency | "හරි, හෙට උදේ 10ට ABC meeting එක දැම්මා. 9ට මතක් කරනවා." |
| Add a task to send the invoice to Perera Holdings by Friday              | `create_task` title "Send invoice to Perera Holdings", dueAt Fri 17:00, area Agency             | "Done — invoice to Perera Holdings, due Friday."         |
| ලබන මාසේ 5 වෙනිදා credit card bill එක ගෙවන්න, 45000යි                    | `create_task` title "Credit card bill", dueAt 5th, area Finance, amount 45000                   | "හරි, 5 වෙනිදාට රු. 45,000 card bill එක දැම්මා."         |
| Assignment එක submit කරන්න තියෙනවා                                       | `ask_clarification` "කවදාද submit කරන්න ඕන?" → then `create_task` area Education                | "කවදාද submit කරන්න ඕන?"                                 |

### Recurring

| User says                                           | Tool & key args                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| හැම සඳුදාම උදේ 9ට team meeting                      | `create_recurring` rrule `FREQ=WEEKLY;BYDAY=MO`, time 09:00         |
| Every day at 8pm remind me to check the ad accounts | `create_recurring` rrule `FREQ=DAILY`, time 20:00, area Agency      |
| හැම මාසෙම 25 වෙනිදා salaries දෙන්න                  | `create_recurring` rrule `FREQ=MONTHLY;BYMONTHDAY=25`, area Finance |

### Query

| User says                               | Tool                                    |
| --------------------------------------- | --------------------------------------- |
| අද කරන්න තියෙන්නේ මොනවද?                | `list_tasks` view today                 |
| ඉවර නොකරපු ඒවා මොනවද? / What's overdue? | `list_tasks` view overdue               |
| මේ සතියේ agency එකේ වැඩ                 | `list_tasks` view upcoming, area Agency |
| කසුන්ට දීපු වැඩ මොනවද?                  | `list_tasks` view assignee "Kasun"      |
| Good morning / අද දවස කොහොමද?           | `get_briefing` today                    |
| මේ සතියේ මම කොච්චර වැඩ කරාද?            | `get_report` week                       |

### Update / complete

| User says                                     | Tool                                          |
| --------------------------------------------- | --------------------------------------------- |
| Logo design task එක complete කරන්න / ඒක ඉවරයි | `complete_task`                               |
| ඒක සිකුරාදාට දාන්න                            | `reschedule_task` (last task in conversation) |
| Meeting එක 3ට කරන්න                           | `update_task` dueAt 15:00                     |
| පැයකින් ආයේ මතක් කරන්න                        | `snooze_reminder` until now+1h                |
| ABC meeting එක delete කරන්න                   | `delete_task` → "ඔව් / නෑ" confirmation       |

### Team (M3)

| User says                                                         | Tool                                                       |
| ----------------------------------------------------------------- | ---------------------------------------------------------- |
| කසුන්ට හෙට 5ට කලින් Facebook post 3ක් දෙන්න කියලා task එකක් දාන්න | `assign_task` new task, member Kasun, dueAt tomorrow 17:00 |
| Nimal ගේ overdue වැඩ මොනවද?                                       | `list_tasks` view overdue, assignee Nimal                  |

### n8n actions (M4)

| User says                                                    | Tool                                                      |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| New client onboarding start කරන්න, client නම Perera Holdings | `run_action` key `client_onboarding`, params {clientName} |
| ABC එකේ මාසික report එක generate කරන්න                       | `run_action` key `monthly_report`, params {client: "ABC"} |

## WhatsApp specifics (M2)

- Voice note → same pipeline; reply as text (voice reply later).
- Quick replies: worker replies **"done"** / **"ඉවරයි"** to a reminder → `complete_task` for that reminder's task.
- Reminder messages outside the 24h window use approved utility templates
  (`task_reminder`, `daily_briefing`, `task_assigned`).
