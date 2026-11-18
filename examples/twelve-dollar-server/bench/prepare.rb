# Micro-benchmark: one prepare + close of the feed query through the sqlite3 gem.
require "sqlite3"
dir = File.dirname(__FILE__)
db = SQLite3::Database.new(":memory:")
db.execute_batch(File.read(File.join(dir, "prepare-schema.sql")))
sql = File.read(File.join(dir, "prepare-feed.sql")).strip
n = 200_000
20_000.times { db.prepare(sql).close }
t = Process.clock_gettime(Process::CLOCK_MONOTONIC)
n.times { db.prepare(sql).close }
dt = Process.clock_gettime(Process::CLOCK_MONOTONIC) - t
puts "sqlite3 gem #{SQLite3::VERSION} (SQLite #{SQLite3::SQLITE_VERSION}): #{(dt / n * 1e6).round(2)} us/prepare"
