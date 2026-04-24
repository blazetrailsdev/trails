# frozen_string_literal: true

require "bundler/setup"
require "minitest/autorun"
require "json"
require "tempfile"
require "open3"

# Integration tests for dump.rb — runs the script against real fixtures.
# Must be run under Bundler with scripts/parity/schema/ruby/Gemfile.

GEMFILE     = File.expand_path("../../schema/ruby/Gemfile", __dir__)
DUMP_SCRIPT = File.expand_path("dump.rb", __dir__)
FIXTURES    = File.expand_path("../../fixtures", __dir__)

def run_dump(fixture, frozen_at: nil)
  tf = Tempfile.new(["parity-test-", ".json"])
  out = tf.path
  tf.close  # close so ruby on the other side can write to it
  cmd = ["bundle", "exec", "--gemfile=#{GEMFILE}", "ruby", DUMP_SCRIPT,
         "#{FIXTURES}/#{fixture}", out]
  cmd += ["--frozen-at", frozen_at] if frozen_at
  stdout, stderr, status = Open3.capture3(*cmd)
  [status.exitstatus, stdout, stderr, out]
end

class DumpTest < Minitest::Test
  DEFAULT_FROZEN_AT = "2000-01-01T00:00:00.000Z"

  def test_arel_01_table_object
    code, stdout, stderr, out_path = run_dump("arel-01")
    assert_equal 0, code, "dump failed\nstdout: #{stdout}\nstderr: #{stderr}"
    result = JSON.parse(File.read(out_path))
    assert_equal 1,                result["version"]
    assert_equal "arel-01",        result["fixture"]
    assert_equal DEFAULT_FROZEN_AT, result["frozenAt"]
    assert_match(/"users"/i,       result["sql"])
    assert_equal [],               result["binds"]
  ensure
    File.delete(out_path) if File.exist?(out_path)
  end

  def test_arel_06_eq_predicate
    code, stdout, stderr, out_path = run_dump("arel-06")
    assert_equal 0, code, "dump failed\nstdout: #{stdout}\nstderr: #{stderr}"
    result = JSON.parse(File.read(out_path))
    assert_match(/"users"\."name" = /i, result["sql"])
  ensure
    File.delete(out_path) if File.exist?(out_path)
  end

  def test_arel_09_lt_predicate
    code, stdout, stderr, out_path = run_dump("arel-09")
    assert_equal 0, code, "dump failed\nstdout: #{stdout}\nstderr: #{stderr}"
    result = JSON.parse(File.read(out_path))
    assert_match(/"users"\."age" < /i, result["sql"])
  ensure
    File.delete(out_path) if File.exist?(out_path)
  end

  def test_arel_21_select_manager_with_where
    # arel-21 returns a SelectManager — exercises the to_sql_and_binds branch
    code, stdout, stderr, out_path = run_dump("arel-21")
    assert_equal 0, code, "dump failed\nstdout: #{stdout}\nstderr: #{stderr}"
    result = JSON.parse(File.read(out_path))
    assert_match(/SELECT/i, result["sql"], "expected SELECT statement from SelectManager")
    assert_match(/WHERE/i,  result["sql"], "expected WHERE clause")
  ensure
    File.delete(out_path) if File.exist?(out_path)
  end

  def test_frozen_at_forwarded
    frozen = "2026-01-01T00:00:00.000Z"
    code, stdout, stderr, out_path = run_dump("arel-01", frozen_at: frozen)
    assert_equal 0, code, "dump failed\nstdout: #{stdout}\nstderr: #{stderr}"
    result = JSON.parse(File.read(out_path))
    assert_equal frozen, result["frozenAt"]
  ensure
    File.delete(out_path) if File.exist?(out_path)
  end

  def test_frozen_at_missing_value
    tf = Tempfile.new(["parity-test-", ".json"])
    out = tf.path
    tf.close
    cmd = ["bundle", "exec", "--gemfile=#{GEMFILE}", "ruby", DUMP_SCRIPT,
           "#{FIXTURES}/arel-01", out, "--frozen-at"]
    _stdout, stderr, status = Open3.capture3(*cmd)
    assert_equal 1, status.exitstatus
    assert_match(/--frozen-at requires a value/, stderr)
  ensure
    File.delete(out) if File.exist?(out)
  end

  def test_frozen_at_invalid_format
    tf = Tempfile.new(["parity-test-", ".json"])
    out = tf.path
    tf.close
    cmd = ["bundle", "exec", "--gemfile=#{GEMFILE}", "ruby", DUMP_SCRIPT,
           "#{FIXTURES}/arel-01", out, "--frozen-at", "not-a-timestamp"]
    _stdout, stderr, status = Open3.capture3(*cmd)
    assert_equal 1, status.exitstatus
    assert_match(/--frozen-at must be ISO 8601 UTC with trailing Z/, stderr)
  ensure
    File.delete(out) if File.exist?(out)
  end
end
