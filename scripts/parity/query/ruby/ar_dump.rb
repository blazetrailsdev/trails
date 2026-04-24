#!/usr/bin/env ruby
# frozen_string_literal: true

# Usage (from repo root):
#   bundle exec --gemfile scripts/parity/schema/ruby/Gemfile \
#     ruby scripts/parity/query/ruby/ar_dump.rb <fixture-dir> <out.json> \
#     [--frozen-at ISO8601_UTC_Z]
#
# Like scripts/parity/query/ruby/dump.rb but tailored to ActiveRecord
# query fixtures: applies <fixture-dir>/schema.sql, establishes an AR
# connection, loads <fixture-dir>/models.rb (class definitions +
# associations), evaluates <fixture-dir>/query.rb against them, and
# writes a CanonicalQuery JSON with the SQL the terminal relation
# produces via `.to_sql`.
#
# Time is always frozen for deterministic query evaluation. --frozen-at
# pins the timestamp to a specific ISO 8601 UTC value (trailing Z
# required); omitting it uses 2000-01-01T00:00:00.000Z.

require "bundler/setup"
require "active_record"
require "active_support"
require "active_support/core_ext/integer/time"
require "active_support/testing/time_helpers"
require "sqlite3"
require "tmpdir"
require "json"
require "fileutils"
require "time"

def usage
  warn "Usage: bundle exec --gemfile scripts/parity/schema/ruby/Gemfile ruby scripts/parity/query/ruby/ar_dump.rb <fixture-dir> <out.json> [--frozen-at ISO8601_UTC_Z]"
  exit 1
end

def parse_args(argv)
  fixture_dir = nil
  out_path    = nil
  frozen_at   = nil
  i = 0
  while i < argv.length
    case argv[i]
    when "--frozen-at"
      i += 1
      val = argv[i]
      if val.nil? || val.start_with?("--")
        warn "--frozen-at requires a value"
        exit 1
      end
      frozen_at = val
    else
      if fixture_dir.nil?
        fixture_dir = argv[i]
      elsif out_path.nil?
        out_path = argv[i]
      else
        warn "unexpected argument: #{argv[i]}"
        usage
      end
    end
    i += 1
  end
  usage unless fixture_dir && out_path
  [File.expand_path(fixture_dir), File.expand_path(out_path), frozen_at]
end

fixture_dir, out_path, frozen_at = parse_args(ARGV)
fixture_name = File.basename(fixture_dir)

frozen_time = if frozen_at
  unless frozen_at.match?(/\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z\z/)
    warn "--frozen-at must be ISO 8601 UTC with trailing Z (e.g. 2026-01-01T00:00:00.000Z)"
    exit 1
  end
  Time.iso8601(frozen_at).utc
else
  Time.utc(2000, 1, 1)
end
frozen_ts = frozen_at || frozen_time.iso8601(3)

module TimeHelper
  include ActiveSupport::Testing::TimeHelpers
end
time_helper = Object.new.extend(TimeHelper)

Dir.mktmpdir("parity-ar-ruby-") do |tmpdir|
  db_path = File.join(tmpdir, "query.db")

  begin
    # 1. Apply schema.sql to a fresh temp SQLite file.
    SQLite3::Database.new(db_path) do |db|
      db.execute_batch(File.read(File.join(fixture_dir, "schema.sql")))
    end

    # 2. Connect AR — models.rb's class definitions inherit from
    #    ActiveRecord::Base which reads the current connection at eval.
    ActiveRecord::Base.establish_connection(adapter: "sqlite3", database: db_path)

    # 3. Freeze time before loading fixture code in case a model uses
    #    Time.current in a default scope or a class-level filter.
    time_helper.travel_to(frozen_time)

    # 4. Load models.rb first, then evaluate query.rb. Both go through the
    #    same isolated binding so class constants set by models.rb are
    #    visible to query.rb (they land on TOPLEVEL via class keyword).
    query_context = Object.new
    query_binding = query_context.instance_eval { binding }

    models_path = File.join(fixture_dir, "models.rb")
    if File.exist?(models_path)
      models_source = File.read(models_path)
      # rubocop:disable Security/Eval
      eval(models_source, query_binding, models_path)
      # rubocop:enable Security/Eval
    end

    query_path   = File.join(fixture_dir, "query.rb")
    query_source = File.read(query_path)
    # rubocop:disable Security/Eval
    result = eval(query_source, query_binding, query_path)
    # rubocop:enable Security/Eval
    raise "[#{fixture_name}] query.rb returned nil" if result.nil?
    unless result.respond_to?(:to_sql)
      raise "[#{fixture_name}] query.rb returned #{result.class}: expected an AR relation / Arel manager responding to #to_sql"
    end

    # 5. Extract SQL. For AR relations, Relation#to_sql renders the SQL
    #    with literal values inlined (binds pre-substituted), so binds is
    #    always []. Same contract as the arel runner.
    sql_str = result.to_sql.strip
    binds = []

    # 6. Write CanonicalQuery JSON
    canonical = {
      "version"  => 1,
      "fixture"  => fixture_name,
      "frozenAt" => frozen_ts,
      "sql"      => sql_str,
      "binds"    => binds,
    }

    FileUtils.mkdir_p(File.dirname(out_path))
    File.write(out_path, JSON.pretty_generate(canonical) + "\n")

    puts "[rails] #{fixture_name}"
    puts "  result type : #{result.class}"
    puts "  sql         : #{sql_str}"
    puts "  frozenAt    : #{frozen_ts}"
    puts "  → #{out_path}"

  ensure
    time_helper.travel_back
    begin
      ActiveRecord::Base.remove_connection
    rescue StandardError
      # already removed or never opened
    end
  end
end
