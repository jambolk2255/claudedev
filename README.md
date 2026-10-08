# StockFlow

Module-based **inventory, order, purchasing and finance management** for businesses of every size —
from a single shop to multi-warehouse distributors. Web first, with the same API ready for a
mobile app (Android APK) later, and an architecture that can grow into a multi-tenant SaaS.

> **සිංහලෙන් කෙටියෙන්:** මෙය stock / inventory / order management පද්ධතියක්. **Phase 0** (ආරක්ෂිත
> login, 2FA, භූමිකා, audit log, English + සිංහල UI, onboarding wizard) සහ **Phase 1** (භාණ්ඩ,
> පාරිභෝගිකයින්/සැපයුම්කරුවන්, ගබඩා, stock in/out, ගැලපීම්, ගණන් කිරීම්, මාරු කිරීම්, FIFO /
> සාමාන්‍ය පිරිවැය, batch + කල් ඉකුත් වීම, තොග අනතුරු ඇඟවීම්) සම්පූර්ණයි. GRN, returns,
> credit/debit notes, finance ආදිය ඊළඟ phases වලින් (පහත Roadmap බලන්න).

## What's in Phase 0

| Area               | Included                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth               | Owner registration, login, argon2id hashing, account lockout, rate limiting                                                                                               |
| Sessions           | 15‑min access JWT + rotating refresh tokens with **reuse detection**, device list, sign out other devices                                                                 |
| Web security       | httpOnly `SameSite` cookies, double‑submit **CSRF** token, Helmet/CSP, security headers, safe redirects                                                                   |
| 2FA                | TOTP (Google/Microsoft Authenticator, 1Password) with QR setup, secret encrypted with AES‑256‑GCM                                                                         |
| RBAC               | 7 system roles + custom roles, granular `module.action` permissions shared by API and UI                                                                                  |
| Multi‑tenant ready | Every table has `organizationId`; a Prisma extension scopes every query automatically                                                                                     |
| Audit log          | Who did what and when, with secrets redacted                                                                                                                              |
| Onboarding wizard  | Company → industry preset → Simple/Advanced modules → LKR/VAT/SSCL/fiscal year/valuation → warehouses (map pin) → document numbering → team invites → start mode → review |
| UI                 | Next.js App Router, Tailwind v4, Radix, Motion animations, Lucide icons, dark mode, Ctrl+K command palette, responsive sidebar, skeleton loading, **English + සිංහල**     |
| PWA                | Installable web app manifest (APK comes in Phase 6)                                                                                                                       |

## What's in Phase 1 — Inventory

| Area            | Included                                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Products        | SKU (auto or manual), barcode, category, unit, tax, cost/sell price, reorder & max levels, batch tracking, services                |
| Contacts        | Customers and suppliers with codes, payment terms, credit limits and map location                                                  |
| Warehouses      | Create/edit, default warehouse, map pin, deactivate only when empty                                                                |
| Stock documents | Stock in, stock out (with reason), adjustments (+/−), stock counts (variance), two-step transfers (in transit → received)          |
| Ledger          | Every change is an immutable `StockMovement` row (UPDATE blocked by a database trigger); running balance per product/warehouse     |
| Costing         | Weighted average or FIFO cost layers (chosen in onboarding); transfers carry cost to the destination                               |
| Batches         | Batch numbers + expiry on receipt, automatic first-expiry-first-out picking on issue                                               |
| Safety          | Row locks on stock levels — concurrent issues can never oversell; negative stock blocked unless enabled; gap-free document numbers |
| Alerts          | Out of stock, low stock, overstock, expiring and expired batches — in the bell, dashboard and inventory overview                   |
| UX              | Barcode/SKU scan field, live on-hand per line, printable documents, sample data option in onboarding                               |

Not yet in Phase 1 (planned for a later iteration): product variants, serial numbers, approval workflows and Excel import.

## Tech stack

- **Monorepo:** Turborepo + pnpm
- **Web:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, Radix UI, Motion, Lucide, TanStack Query, React Hook Form + Zod, next‑intl
- **API:** NestJS 11 on Fastify, Prisma 6, PostgreSQL 16 (Redis reserved for queues/alerts)
- **Shared:** `@stockflow/schemas` — Zod schemas, permissions, modules and presets used by web, API and (later) mobile
- **Maps:** Google Maps via `@vis.gl/react-google-maps` (falls back to coordinates + device location without a key)
- **Mobile (Phase 6):** Expo / React Native using the same API (`x-client: mobile` → bearer tokens)

