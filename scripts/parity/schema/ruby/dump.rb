#!/usr/bin/env ruby
# frozen_string_literal: true

# Usage (from repo root):
#   bundle exec --gemfile scripts/parity/schema/ruby/Gemfile \
#     ruby scripts/parity/schema/ruby/dump.rb <fixture-dir> <out.json>
#
# fixture-dir and out.json paths can be relative or absolute.
#
# Applies <fixture-dir>/schema.sql to a fresh SQLite database, introspects
# it using ActiveRecord, canonicalizes the result, and writes canonical JSON
# to <out.json>.
#
# Validates against <fixture-dir>/expected.json (D6) and exits 2 on mismatch.

require "bundler/setup"
require "active_record"
require "sqlite3"
require "tmpdir"
require "json"
require "fileutils"
require_relative "canonicalize"

FILTERED_TABLES = %w[schema_migrations ar_internal_metadata].freeze

def usage
  warn "Usage: bundle exec ruby dump.rb <fixture-dir> <out.json>"
  exit 1
end

fixture_dir, out_path = ARGV
usage unless fixture_dir && out_path

fixture_dir = File.expand_path(fixture_dir)
out_path    = File.expand_path(out_path)

Dir.mktmpdir("parity-ruby-") do |tmpdir|
  db_path = File.join(tmpdir, "schema.db")

  begin
    # 1. Apply schema.sql to a fresh temp SQLite file
    sql = File.read(File.join(fixture_dir, "schema.sql"))
    SQLite3::Database.new(db_path) do |db|
      db.execute_batch(sql)
    end

    # 2. Connect via ActiveRecord
    ActiveRecord::Base.establish_connection(adapter: "sqlite3", database: db_path)
    conn = ActiveRecord::Base.connection

    # 3. Introspect tables, columns, indexes, PKs
    tables = conn.tables.reject { |t| FILTERED_TABLES.include?(t) }.sort

    native_dump = {}
    tables.each do |table_name|
      cols = conn.columns(table_name).map do |col|
        {
          name:      col.name,
          ar_type:   col.type,
          null:      col.null,
          default:   col.default,
          limit:     col.limit,
          precision: col.precision,
          scale:     col.scale,
        }
      end

      raw_pk = conn.primary_key(table_name)
      pk_cols = case raw_pk
      when nil    then []
      when Array  then raw_pk
      else             [raw_pk]
      end

      idxs = conn.indexes(table_name).map do |idx|
        {
          name:    idx.name,
          columns: idx.columns,
          unique:  idx.unique,
          where:   idx.where,
        }
      end

      native_dump[table_name] = {
        columns:             cols,
        indexes:             idxs,
        primary_key_columns: pk_cols,
      }
    end

    # 4. Canonicalize
    canonical = Canonicalize.call(native_dump)

    # 5. Validate against expected.json (D6)
    expected = JSON.parse(File.read(File.join(fixture_dir, "expected.json")))

    actual_tables   = canonical["tables"].map { |t| t["name"] }.sort
    expected_tables = expected["tables"].sort
    if actual_tables != expected_tables
      warn "parity dump: table mismatch\n  expected: #{expected_tables.inspect}\n  actual:   #{actual_tables.inspect}"
      exit 2
    end

    actual_index_count = canonical["tables"].sum { |t| t["indexes"].length }
    if actual_index_count != expected["indexCount"]
      warn "parity dump: index count mismatch\n  expected: #{expected["indexCount"]}\n  actual:   #{actual_index_count}"
      exit 2
    end

    # 6. Write canonical JSON
    FileUtils.mkdir_p(File.dirname(out_path))
    File.write(out_path, JSON.pretty_generate(canonical) + "\n")
    puts "parity dump (rails): wrote #{out_path}"

  ensure
    begin
      ActiveRecord::Base.remove_connection
    rescue StandardError
      # already removed or never opened
    end
  end
end
