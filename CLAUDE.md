# Project brief for the coding agent

Merged brief (2026-11-17). Sources: the architecture document and coding-agent brief by Dilbar (Nov 17) and the product TZ by Jahongir (Nov 11). Where they differed, the resolution is recorded in docs/adr/0002-merged-brief.md. The financial model, with formulas and worked examples, is in docs/FINANCE_MODEL.md and is part of this brief.

## 1. Role and working rules

You are a senior full-stack engineer building the MVP of a personal-finance mobile app for Uzbekistan. Work in phases (section 12). For each phase:

- First write a short plan (files, schema changes, endpoints, tests) and wait for approval.
- Then implement in small, reviewable commits. Every feature ships with tests.
- Never invent business facts (prices, rates, partner terms, tax rates, legal rules). Use the placeholders in [brackets] and list them in docs/OPEN_QUESTIONS.md.
- If a requirement is ambiguous or conflicts with another, stop and ask.
- Keep this file, docs/ARCHITECTURE.md, docs/FINANCE_MODEL.md and the OpenAPI spec up to date when you change behaviour.

## 2. Product in one paragraph

[APP_NAME] leads people in Uzbekistan towards financial freedom. The user records income, expenses, investments, dividends and assets in so'm; the app places them on a 5-stage path (financial risk → security → stability → independence → freedom) and shows, in so'm and months, what is missing for the next stage. Expenses are tagged by necessity (essential / moderate / non-essential). Around this core: offline entry, a monthly report, voice entry (Uzbek, Russian, mixed), short lessons, and an information-only catalogue of savings and investment options with a halal filter. Guiding ideas: pay yourself first, avoid lifestyle inflation, own assets rather than consume, idle money loses value to inflation, make emotional spending visible. The app never moves or holds user money and gives no personalised investment advice. UI languages: Uzbek (Latin script, default), Russian, English. Android first; the Expo app also builds for iOS.

## 3. Hard constraints

1. Personal data of Uzbek citizens is stored only on servers located in Uzbekistan.
2. Voice audio is processed in memory and never written to disk or object storage. Only the transcript is kept, and it is deleted after 90 days.
3. Nothing sent to an external AI provider may contain the phone number, name, card numbers or user id. Mask before sending.
4. Amounts are integers in minor units (tiyin for UZS, cents for USD) with an ISO currency code. Never use floating point for money. The MVP UI is UZS only; the data model keeps the currency field.
5. Every money-related POST requires an Idempotency-Key header; offline records carry a client-generated UUID so a retry never duplicates.
6. All numbers shown to the user (totals, stages, KPIs, forecasts) come from deterministic code in packages/shared, which runs both on the phone (offline) and on the server, never from an LLM.
7. No personalised investment recommendations. Allowed: education, comparison, risk explanation, risk quiz, three standard portfolio templates, calculators with user-editable assumptions labelled as assumptions. Never "buy X".
8. Amounts are entered as received (net). The app does not deduct income or dividend tax a second time; tax helpers apply only when the user marks an amount as gross. Tax rates are [TAX_RATES] until confirmed.
9. The stage is computed only from the user's own data. With less than 3 months of records the app shows a provisional stage from onboarding answers, clearly labelled, never a guess presented as fact.
10. Accessibility: touch targets of at least 44 px, text contrast of at least 4.5:1, screen-reader labels on icon buttons.
11. Security on the phone is an MVP requirement: PIN or biometrics, encrypted local database, TLS to the server.

## 4. Tech stack

