-- rake db:mysql:build_user (vendor/rails/activerecord/Rakefile:227-235), which
-- CREATEs the user with no IDENTIFIED BY — `username: rails` in
-- test/config.example.yml:4,24 connects with no password.
--
-- Rails' grant is on the literal test database. Widened here to the
-- `activerecord_unittest%` pattern, which is what lets the user CREATE its own
-- AR_DB_SLOT copies (activerecord_unittest_<token>_1, _2, …, and the arunit2
-- database activerecord_unittest2) — Rails' single-database run never needs
-- that. Deliberately not widened to *.*: `mysql` stays unreachable.
--
-- Rails' second grant is reproduced literally: it is what makes a connection to
-- inexistent_activerecord_unittest fail with "Unknown database" instead of
-- "access denied", which abstract-mysql-adapter/connection.test.ts and
-- mysql2-adapter.test.ts assert on.
CREATE USER IF NOT EXISTS 'rails'@'%';
GRANT ALL PRIVILEGES ON `activerecord_unittest%`.* TO 'rails'@'%';
GRANT ALL PRIVILEGES ON inexistent_activerecord_unittest.* TO 'rails'@'%';
-- PERMANENT DEVIATION: Rails grants only '%' because its runs are over TCP.
-- MYSQL_SOCK is a first-class sub-setting here (config.example.yml:18-19) and a
-- socket connection authenticates as 'rails'@'localhost', which '%' misses.
CREATE USER IF NOT EXISTS 'rails'@'localhost';
GRANT ALL PRIVILEGES ON `activerecord_unittest%`.* TO 'rails'@'localhost';
GRANT ALL PRIVILEGES ON inexistent_activerecord_unittest.* TO 'rails'@'localhost';
FLUSH PRIVILEGES;
