-- Sync cursor: one global sequence; a trigger stamps every insert and update.
CREATE SEQUENCE sync_version_seq AS BIGINT;

-- CreateTable
CREATE TABLE "user_settings" (
    "user_id" UUID NOT NULL,
    "reserve_minor" BIGINT NOT NULL,
    "inflation_rate" DECIMAL(6,4),
    "return_rate" DECIMAL(6,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "necessity" TEXT,
    "icon" TEXT,
    "client_updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "server_version" BIGINT NOT NULL DEFAULT nextval('sync_version_seq'),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "category" TEXT,
    "necessity" TEXT,
    "occurred_on" DATE NOT NULL,
    "note" TEXT,
    "source" TEXT NOT NULL,
    "client_updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "server_version" BIGINT NOT NULL DEFAULT nextval('sync_version_seq'),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "categories_user_id_server_version_idx" ON "categories"("user_id", "server_version");

-- CreateIndex
CREATE UNIQUE INDEX "categories_user_id_client_id_key" ON "categories"("user_id", "client_id");

-- CreateIndex
CREATE INDEX "transactions_user_id_server_version_idx" ON "transactions"("user_id", "server_version");

-- CreateIndex
CREATE INDEX "transactions_user_id_occurred_on_idx" ON "transactions"("user_id", "occurred_on");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_user_id_client_id_key" ON "transactions"("user_id", "client_id");


-- ---------------------------------------------------------------------------
-- Hand-written: foreign keys, checks, version trigger, RLS, grants
-- ---------------------------------------------------------------------------
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_reserve_check" CHECK ("reserve_minor" >= 0);
ALTER TABLE "categories" ADD CONSTRAINT "categories_kind_check"
  CHECK ("kind" IN ('expense', 'income_active', 'income_passive'));
ALTER TABLE "categories" ADD CONSTRAINT "categories_necessity_check"
  CHECK ("necessity" IS NULL OR "necessity" IN ('essential', 'moderate', 'non_essential'));
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_type_check"
  CHECK ("type" IN ('income_active', 'income_passive', 'expense', 'investment', 'dividend'));
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_check" CHECK ("amount_minor" > 0);
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_necessity_check"
  CHECK ("necessity" IS NULL OR "necessity" IN ('essential', 'moderate', 'non_essential'));
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_source_check"
  CHECK ("source" IN ('manual', 'voice'));

-- Every write gets a fresh, increasing server_version. Clients pull rows with a
-- version above their cursor. Writes for one user are serialised with an advisory
-- lock in the sync service, so a reader never skips a version that commits later.
CREATE FUNCTION bump_server_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.server_version := nextval('sync_version_seq');
  RETURN NEW;
END $$;

CREATE TRIGGER categories_server_version BEFORE INSERT OR UPDATE ON "categories"
  FOR EACH ROW EXECUTE FUNCTION bump_server_version();
CREATE TRIGGER transactions_server_version BEFORE INSERT OR UPDATE ON "transactions"
  FOR EACH ROW EXECUTE FUNCTION bump_server_version();

ALTER TABLE "user_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY user_settings_owner ON "user_settings"
  USING (app_rls_bypass() OR "user_id" = app_current_user_id())
  WITH CHECK (app_rls_bypass() OR "user_id" = app_current_user_id());

ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categories" FORCE ROW LEVEL SECURITY;
CREATE POLICY categories_owner ON "categories"
  USING (app_rls_bypass() OR "user_id" = app_current_user_id())
  WITH CHECK (app_rls_bypass() OR "user_id" = app_current_user_id());

ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transactions" FORCE ROW LEVEL SECURITY;
CREATE POLICY transactions_owner ON "transactions"
  USING (app_rls_bypass() OR "user_id" = app_current_user_id())
  WITH CHECK (app_rls_bypass() OR "user_id" = app_current_user_id());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'invest_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "user_settings", "categories", "transactions" TO invest_app;
    GRANT USAGE ON SEQUENCE sync_version_seq TO invest_app;
  ELSE
    RAISE WARNING 'role invest_app does not exist; create it and re-run the grants';
  END IF;
END $$;