- Monorepo: pnpm workspaces + Turborepo.
- apps/mobile: React Native + Expo (latest SDK), TypeScript strict, Expo Router, TanStack Query, Zustand, expo-sqlite with SQLCipher (offline store and sync queue), i18next, expo-local-authentication, expo-secure-store, expo-audio (recording, Opus).
- apps/api: NestJS on Node.js 24 LTS (docs/adr/0001-stack.md), TypeScript strict, Prisma, PostgreSQL 16, Redis, BullMQ, Zod, OpenAPI 3.1 generated from code.
- apps/admin: Next.js (App Router) + shadcn/ui, same auth with RBAC.
- packages/shared: shared types, Zod schemas, money utilities, the financial model (stages, KPIs, calculators), i18n keys.
- packages/api-client: generated from OpenAPI.
- Tooling: ESLint, Prettier, Vitest/Jest, Supertest, Playwright (admin), Maestro (mobile E2E), Docker, docker-compose, GitHub Actions, EAS Build.

## 5. Repository layout

- apps/mobile, apps/api, apps/admin
- packages/shared, packages/api-client, packages/config (eslint, tsconfig)
- infra/ (docker-compose, Dockerfiles, deployment manifests)
- docs/ (ARCHITECTURE.md, FINANCE_MODEL.md, OPEN_QUESTIONS.md, SECURITY.md, ADRs)

## 6. Backend modules (NestJS, modular monolith)

Modules talk only through exported services, never through each other's tables.

