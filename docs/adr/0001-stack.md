# ADR 0001: Stack and runtime versions

Date: 2026-11-17 · Status: accepted

## Decision

Use the stack from the brief (Expo + NestJS + Prisma + PostgreSQL 16 + Redis, pnpm + Turborepo) with these version choices:

- **Node.js 24 LTS** instead of 22. Node 22 leaves maintenance in April 2027, shortly after the planned MVP launch; 24 is supported until 2028.
- **Prisma 7.10** (latest stable). The npm `latest` tag of the Prisma CLI pointed at an 8.0 release candidate on this date, so versions are pinned explicitly.
- Expo SDK, NestJS and other libraries: latest stable at the time of scaffolding, pinned in lockfile.

## Consequences

CI and Dockerfiles use Node 24. Upgrading Prisma to 8 is a separate, deliberate change.
