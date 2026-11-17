import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Migrations run as the database owner (DATABASE_URL).
// The running API connects as a non-superuser role (APP_DATABASE_URL) so RLS applies.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
