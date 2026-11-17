# Architecture

Summary of the approved architecture document (Nov 17, 2026). The brief in [CLAUDE.md](../CLAUDE.md) is the source of truth for implementation details.

## Overview

```
Mobile app (Expo, uz/ru/en, offline)     Admin panel (Next.js)
                 \                        /
        ┌── Servers in Uzbekistan ─────────────────────────┐
        │  API gateway + load balancer (TLS 1.2+, /v1)     │
        │  NestJS modular monolith                         │
        │  PostgreSQL 16 · Redis · BullMQ worker           │
        └──────────────────────────────────────────────────┘
                 │ anonymised requests only
   AI (STT, LLM) · Click / Payme · SMS gateway, FCM/APNs · partners (V2)
```

Personal data never leaves the Uzbek servers. External AI receives only masked text and audio; payment and partner services receive only the fields a transaction needs.

## Modules

auth, users, transactions, voice, categories, budget, insights, learning, invest, planner, billing, rewards, notifications, orders (V2), admin, ai. Modules call each other only through exported services, never through each other's tables, so any module can later be split into its own service.

## API rules

- REST, OpenAPI 3.1 generated from code; mobile types are generated from it.
- `/v1` prefix; cursor pagination; errors as RFC 9457 `application/problem+json`.
- Money is an integer in minor units plus an ISO currency code. Money-related POSTs require `Idempotency-Key`.

## Data

PostgreSQL 16. Every table has a UUID v7 `id`, `created_at`, `updated_at`. User-owned tables carry `user_id` and are protected by row-level security: the API sets `app.user_id` per request inside a transaction, and policies compare against it. Phone and name are encrypted at field level (AES-256-GCM) with a keyed HMAC for phone lookup.

## Auth

Phone + SMS OTP (6 digits, 5 minutes, max 5 requests per number per hour). Access JWT 15 minutes; opaque refresh token 30 days, stored as a hash, rotated on every use. Reusing a rotated token revokes every session of that user. Devices are registered at login so the user can log out everywhere. On the phone: 4-digit PIN and biometrics, tokens in SecureStore, auto-lock after 5 minutes.

## AI layer

AI handles language only; all numbers are computed in backend code. Voice: audio in memory → STT adapter → masked transcript → LLM with JSON schema → deterministic normalisation → draft transactions → user confirms. Fallback: rule-based parser, then manual entry.

## Infrastructure

Docker containers in an Uzbek data centre; dev, staging and prod with separate databases and keys. Prod: 2 API nodes + load balancer, 1 worker, Postgres primary + replica, Redis. Daily backups + WAL (RPO 15 min, RTO 4 h). Prometheus + Grafana, Sentry, PostHog (self-hosted), alerts to Telegram.

## Roadmap

Phase 0 preparation (legal, STT test) → MVP (phases 1–7 in the brief) → closed beta (200–500 users) → V1.1 (chat assistant, receipts, forecasts) → V2 (MyID, purchases via partners).
