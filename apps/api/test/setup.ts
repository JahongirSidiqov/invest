import 'reflect-metadata';
import { config } from 'dotenv';

// Integration tests run against the invest_test database (see infra/postgres/init.sql).
config({ path: '.env.test', quiet: true });
config({ quiet: true });
process.env.NODE_ENV = 'test';
