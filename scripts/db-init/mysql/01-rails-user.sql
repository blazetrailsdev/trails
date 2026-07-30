-- Rails' `rails` test user, as `rake db:mysql:build_user` provisions it
-- (vendor/rails/activerecord/Rakefile:227-235): CREATE USER with no
-- IDENTIFIED BY, so the user has no password — which is what
-- `username: rails` in test/config.example.yml:4,24 connects as.
--
-- Rails grants on the test database plus inexistent_activerecord_unittest.
-- The first grant is widened to an `activerecord_unittest%` pattern rather
-- than the literal database because each vitest worker creates its own
-- AR_DB_SLOT copy (activerecord_unittest_<token>_1, _2, …) alongside the
-- arunit2 database activerecord_unittest2 — all of which share that prefix.
-- It is not widened past it: with no grant on *.*, the user still cannot
-- touch `mysql` or anything outside the suite's namespace.
--
-- inexistent_activerecord_unittest is granted literally, exactly as Rails
-- does, so connecting to it fails with "Unknown database" rather than "access
-- denied" (abstract-mysql-adapter/connection.test.ts, mysql2-adapter.test.ts).
CREATE USER IF NOT EXISTS 'rails'@'%';
GRANT ALL PRIVILEGES ON `activerecord_unittest%`.* TO 'rails'@'%';
GRANT ALL PRIVILEGES ON inexistent_activerecord_unittest.* TO 'rails'@'%';
-- PERMANENT DEVIATION: MYSQL_SOCK is a first-class sub-setting here
-- (config.example.yml:18-19), and a socket connection authenticates as
-- 'rails'@'localhost', which '%' does not cover. Rails' rake task grants only
-- '%' because its own runs are over TCP. Same narrowed grants.
CREATE USER IF NOT EXISTS 'rails'@'localhost';
GRANT ALL PRIVILEGES ON `activerecord_unittest%`.* TO 'rails'@'localhost';
GRANT ALL PRIVILEGES ON inexistent_activerecord_unittest.* TO 'rails'@'localhost';
FLUSH PRIVILEGES;
