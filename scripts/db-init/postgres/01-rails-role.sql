-- rake db:postgresql:build (vendor/rails/activerecord/Rakefile:258-262) creates
-- no role at all — it runs createdb as the local user, and Rails' postgresql:
-- entries carry no credential (test/config.example.yml:74-81).
--
-- PERMANENT DEVIATION, the whole file: a service container has no "local user"
-- to inherit, so the equivalent is a passwordless `rails` role, reachable
-- because the container runs POSTGRES_HOST_AUTH_METHOD=trust.
--
-- CREATEDB is what each vitest worker needs to create its own AR_DB_SLOT copy
-- of the database (activerecord_unittest_<token>_1, _2, …).
--
-- SUPERUSER cannot be narrowed away: Rails' local user is a superuser by
-- construction (it initdb'd the cluster), and the suite installs extensions
-- that are not trusted, for which owning the database is not enough —
-- postgres_fdw (adapters/postgresql/foreign-table.test.ts, which also CREATEs a
-- SERVER) and pg_hint_plan (adapters/postgresql/optimizer-hints.test.ts). Only
-- the trusted ones (hstore, citext) would work under a plain owner.
CREATE ROLE rails LOGIN CREATEDB SUPERUSER;
ALTER DATABASE activerecord_unittest OWNER TO rails;
