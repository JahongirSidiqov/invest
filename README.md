# [APP_NAME]

Personal-finance mobile app for Uzbekistan: voice expense tracking (Uzbek, Russian, mixed), budgets, financial-literacy lessons and an information-only halal investment catalogue.

- Product and engineering brief: [CLAUDE.md](CLAUDE.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Open questions: [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md)

## Layout

| Path                  | What                                                        |
| --------------------- | ----------------------------------------------------------- |
| `apps/api`            | NestJS API (modular monolith), Prisma, PostgreSQL 16, Redis |
| `apps/mobile`         | Expo / React Native app                                     |
| `packages/shared`     | Zod schemas, money utilities, i18n keys                     |
| `packages/api-client` | Types generated from the OpenAPI spec                       |
| `packages/config`     | Shared tsconfig and ESLint config                           |
| `infra`               | docker-compose for local development                        |

## Local development

Requirements: Node.js 24, pnpm, Docker Desktop.

```sh
pnpm install
docker compose -f infra/docker-compose.yml up -d   # Postgres + Redis
cp apps/api/.env.example apps/api/.env
pnpm --filter api prisma:generate
pnpm --filter api prisma:deploy
pnpm --filter api dev                              # API on http://localhost:3000, docs at /docs
```

In development, OTP codes are printed to the API console instead of being sent by SMS.

### Mobile app on your phone

1. Install **Expo Go** on the phone; phone and computer on the same Wi-Fi.
2. Find the computer's IP (`ipconfig`, e.g. `192.168.1.10`) and create `apps/mobile/.env`:
   ```
   EXPO_PUBLIC_API_URL=http://192.168.1.10:3000
   ```
3. Start Expo and scan the QR code with Expo Go:
   ```sh
   pnpm --filter mobile dev
   ```

On Windows, start it from a path with an upper-case drive letter (`C:\...`, the PowerShell default). Metro fails with "Unable to resolve c:\C:\..." when the shell's current directory starts with a lower-case `c:`.

### Tests

```sh
pnpm test                          # unit tests: shared, api, mobile
pnpm --filter api test:int         # API integration tests (needs Postgres + Redis)
```
