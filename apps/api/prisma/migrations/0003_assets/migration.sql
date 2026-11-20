-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "asset" UUID,
ADD COLUMN     "capitalised" BOOLEAN;

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "liquid" BOOLEAN NOT NULL,
    "dividend_method" TEXT,
    "opening_invested_minor" BIGINT NOT NULL,
    "opened_on" DATE NOT NULL,
    "note" TEXT,
    "client_updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "server_version" BIGINT NOT NULL DEFAULT nextval('sync_version_seq'),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_valuations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "asset" UUID NOT NULL,
    "value_minor" BIGINT NOT NULL,
    "valued_on" DATE NOT NULL,
    "client_updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "server_version" BIGINT NOT NULL DEFAULT nextval('sync_version_seq'),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_valuations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liabilities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "balance_minor" BIGINT NOT NULL,
    "note" TEXT,
    "client_updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "server_version" BIGINT NOT NULL DEFAULT nextval('sync_version_seq'),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "liabilities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assets_user_id_server_version_idx" ON "assets"("user_id", "server_version");

-- CreateIndex
CREATE UNIQUE INDEX "assets_user_id_client_id_key" ON "assets"("user_id", "client_id");

-- CreateIndex
CREATE INDEX "asset_valuations_user_id_server_version_idx" ON "asset_valuations"("user_id", "server_version");

-- CreateIndex
CREATE INDEX "asset_valuations_user_id_asset_idx" ON "asset_valuations"("user_id", "asset");

-- CreateIndex
CREATE UNIQUE INDEX "asset_valuations_user_id_client_id_key" ON "asset_valuations"("user_id", "client_id");

-- CreateIndex
CREATE INDEX "liabilities_user_id_server_version_idx" ON "liabilities"("user_id", "server_version");

-- CreateIndex
CREATE UNIQUE INDEX "liabilities_user_id_client_id_key" ON "liabilities"("user_id", "client_id");


-- ---------------------------------------------------------------------------
-- Hand-written: foreign keys, checks, version triggers, RLS, grants
-- ---------------------------------------------------------------------------
ALTER TABLE "assets" ADD CONSTRAINT "assets_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "asset_valuations" ADD CONSTRAINT "asset_valuations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "liabilities" ADD CONSTRAINT "liabilities_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

ALTER TABLE "assets" ADD CONSTRAINT "assets_type_check" CHECK ("type" IN
  ('iman', 'asaxiy', 'way2', 'gold', 'foreign_shares', 'livestock', 'bank_deposit', 'card', 'cash', 'other'));
ALTER TABLE "assets" ADD CONSTRAINT "assets_dividend_method_check"
  CHECK ("dividend_method" IS NULL OR "dividend_method" IN ('withdraw', 'capitalise'));
ALTER TABLE "assets" ADD CONSTRAINT "assets_opening_check" CHECK ("opening_invested_minor" >= 0);
ALTER TABLE "asset_valuations" ADD CONSTRAINT "asset_valuations_value_check" CHECK ("value_minor" >= 0);
ALTER TABLE "liabilities" ADD CONSTRAINT "liabilities_kind_check"
  CHECK ("kind" IN ('bank_loan', 'nasiya', 'personal', 'other'));
ALTER TABLE "liabilities" ADD CONSTRAINT "liabilities_balance_check" CHECK ("balance_minor" >= 0);

CREATE TRIGGER assets_server_version BEFORE INSERT OR UPDATE ON "assets"
  FOR EACH ROW EXECUTE FUNCTION bump_server_version();
CREATE TRIGGER asset_valuations_server_version BEFORE INSERT OR UPDATE ON "asset_valuations"
  FOR EACH ROW EXECUTE FUNCTION bump_server_version();
CREATE TRIGGER liabilities_server_version BEFORE INSERT OR UPDATE ON "liabilities"
  FOR EACH ROW EXECUTE FUNCTION bump_server_version();

ALTER TABLE "assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assets" FORCE ROW LEVEL SECURITY;
CREATE POLICY assets_owner ON "assets"
  USING (app_rls_bypass() OR "user_id" = app_current_user_id())
  WITH CHECK (app_rls_bypass() OR "user_id" = app_current_user_id());

ALTER TABLE "asset_valuations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "asset_valuations" FORCE ROW LEVEL SECURITY;
CREATE POLICY asset_valuations_owner ON "asset_valuations"
  USING (app_rls_bypass() OR "user_id" = app_current_user_id())
  WITH CHECK (app_rls_bypass() OR "user_id" = app_current_user_id());

ALTER TABLE "liabilities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "liabilities" FORCE ROW LEVEL SECURITY;
CREATE POLICY liabilities_owner ON "liabilities"
  USING (app_rls_bypass() OR "user_id" = app_current_user_id())
  WITH CHECK (app_rls_bypass() OR "user_id" = app_current_user_id());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'invest_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "assets", "asset_valuations", "liabilities" TO invest_app;
  ELSE
    RAISE WARNING 'role invest_app does not exist; create it and re-run the grants';
  END IF;
END $$;
