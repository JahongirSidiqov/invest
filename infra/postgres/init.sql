-- Local development only.
-- The API connects as invest_app, a non-superuser role, so row-level security
-- policies apply to it. Migrations run as the owner role (invest).
CREATE ROLE invest_app LOGIN PASSWORD 'invest_app';
GRANT CONNECT ON DATABASE invest TO invest_app;
CREATE DATABASE invest_test OWNER invest;
GRANT CONNECT ON DATABASE invest_test TO invest_app;
