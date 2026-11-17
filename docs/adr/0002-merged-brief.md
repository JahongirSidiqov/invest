# ADR 0002: Merge Dilbar's brief and Jahongir's TZ into one product

Date: 2026-11-17 · Status: accepted (requested by the project owner: "combine all of them")

## Context

Two documents describe the app:

- Dilbar's architecture document and coding-agent brief (Nov 17): voice entry, lessons, 50/30/20 budget, halal investment catalogue, Expo + NestJS + PostgreSQL in Uzbekistan, 12–14 weeks. Phase 1 is built on it.
- Jahongir's TZ (Nov 11): a 5-stage path to financial freedom, necessity levels on expenses, manual assets (Iman, Asaxiy, Way2, gold, …), offline-first, monthly report, Android only, so'm only, 20-day MVP; native stack (Kotlin or Flutter) was still an open question.

## Decision

One product. The TZ's money-tracking core (budget with necessity levels, assets, 5 stages, offline, monthly report) becomes phases 2–4 and the closed beta. Dilbar's features (voice, lessons, catalogue, calculators, billing) follow as phases 5–8.

| Topic                      | Dilbar                           | TZ                                   | Resolution                                                                                           |
| -------------------------- | -------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Stack                      | Expo + NestJS                    | Kotlin/Flutter + Room (open)         | Keep Expo + NestJS (phase 1 done); expo-sqlite with SQLCipher replaces Room; Android first           |
| Where numbers are computed | backend only                     | on the phone                         | Deterministic shared code (`packages/shared`) runs on both; never an LLM                             |
| Currency                   | UZS + USD in minor units         | so'm, integer                        | UZS-only UI; minor units and currency field kept                                                     |
| Iman                       | not in catalogue                 | asset type                           | Users may record their own Iman holdings; the catalogue still excludes IMAN until cleared            |
| Budget                     | 50/30/20 needs/wants/savings     | essential / moderate / non-essential | Necessity levels on every expense; 50/30/20 maps essential → needs, moderate + non-essential → wants |
| Login                      | phone + SMS OTP, PIN, biometrics | PIN / biometrics                     | Keep both (done)                                                                                     |
| Timeline                   | 12–14 weeks                      | 20 days                              | 20-day target for phases 2–4 + beta; the rest follows                                                |
| Tax                        | —                                | deduct 7.5% / 5%                     | Record net as received; tax only for amounts marked gross; rates to confirm                          |

## Consequences

- CLAUDE.md is rewritten as the merged brief; docs/FINANCE_MODEL.md holds the formulas and corrections.
- Phase 2 changes from "tracking + voice" to "budget + offline"; voice moves to phase 5.
- The original mockups cover voice, budget, lessons and invest; stage, assets and monthly report screens need new designs (docs/design/NOTES.md).
