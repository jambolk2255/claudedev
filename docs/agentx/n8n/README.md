# Agent X ↔ n8n — setup guide

Agent X ඔයාගේ systems එක්ක කතා කරන්නේ **n8n webhooks** හරහා. ඒ නිසා අලුත් system එකක් connect කරන්න app එක වෙනස් කරන්න ඕන නෑ — n8n
workflow එකක් හදලා URL එක Agent X → **Systems** එකට දැම්මම ඇති.

## 1. Sample workflows import කරන්න

n8n → **Workflows → Import from file** → මේ folder එකේ JSON එකක් තෝරන්න → **Activate**.

| File                        | Webhook path         | Agent X එකේ දාන තැන                    |
| --------------------------- | -------------------- | -------------------------------------- |
| `agentx-action-sample.json` | `/agentx-onboarding` | System → ⚡ Voice actions → action URL |
| `agentx-inbox-sample.json`  | `/agentx-inbox`      | System → 📥 Inbox URL                  |
| `agentx-events-sample.json` | `/agentx-events`     | System → 📤 Events webhook URL         |
| `agentx-backup-sample.json` | `/agentx-backup`     | තව → 💾 Backup → Auto backup webhook   |

Production URL එක: `https://<your-n8n-host>/webhook/<path>` (n8n webhook node එකේ "Production URL").

## 2. Agent X එකේ system එකක් හදන්න

1. **Systems → ＋ අලුත් system එකක්** → නම (උදා: _Agency CRM_), icon → **Save**.
2. **⚡ Action එකක් එකතු කරන්න**:
   - Action නම: `Client onboarding`
   - කියන්නේ මෙහෙමයි: `Perera Holdings onboarding start කරන්න`
   - URL: `https://n8n.example.lk/webhook/agentx-onboarding`
   - Parameters: `clientName*` (`*` = අනිවාර්ය)
   - Run කරන්න කලින් අහන්න: ✓
   - **Test එකක් යවන්න** → n8n reply එක popup එකේ පේනවා.
3. Mic එක ඔබලා: _"Perera Holdings onboarding එක start කරන්න"_ → Agent X අහනවා _"run කරන්නද?"_ → _"ඔව්"_ → n8n reply එක කියවනවා.

## 3. Payloads

```jsonc
// Action  (POST <action URL>)  →  reply { "say": "text to speak" }
{ "app": "agentx", "action": "client_onboarding", "params": { "clientName": "Perera Holdings" }, "sentAt": "2026-10-09T10:00:00+05:30" }

// Event   (POST <events URL>)
{ "app": "agentx", "event": "task.completed", "task": { "id": "…", "title": "…", "area": "Agency", "dueAt": "…", "status": "done", … }, "sentAt": "…" }

// Inbox   (GET <inbox URL>?since=<ISO>)  →  reply:
{ "items": [
    { "type": "task", "id": "lead-1001", "title": "Call Silva Motors", "due": "2026-10-09T15:00:00+05:30", "area": "Agency", "priority": "high" },
    { "type": "notify", "title": "Ad spend alert", "body": "ABC campaign spent 80% of today's budget" }
] }
// (a plain array works too). `id` is used to avoid creating the same task twice.

// Backup  (POST <backup URL>)
{ "app": "agentx", "version": 1, "exportedAt": "…", "areas": […], "tasks": […], "systems": […], "actions": […], "settings": {…} }
```

## 4. Security — signature

හැම POST request එකකටම `X-AgentX-Signature: sha256=<hex>` header එකක් එනවා: system එකේ **Secret** එකෙන් body එකේ HMAC-SHA256.
Inbox GET request එකට signature එක හදන්නේ query string එකෙන් (`?since=…`). Verify කරන්න n8n එකේ webhook node → Options →
**Raw Body** on කරලා, **Crypto** node එකෙන් (HMAC, SHA256, secret) raw body එකේ hash එක හදලා header එකට සමානද බලන්න. Webhook
URLs රහසිගතව තියාගන්න; n8n එකේ Header Auth වගේ authentication එකකුත් දාන්න පුළුවන්.

## 5. Ideas

- CRM එකේ අලුත් lead → Inbox → Agent X task + notification
- `task.overdue` → WhatsApp / Slack message to the team (WhatsApp Cloud API node)
- "ABC එකේ මාසික report එක generate කරන්න" → Google Sheets + Gmail workflow → `{ "say": "Report එක email කළා" }`
- "අද ads වලට කොච්චර වියදම් වුණාද?" → Meta/Google Ads API workflow → spoken answer
