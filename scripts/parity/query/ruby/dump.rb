#!/usr/bin/env ruby
# frozen_string_literal: true

# Usage (from repo root):
#   bundle exec --gemfile scripts/parity/schema/ruby/Gemfile \
#     ruby scripts/parity/query/ruby/dump.rb <fixture-dir> <out.json> \
#     [--frozen-at ISO8601_UTC_Z]
#
# Applies <fixture-dir>/schema.sql to a fresh SQLite database, evaluates
# <fixture-dir>/query.rb, extracts SQL and binds (via to_sql_and_binds
# with fallback to to_sql), and writes a CanonicalQuery JSON to <out.json>.
#
# Time is always frozen for deterministic query evaluation. --frozen-at
# pins the timestamp to a specific ISO 8601 UTC value (trailing Z required,
# e.g. 2026-01-01T00:00:00.000Z); omitting it uses 2000-01-01T00:00:00.000Z.

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
  warn "Usage: bundle exec --gemfile scripts/parity/schema/ruby/Gemfile ruby scripts/parity/query/ruby/dump.rb <fixture-dir> <out.json> [--frozen-at ISO8601_UTC_Z]"
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

# Validate and parse frozen_at — must be ISO 8601 UTC (trailing Z required).
# Time.parse is too permissive; enforce the format from canonical/query.schema.json.
frozen_time = if frozen_at
  unless frozen_at.match?(/\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z\z/)
    warn "--frozen-at must be ISO 8601 UTC with trailing Z (e.g. 2026-01-01T00:00:00.000Z)"
    exit 1
  end
  Time.iso8601(frozen_at).utc
else
  # Fixed default so direct invocations (e.g. during development) are still
  # reproducible. The query parity orchestrator (added in PR5 of
  # docs/query-parity-verification.md) always passes --frozen-at explicitly
  # so both sides use the same timestamp in a parity run.
  Time.utc(2000, 1, 1)
end
frozen_ts = frozen_at || frozen_time.iso8601(3)  # e.g. "2026-04-24T00:00:00.000Z"

# TimeHelper mixin — provides travel_to / travel_back
module TimeHelper
  include ActiveSupport::Testing::TimeHelpers
end
time_helper = Object.new.extend(TimeHelper)

Dir.mktmpdir("parity-query-ruby-") do |tmpdir|
  db_path = File.join(tmpdir, "query.db")

  begin
    # 1. Apply schema.sql to a fresh temp SQLite file
    SQLite3::Database.new(db_path) do |db|
      db.execute_batch(File.read(File.join(fixture_dir, "schema.sql")))
    end

    # 2. Connect via ActiveRecord
    ActiveRecord::Base.establish_connection(adapter: "sqlite3", database: db_path)
    conn = ActiveRecord::Base.connection

    # 3. Always freeze time so query evaluation is deterministic
    time_helper.travel_to(frozen_time)

    # 4. Evaluate query.rb — last expression is the Arel node/manager to dump.
    # Pass the file path and an isolated binding so:
    # 1. Stack traces reference query.rb line numbers, not "(eval)".
    # 2. Runner-local variables (fixture_dir, out_path, etc.) don't leak into
    #    the fixture's scope and can't be accidentally referenced.
    query_path    = File.join(fixture_dir, "query.rb")
    query_source  = File.read(query_path)
    query_context = Object.new
    query_binding = query_context.instance_eval { binding }
    # rubocop:disable Security/Eval
    result = eval(query_source, query_binding, query_path)
    # rubocop:enable Security/Eval
    raise "[#{fixture_name}] query.rb returned nil" if result.nil?
    unless result.respond_to?(:to_sql) || result.respond_to?(:ast)
      raise "[#{fixture_name}] query.rb returned #{result.class}: expected an Arel node or manager"
    end

    # 5. Get SQL and binds.
    #    Managers expose .ast; pass it directly to to_sql_and_binds which compiles via
    #    the visitor and returns Rails-style bind objects. Plain nodes (no .ast) are
    #    rendered directly via to_sql — they carry no bind params.
    raw_sql, raw_binds =
      if result.respond_to?(:ast)
        conn.to_sql_and_binds(result.ast)
      else
        # Plain node — Arel::Nodes::Node#to_sql (arel/nodes/node.rb:148)
        [result.to_sql.strip, []]
      end

    binds = Array(raw_binds).map do |b|
      raw = if b.respond_to?(:value_before_type_cast)
        b.value_before_type_cast
      elsif b.respond_to?(:value)
        b.value
      else
        b
      end
      # nil bind = SQL NULL; keep as "NULL" so binds array stays string[] per schema
      raw.nil? ? "NULL" : raw.to_s
    end
    sql_str = raw_sql.strip

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

    # Verbose output for debugging in CI logs
    puts "[rails] #{fixture_name}"
    puts "  result type : #{result.class}"
    puts "  sql         : #{sql_str}"
    puts "  binds (#{binds.length})  : #{binds.inspect}" unless binds.empty?
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
