# Project brief for the coding agent

## 1. Role and working rules
You are a senior full-stack engineer building the MVP of a personal-finance mobile app for Uzbekistan. Work in phases (section 12). For each phase:
- First write a short plan (files, schema changes, endpoints, tests) and wait for approval.
- Then implement in small, reviewable commits. Every feature ships with tests.
- Never invent business facts (prices, rates, partner terms, legal rules). Use the placeholders in [brackets] and list them in docs/OPEN_QUESTIONS.md.
- If a requirement is ambiguous or conflicts with another, stop and ask.
- Keep this file, docs/ARCHITECTURE.md and the OpenAPI spec up to date when you change behaviour.

## 2. Product in one paragraph
[APP_NAME] helps people in Uzbekistan manage money: short financial-literacy lessons, income and expense tracking by voice (Uzbek and Russian, including mixed speech), a budget built from real spending, and an information-only catalogue of savings and investment options with a strong halal filter. The MVP does not move or hold user money and gives no personalised investment advice. UI languages: Uzbek (Latin script, default), Russian, English.

## 3. Hard constraints
1. Personal data of Uzbek citizens is stored only on servers located in Uzbekistan.
2. Voice audio is processed in memory and never written to disk or object storage. Only the transcript is kept, and it is deleted after 90 days.
3. Nothing sent to an external AI provider may contain the phone number, name, card numbers or user id. Mask before sending.
4. Amounts are integers in minor units (tiyin for UZS, cents for USD) with an ISO currency code. Never use floating point for money.
5. Every money-related POST requires an Idempotency-Key header.
6. All numbers shown to the user (totals, budgets, forecasts) are computed in backend code, never by an LLM.
7. No personalised investment recommendations. Allowed: education, catalogue, risk quiz, three standard portfolio templates, scenario calculator with ranges and disclaimers.
8. Accessibility: touch targets of at least 44 px, text contrast of at least 4.5:1, screen-reader labels on icon buttons.

## 4. Tech stack
- Monorepo: pnpm workspaces + Turborepo.
- apps/mobile: React Native + Expo (latest SDK), TypeScript strict, Expo Router, TanStack Query, Zustand, expo-sqlite (offline queue), i18next, expo-local-authentication, expo-secure-store, expo-av (recording, Opus).
- apps/api: NestJS on Node.js 24 LTS (changed from 22, see docs/adr/0001-stack.md), TypeScript strict, Prisma, PostgreSQL 16, Redis, BullMQ, Zod for runtime validation, OpenAPI 3.1 generated from code.
- apps/admin: Next.js (App Router) + shadcn/ui, same auth with RBAC.
- packages/shared: shared types, Zod schemas, money utilities, i18n keys.
- packages/api-client: generated from OpenAPI.
- Tooling: ESLint, Prettier, Vitest/Jest, Supertest, Playwright (admin), Maestro or Detox (mobile E2E), Docker, docker-compose for local dev, GitHub Actions, EAS Build.

## 5. Repository layout
- apps/mobile, apps/api, apps/admin
- packages/shared, packages/api-client, packages/config (eslint, tsconfig)
- infra/ (docker-compose, Dockerfiles, deployment manifests)
- docs/ (ARCHITECTURE.md, OPEN_QUESTIONS.md, ADRs, API notes)