```
apps/
  api/        NestJS API (src/modules/*), Prisma schema + migrations, e2e tests
  web/        Next.js app (src/app/[locale]/*), UI components, translations, Playwright tests
packages/
  schemas/    Shared Zod schemas, permissions, modules, industry & tax presets
docker/       docker-compose for Postgres/Redis (and optionally the full stack)
```

## Getting started

Requirements: Node 22+, pnpm 10, PostgreSQL 16 (or Docker).

```bash
pnpm install

# 1. Database (or use your own Postgres)
docker compose -f docker/docker-compose.yml up -d

# 2. Configure
cp apps/api/.env.example apps/api/.env        # then set JWT_ACCESS_SECRET and ENCRYPTION_KEY
cp apps/web/.env.example apps/web/.env.local  # optional: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

# 3. Migrate and run
pnpm --filter @stockflow/schemas build
pnpm db:migrate
pnpm dev            # web on http://localhost:3000, API on http://localhost:4000/api/v1
```

Open http://localhost:3000 — the first visit offers **Set up your company**, which creates the owner
account and starts the onboarding wizard. After that, registration closes and people join by invitation.

Generate secrets with `openssl rand -base64 48` (JWT) and `openssl rand -base64 32` (encryption key).

### Full stack in Docker

```bash
cd docker
printf "JWT_ACCESS_SECRET=%s\nENCRYPTION_KEY=%s\n" "$(openssl rand -base64 48)" "$(openssl rand -base64 32)" > .env
docker compose --profile app up -d --build
```

## Scripts

| Command                                 | What it does                                                    |
| --------------------------------------- | --------------------------------------------------------------- |
| `pnpm dev`                              | Run web and API in watch mode                                   |
| `pnpm build`                            | Build everything                                                |
| `pnpm typecheck`                        | TypeScript checks across the monorepo                           |
| `pnpm format` / `pnpm format:check`     | Prettier (with Tailwind class sorting)                          |
| `pnpm --filter @stockflow/schemas test` | Unit tests for shared schemas                                   |
| `pnpm --filter @stockflow/api test`     | API e2e tests (uses `stockflow_test` database)                  |
| `pnpm --filter @stockflow/web test:e2e` | Browser tests (API must run with `ALLOW_MULTI_ORG_SIGNUP=true`) |

## API overview (`/api/v1`)

- `auth/*` — `setup-status`, `register`, `login`, `refresh`, `logout`, `me`, `sessions`, `logout-others`, `change-password`, `2fa/{setup,enable,disable}`, `invitations/:token`, `accept-invite`
- `users` — list, invite, revoke invitation, change role / deactivate, update own profile
- `roles` — list, permission catalogue, create, update permissions, delete custom roles
- `organization` — details, overview (warehouses, tax rates, counts), update profile & modules
- `onboarding` — get state, save a step, complete (applies everything in one transaction)
- `audit` — paginated audit trail
- `products` — list (search/category/warehouse/stock filters), lookup by SKU or barcode, detail, create, update, delete (only without history)
- `categories`, `units`, `tax-rates`
- `partners` — customers and suppliers (`?type=customer|supplier`)
- `warehouses` — list with stock counts, create, update
- `stock` — `summary`, `alerts`, `documents` (list, detail, create & post, `:id/receive`), `movements` (ledger)
- `health`

Web clients authenticate with cookies (+ `x-csrf-token` header on mutations). Mobile clients send
`x-client: mobile` and receive `{ accessToken, refreshToken }` in the response body, then use
`Authorization: Bearer`.

## Roadmap

| Phase                              | Scope                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **0 – Foundation** ✅              | Monorepo, design system, auth + 2FA, RBAC, audit log, onboarding wizard                                                  |
| **1 – Master data + Inventory** ✅ | Products/variants/UoM, warehouses, customers/suppliers, stock in/out, adjustments, transfers, stock ledger, stock alerts |
| 2 – Purchasing                     | PO → GRN → supplier bill → payment, return outward + debit note, supplier order tracking                                 |
| 3 – Sales                          | Quotation → SO → delivery → invoice → receipt, return inward + credit note, customer order tracking, quick sale          |
| 4 – Finance                        | Double‑entry journals, AR/AP, statements, aging, cheques, P&L, valuation                                                 |
| 5 – Insights                       | Dashboards, reports/exports, Excel import, barcodes, map views, offline PWA                                              |
| 6 – Mobile                         | Expo app → APK (stock checks, GRN, counts with camera scanning, push alerts)                                             |
| 7 – SaaS                           | Self sign‑up, subscriptions, tenant administration                                                                       |

Design principles: stock is never edited directly (every change is an immutable movement), every
financial document posts a balanced journal, posted documents are reversed rather than edited, and
small businesses get a **Simple mode** while enterprises switch on **Advanced** modules.
