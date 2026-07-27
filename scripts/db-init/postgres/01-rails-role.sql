-- Rails' `postgresql:` connection entries carry no credential at all
-- (vendor/rails/activerecord/test/config.example.yml:74-81) — `rake
-- db:postgresql:build` (Rakefile:258-262) just runs createdb as the local
-- user. This role is the container equivalent: a passwordless `rails` role,
-- reachable because the container runs with POSTGRES_HOST_AUTH_METHOD=trust.
--
-- CREATEDB is what trails adds on top of Rails' setup: each vitest worker
-- creates its own AR_DB_SLOT copy of the database (activerecord_unittest_2,
-- _3, …), which Rails' single-database run never needs.
CREATE ROLE rails LOGIN CREATEDB SUPERUSER;
ALTER DATABASE activerecord_unittest OWNER TO rails;