## 6. Backend modules (NestJS, modular monolith)
Modules talk only through exported services, never through each other's tables.
- auth: phone + SMS OTP (5-minute code, max 5 requests per number per hour), access JWT 15 min, rotating refresh token 30 days with reuse detection, device registry, logout from all devices.
- users: profile, locale, onboarding answers (income range, goal, halal preference), risk profile, consents (privacy, microphone, partner sharing; versioned and timestamped), data export (Excel/PDF), account deletion (soft delete, hard delete after 30 days).
- transactions: CRUD, filters, cursor pagination, offline sync endpoint that accepts a batch with client_id for de-duplication.
- voice: POST /v1/voice/parse (multipart Opus, max 15 s). Pipeline in section 8.
- categories: 12 to 15 defaults with translations (food, cafe, transport, housing, utilities, phone and internet, instalments/nasiya, health, education, clothing, gifts, sadaqa, other) + custom categories; category_rules learned from user corrections.
- budget: 50/30/20 plan from income (editable), category limits, alert at 80% of a limit, weekly and monthly summaries.
- insights: background job that produces 2 to 3 short tips per month from computed numbers; an LLM only phrases the text in the user's language.
- learning: lessons and 3-question quizzes managed in admin, progress, points for completed lessons. First 5 lessons free.
- invest: partners (with licence reference, shariah certificate, status active/paused/blocked, last due-diligence date), instruments (risk level, halal flag, minimum amount, description), rate snapshots with source and as-of date, 5-question risk quiz.
- planner: scenario calculator (monthly amount, years, three real-return assumptions), portfolio templates (cautious, moderate, active) stored in DB and approved in admin, saved user plan with monthly reminder day.
- billing: Free and Premium tiers, 14-day trial, monthly and annual plans, Click and Payme merchant integrations with signature-verified, idempotent webhooks.
- rewards: append-only points ledger (lesson, 7-day and 30-day tracking streaks, month within budget), redeem points for Premium days, referrals (bonus after the invitee tracks for 7 days).
- notifications: push tokens, daily evening reminder, limit alerts, plan reminders.
- admin: content, partners, instruments, rates, templates, users (read-only support view), audit log. RBAC roles: content, partners, support, superadmin. 2FA required.
- ai: provider adapters (STT, LLM), prompt registry with versions, PII masking, per-user and global usage limits, logging of model, prompt version, latency and cost.

## 7. Data model (Prisma)
All tables: id (UUID v7), created_at, updated_at. User-owned tables carry user_id and are protected by Postgres row-level security in addition to service checks.
users, devices, refresh_tokens, consents, categories, category_rules, transactions, voice_parses, budget_plans, budget_limits, insights, lessons, quiz_questions, lesson_progress, partners, instruments, rate_snapshots, portfolio_templates, user_plans, subscriptions, payments, points_ledger, referrals, notifications, audit_logs.
Phone numbers are stored encrypted (AES-256-GCM, key from the secrets manager) plus a keyed hash for lookup. Translatable fields are JSON objects keyed by locale: {"uz": "...", "ru": "...", "en": "..."}.

## 8. Voice pipeline (the core feature)
1. Mobile records Opus audio, max 15 s, and uploads it to POST /v1/voice/parse.
2. API keeps the audio in memory and calls the STT adapter (provider chosen by config: [STT_PROVIDER], candidates Aisha, ElevenLabs Scribe, Whisper). Language auto-detect: uz, ru, mixed.
3. API sends the masked transcript to the LLM adapter with the parsing system prompt below and the user's category list. Output must validate against this schema: {"transactions":[{"type":"expense|income","amount":number,"currency":"UZS|USD","category_hint":string,"occurred_at":"ISO date or null","note":string,"confidence":0..1}]}.
4. Deterministic post-processing normalises numbers ("40 ming", "qirq ming", "40k", "сорок тысяч" -> 40000 UZS), resolves relative dates ("kecha", "вчера") in Asia/Tashkent, maps category_hint to a category using category_rules first, and flags fields with confidence below 0.7.
5. Audio buffer is released. Response returns draft transactions; target p95 under 3 s.
6. The user confirms or edits on the confirmation card, then mobile calls POST /v1/transactions. Edits update category_rules and mark voice_parses.corrected.
7. Fallback when STT or LLM fails or times out: rule-based parser (regex + number dictionary for uz/ru), else open manual entry. Never lose the user's input.
Parsing system prompt (store in the prompt registry, version 1):
"You extract money transactions from a short spoken note in Uzbek, Russian or a mix. Return only JSON that matches the schema. One note can contain several transactions. Do not guess amounts that are not said; if unsure, set confidence below 0.7. Use category_hint words from the provided category list when possible. Never add advice or commentary."
Quality gate: a test set of at least 200 real phrases (uz, ru, mixed) lives in apps/api/test/voice-fixtures. CI fails if amount accuracy or category accuracy drops below 90%.

