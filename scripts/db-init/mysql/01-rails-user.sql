-- Rails' `rails` test user, as `rake db:mysql:build_user` provisions it
-- (vendor/rails/activerecord/Rakefile:227-235): CREATE USER with no
-- IDENTIFIED BY, so the user has no password — which is what
-- `username: rails` in test/config.example.yml:4,24 connects as.
--
-- Rails grants on the test database plus inexistent_activerecord_unittest;
-- this grants globally instead, because each vitest worker creates its own
-- AR_DB_SLOT copy of the database (activerecord_unittest_2, _3, …) and
-- Rails' single-database run never needs that.
CREATE USER IF NOT EXISTS 'rails'@'%';
GRANT ALL PRIVILEGES ON *.* TO 'rails'@'%';
-- MYSQL_SOCK is a first-class sub-setting here (config.example.yml:18-19), and
-- a socket connection authenticates as 'rails'@'localhost', which '%' does not
-- cover. Rails' rake task grants only '%' because its own runs are over TCP.
CREATE USER IF NOT EXISTS 'rails'@'localhost';
GRANT ALL PRIVILEGES ON *.* TO 'rails'@'localhost';
FLUSH PRIVILEGES;