- auth: phone + SMS OTP (5-minute code, max 5 requests per number per hour), access JWT 15 min, rotating refresh token 30 days with replay detection, device registry, logout from all devices. (done)
- users: profile, locale, onboarding answers, settings (card reserve threshold, default 1 000 000 so'm; KPI targets; inflation and return assumptions), consents, data export (Excel/PDF), account deletion (soft delete, hard delete after 30 days).
- transactions: types income-active, income-passive, expense, investment, dividend; necessity level on expenses; CRUD, filters, cursor pagination; offline sync (section 8).
- categories: defaults with translations and a default necessity level each (food, cafe, transport, housing/rent, utilities, phone and internet, instalments/nasiya, health, education, clothing, gifts, sadaqa, help to relatives, other) + custom categories; category_rules learned from user corrections, including necessity.
- assets: holdings entered by hand (Iman, Asaxiy, Way2, gold, foreign shares, livestock/qo'ychilik, bank deposit, card and cash, other); invested amount, current value with as-of date, liquid flag, dividend method (withdraw / capitalise); liabilities (simple list in MVP, full debt module later); net worth history.
- finance: stage, KPIs, monthly report and life model from docs/FINANCE_MODEL.md, using the shared code; stores stage results and monthly report snapshots.
- voice: POST /v1/voice/parse (multipart Opus, max 15 s). Pipeline in section 8.
- budget: plan from income (50/30/20 by default, mapped to essential / moderate + non-essential / savings and investment; editable), category limits, alert at 80% of a limit, "pay yourself first" split suggestion when a salary is recorded.
- insights: background job that produces 2 to 3 short tips per month from computed numbers (stage progress, non-essential growth, idle money above the reserve); an LLM only phrases the text.
- learning: lessons (two levels per topic: simple and with formulas) and 3-question quizzes managed in admin, progress, points. First 5 lessons free.
- invest: partners, instruments (risk level, halal flag, minimum amount, description), rate snapshots with source and as-of date, risk quiz. IMAN is not shown in the catalogue until docs/OPEN_QUESTIONS.md says otherwise; users may still record their own Iman holdings as assets.
- planner: freedom calculator (capital K and months n, real return by default), scenario calculator, portfolio templates approved in admin, saved user plan with monthly reminder day.
- debts (later phase): amount, rate, term, balance, payment reminders, annuity schedule, avalanche vs snowball comparison.
- family (later phase): members, shared budget, per-member allowance.
- billing: Free and Premium tiers, trial, Click and Payme with signature-verified, idempotent webhooks. Prices [PREMIUM_PRICE_MONTH], [PREMIUM_PRICE_YEAR].
- rewards: append-only points ledger, streaks, referrals.
- notifications: push tokens, daily entry reminder, limit alerts, plan and debt reminders.
- admin: content, partners, instruments, rates, templates, users (read-only support view), audit log. RBAC + 2FA.
- ai: provider adapters (STT, LLM), prompt registry, PII masking, usage limits, logging of model, prompt version, latency and cost.

## 7. Data model (Prisma)

All tables: id (UUID v7), created_at, updated_at. User-owned tables carry user_id and are protected by Postgres row-level security.
Existing: users, devices, refresh_tokens, consents, audit_logs.
To add: user_settings, categories, category_rules, transactions, assets, asset_valuations, liabilities, stage_results, monthly_reports, voice_parses, budget_plans, budget_limits, insights, lessons, quiz_questions, lesson_progress, partners, instruments, rate_snapshots, portfolio_templates, user_plans, subscriptions, payments, points_ledger, referrals, notifications; later debts, families, family_members.
Syncable tables (transactions, assets, asset_valuations, liabilities, categories) also carry client_id (UUID from the phone), client_updated_at and deleted_at (tombstone).
Phone numbers and names are encrypted (AES-256-GCM) with a keyed hash for phone lookup. Translatable fields are JSON objects keyed by locale.

## 8. Offline sync and voice

Offline sync (MVP):

1. Every record is written first to the encrypted SQLite store with status "pending".
2. Each record has a client UUID and client_updated_at, so resending never duplicates.
3. When online, pending records go to POST /v1/sync in batches; the server answers with accepted ids and server changes since the client's cursor. Accepted records become "synced".
4. Conflicts: last write wins by client_updated_at; deletes travel as tombstones.
5. Stages, KPIs and reports are computed on the phone with packages/shared, so they work offline; the server recomputes the same numbers for snapshots.
6. Target: 99% of offline records sync without loss.

Voice pipeline (unchanged from the original brief):

1. Mobile records Opus audio, max 15 s, and uploads it to POST /v1/voice/parse.
2. API keeps the audio in memory and calls the STT adapter ([STT_PROVIDER]). Language auto-detect: uz, ru, mixed.
3. API sends the masked transcript to the LLM adapter with the parsing prompt and the user's category list. Output schema: {"transactions":[{"type":"expense|income|investment|dividend","amount":number,"currency":"UZS|USD","category_hint":string,"necessity":"essential|moderate|non_essential|null","occurred_at":"ISO date or null","note":string,"confidence":0..1}]}.
4. Deterministic post-processing normalises numbers ("40 ming", "qirq ming", "40k", "сорок тысяч" -> 40000 UZS), resolves relative dates in Asia/Tashkent, maps category_hint using category_rules first, and flags fields with confidence below 0.7.
5. Audio buffer is released. Response returns draft transactions; target p95 under 3 s.
6. The user confirms or edits on the confirmation card; edits update category_rules.
7. Fallback: rule-based parser, else manual entry. Never lose the user's input. Voice needs a connection and says so.
   Quality gate: at least 200 real phrases (uz, ru, mixed) in apps/api/test/voice-fixtures; CI fails below 90% amount or category accuracy.

## 9. Mobile app screens

Mockups: docs/design/mockups.pdf (Russian); screens without a mockup are listed in docs/design/NOTES.md for designer review.
MVP screens: language choice, phone login with OTP, PIN and biometrics, onboarding (income, goal, halal preference, current savings and average monthly spending for the provisional stage), home (stage card with "missing for next stage", the 5 home KPIs, month balance, recent records), quick entry (manual, with necessity level) and voice entry with confirmation card, history, assets and net worth, stage detail, monthly report, budget, lessons and quiz, invest catalogue, calculators, premium and points, profile, privacy and security settings.
Later (feature-flagged off): debts, family, AI assistant, gold / stocks / crypto purchase, MyID.
Bottom navigation: Home, Budget, central microphone button (long-press for manual entry), Learn, Invest. Assets and the monthly report are reached from Home.

## 10. Design tokens

Colours: primary #0B6E4F, primary-dark #0B3D2E, primary-soft #E3F1EA, background #F4F6F3, surface #FFFFFF, border #E2E8E4, text #10201A, text-secondary #4F5F58, muted #5B6B64, warning text #8A4B0B on #FDF0DC, danger #B42318 / text #8C1D14 on #FBEAE8, info #1F4E8C on #E7EEF9.
Fonts: Manrope (headings, 600 to 800), Inter (body, 400 to 600).
Radius 12 to 20, spacing on a 4/8 grid, buttons 56 px tall, minimum touch target 44 px. Tokens are a theme so dark mode is a switch later.

## 11. Security, privacy, operations

- TLS 1.2+ everywhere, certificate pinning in the mobile app, encryption at rest on server and phone, field-level encryption for phone and name.
- Rate limits per IP, phone and user. OWASP ASVS level 2 checklist in docs/SECURITY.md. Dependency scanning in CI.
- Logs never contain transcripts, amounts or PII. Audit log for every admin action. User data is never given to third parties.
- Secrets only from the secrets manager or environment; nothing in the repo (the repository is public).
- Environments: dev, staging, prod. Backups daily plus WAL, 30-day retention, monthly restore test (RPO 15 min, RTO 4 h).
- Observability: Prometheus + Grafana, Sentry, PostHog (self-hosted), uptime checks, alerts to a Telegram group.
- Targets: 99.5% availability, API p95 under 300 ms (voice under 3 s), MVP infra sized for 50,000 monthly active users.

## 12. Phases and definition of done

The money-tracking core from the TZ comes first; it is what makes the product different.

- Phase 1 — Foundation (done): monorepo, CI, auth, users and consents, i18n, mobile shell, login, PIN.
- Phase 2 — Budget and offline: user settings, categories with necessity levels, transactions of all five types, encrypted local store, sync endpoint and queue, quick manual entry, history.
- Phase 3 — Assets and net worth: assets, valuations, liabilities, dividend method, card reserve and "money waiting to be invested".
- Phase 4 — Stages and report: financial model in packages/shared (stage, KPIs, life model, monthly report), provisional stage from onboarding, home screen, stage detail, monthly report. Closed beta can start here.
- Phase 5 — Voice entry: STT and LLM adapters, parsing, confirmation card, fixtures and quality gate.
- Phase 6 — Learning: lessons at two levels, quizzes, progress, admin content editor.
- Phase 7 — Invest information and calculators: catalogue, rates, risk quiz, freedom calculator, scenario calculator, portfolio templates, disclaimers.
- Phase 8 — Monetisation: Free/Premium limits, Click and Payme, trial, points, referrals.
- Phase 9 — Hardening and release: security review, data export and deletion, accessibility pass, performance tests, Google Play closed beta build.
- Later: debts, family mode, AI assistant, insights, purchases via partners.

Timeline: the TZ asked for a 20-day MVP (phases 2–4 plus release). That is the target for the closed beta; phases 5–9 follow. If time runs short, the TZ's order of cuts applies: monthly report, then assets move later; budget and stages stay.

A phase is done when: all endpoints are in OpenAPI, unit and integration tests pass in CI, financial formulas match the worked examples in docs/FINANCE_MODEL.md, mobile screens match the mockups in all three languages, no TODOs without a ticket, and docs are updated.

## 13. Success criteria for the closed beta (to be confirmed by the team)

Within 2 weeks of the beta: 100 users install; 40% enter at least 10 records in 7 days; 99% of offline records sync without loss; 70% see their stage (provisional or final) and rate it "correct".

## 14. Placeholders to fill

[APP_NAME] (candidates: Bosqich, Payfirst), [PREMIUM_PRICE_MONTH], [PREMIUM_PRICE_YEAR], [TAX_RATES], [STT_PROVIDER], [LLM_PROVIDER_AND_MODEL], [SMS_PROVIDER], [HOSTING_PROVIDER_UZ], [PARTNER_LIST_AND_TERMS], [LEGAL_REVIEW_NOTES].
