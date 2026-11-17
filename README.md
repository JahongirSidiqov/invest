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
pnpm --filter api prisma:migrate
pnpm dev                                           # API on :3000, Expo dev server
```

In development, OTP codes are printed to the API console instead of being sent by SMS.