## 9. Mobile app screens
Follow the approved mockups (docs/design/mockups.pdf, Russian only; see docs/design/NOTES.md for screens without a mockup). Screens: language choice, phone login with OTP, PIN and biometrics setup, 3-question onboarding, home (month balance, budget progress, lesson of the day, recent transactions), voice entry with confirmation card, transaction history, budget (50/30/20 plan, category limits, tip), lessons list and quiz, invest catalogue with halal switch and risk profile, scenario calculator, portfolio planner (three templates, allocation bar, reminder), premium and points, privacy and security settings. Post-MVP screens (feature-flagged off): gold purchase, stocks catalogue and order, crypto purchase with risk acknowledgement, purchase confirmation with MyID.
Bottom navigation: Home, Budget, central microphone button, Learn, Invest.
Offline: manual entry works offline and syncs later; voice requires a connection and says so clearly.

## 10. Design tokens
Colours: primary #0B6E4F, primary-dark #0B3D2E, primary-soft #E3F1EA, background #F4F6F3, surface #FFFFFF, border #E2E8E4, text #10201A, text-secondary #4F5F58, muted #5B6B64, warning text #8A4B0B on #FDF0DC, danger #B42318 / text #8C1D14 on #FBEAE8, info #1F4E8C on #E7EEF9.
Fonts: Manrope (headings, 600 to 800), Inter (body, 400 to 600); both support Cyrillic and Uzbek Latin characters (oʻ, gʻ).
Radius 12 to 20, spacing on a 4/8 grid, buttons 56 px tall, minimum touch target 44 px. Support system dark mode later; build tokens so it is a theme switch.

## 11. Security, privacy, operations
- TLS 1.2+ everywhere, certificate pinning in the mobile app, encryption at rest, field-level encryption for phone and name.
- Rate limits per IP, phone and user. OWASP ASVS level 2 checklist in docs/SECURITY.md. Dependency scanning in CI.
- Logs never contain transcripts, amounts or PII. Audit log for every admin action.
- Secrets only from the secrets manager or environment; nothing in the repo.
- Environments: dev, staging, prod. Backups daily plus WAL, 30-day retention, monthly restore test (RPO 15 min, RTO 4 h).
- Observability: Prometheus + Grafana, Sentry, PostHog (self-hosted), uptime checks, alerts to a Telegram group.
- Non-functional targets: 99.5% availability, API p95 under 300 ms (voice under 3 s), MVP infra sized for 50,000 monthly active users.

## 12. Phases and definition of done
Phase 1 — Foundation: monorepo, CI, docker-compose, Prisma schema v1, auth (OTP, JWT, refresh rotation, devices), users and consents, i18n scaffolding, mobile shell with navigation, login and PIN.
Phase 2 — Tracking: categories, transactions with offline sync, voice pipeline with adapters, mocks and fixture tests, confirmation card, history.
Phase 3 — Budget and insights: plan, limits, alerts, summaries, insight job, home screen.
Phase 4 — Learning: lessons and quizzes, progress, admin content editor.
Phase 5 — Invest information: partners, instruments, rates, risk quiz, calculator, portfolio templates and user plan, disclaimers.
Phase 6 — Monetisation: Free/Premium limits, Click and Payme, trial, points, referrals.
Phase 7 — Hardening: security review, data export and deletion, accessibility pass, performance tests, store builds.
A phase is done when: all endpoints are in OpenAPI, unit and integration tests pass in CI, mobile screens match the mockups in all three languages, no TODOs without a ticket, and docs are updated.

## 13. Placeholders to fill
[APP_NAME], [PREMIUM_PRICE_MONTH], [PREMIUM_PRICE_YEAR], [STT_PROVIDER], [LLM_PROVIDER_AND_MODEL], [SMS_PROVIDER], [HOSTING_PROVIDER_UZ], [PARTNER_LIST_AND_TERMS], [LINK_TO_MOCKUPS], [LEGAL_REVIEW_NOTES].
