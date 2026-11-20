# ADR 0003: Phone-only (local) mode and the first APK

Date: 2026-11-20 · Status: accepted (owner asked for a finished APK; defaults chosen per the owner's 2026-11-18 instruction)

## Context

The owner asked for an installable APK. No server is hosted yet ([HOSTING_PROVIDER_UZ] is open) and the owner's computer cannot run Docker (CPU virtualisation is disabled in firmware). Without a server, SMS login cannot work. The TZ (§9, first risk) allows "a version that works only on the phone first, server later".

## Decision

- The mobile app has a **local mode**, selected at build time: when `EXPO_PUBLIC_API_URL` is not set, there is no SMS login and no sync. Language → PIN (and biometrics) → onboarding → app. Every record stays in the SQLCipher-encrypted database on the phone.
- In local mode five wrong PINs pause entry for 5 minutes instead of signing out, because signing out deletes the only copy of the data.
- With `EXPO_PUBLIC_API_URL` set (EAS profile `preview-server`), the same code uses SMS login and background sync.
- APKs are built in the cloud with EAS Build (profile `preview`). A local Gradle build needs about 3 GB of Android SDK, NDK and Gradle downloads, which the current connection (~50 KB/s) cannot do in reasonable time.

## Decisions taken by default in this release (recorded in docs/OPEN_QUESTIONS.md)

- Capitalised dividends count as passive income P and raise the asset's value automatically.
- MVP currency is so'm only.
- Liquid savings L = card, cash and bank deposit; Iman, Asaxiy and other platforms are productive assets.
- Big goals G = 0 until the goals screen exists, so stage 5 compares passive income with total spending only.
- Onboarding asks for current savings and average monthly spending to show a provisional stage.

## Consequences

- Data in a local-mode install is not backed up anywhere. Uninstalling the app deletes it. The release notes must say so.
- When a server goes live, local-mode users need a migration path (push local records on first login). Not built yet.
