# Security

OWASP ASVS level 2 is the target. The full checklist is filled in during phase 7; this file records what each phase already enforces and how it is tested.

## Phase 1 (foundation)

| Control                                                                                                                                                                       | Where                                            | Test                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------- |
| OTP: 6 digits, 5 min TTL, single use, 5 verify attempts, 60 s resend cooldown, 5 requests per number per hour, 20 per IP per hour                                             | `apps/api/src/modules/auth/otp.service.ts`       | `otp.service.spec.ts`                   |
| OTP codes and rate-limit keys never contain the phone number (keyed HMAC)                                                                                                     | `otp.service.ts`                                 | code review                             |
| Access JWT HS256, 15 min, issuer checked, algorithm pinned                                                                                                                    | `token.service.ts`                               | `auth.int.ts`                           |
| Refresh token: 256-bit random, stored as SHA-256, 30 days, single use, reuse revokes every session and writes an audit entry                                                  | `token.service.ts`                               | `auth.int.ts`                           |
| Phone and name encrypted with AES-256-GCM; phone lookup by HMAC-SHA256                                                                                                        | `crypto.service.ts`                              | `crypto.service.spec.ts`, `auth.int.ts` |
| Row-level security on users, devices, refresh_tokens, consents; fails closed when no user is set                                                                              | migration `0001_init`                            | `auth.int.ts` (RLS suite)               |
| API connects as a non-superuser role; audit_logs is append-only for it                                                                                                        | migration `0001_init`, `infra/postgres/init.sql` | `auth.int.ts`                           |
| Errors as problem+json without stack traces or user data; unhandled errors log only the error class                                                                           | `problem.filter.ts`                              | `auth.int.ts`                           |
| Console SMS sender refused in production                                                                                                                                      | `config/env.ts`                                  | code review                             |
| Mobile: refresh token in SecureStore (this device only), access token in memory, PIN stored as salted hash, 5 wrong PINs force SMS login, auto-lock after 5 min in background | `apps/mobile/src/state`                          | manual, E2E in phase 7                  |
| Dependency audit in CI (`pnpm audit --prod --audit-level high`)                                                                                                               | `.github/workflows/ci.yml`                       | CI                                      |

## Known gaps (tracked for later phases)

- Rate limits per authenticated user and a general per-IP limit for all endpoints (phase 7).
- Certificate pinning in the mobile app needs the production domain (phase 7).
- Access tokens stay valid up to 15 min after "log out everywhere"; acceptable for the MVP, revisit if a device-revocation check per request is needed.
- Key rotation for PII_ENC_KEY: the ciphertext carries a version byte so a second key can be added.

## Phase 2 (budget and offline)

| Control                                                                                                                                                              | Where                                     | Test                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------- |
| Local records encrypted with SQLCipher; 256-bit key generated per install, kept in SecureStore (this device only); release builds refuse to start without encryption | `apps/mobile/src/records/sqlite-store.ts` | manual on a development build       |
| Local database deleted on sign-out                                                                                                                                   | `apps/mobile/src/state/session.ts`        | manual                              |
| RLS on user_settings, categories, transactions; cross-user category references rejected                                                                              | migration `0002_budget_offline`           | `records.int.ts`                    |
| Sync requires Idempotency-Key; replays return the stored response; batch capped at 500                                                                               | `sync.service.ts`                         | `records.int.ts`                    |
| Amounts validated as positive safe integers below 10^15 tiyin; DB check constraints on type, necessity, source, amount                                               | shared schemas, migration                 | `records.test.ts`, `records.int.ts` |

## Open dependency advisories

- GHSA-fc5q-39xc-vjpf (picomatch ReDoS, high, no patched version on 2026-11-18). Reached only through Metro, the build-time bundler; it is not shipped in the app or the API, and its glob patterns come from developers. CI `pnpm audit` fails on it until the project owner decides whether to record it as an accepted exception. Revisit when picomatch publishes a fix.
