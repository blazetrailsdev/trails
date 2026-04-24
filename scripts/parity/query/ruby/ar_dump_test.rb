# frozen_string_literal: true

require "bundler/setup"
require "minitest/autorun"
require "json"
require "tempfile"
require "open3"

# Integration tests for ar_dump.rb — runs the script against real ar-* fixtures.
# Must be run under Bundler with scripts/parity/schema/ruby/Gemfile.

GEMFILE     = File.expand_path("../../schema/ruby/Gemfile", __dir__)
AR_DUMP     = File.expand_path("ar_dump.rb", __dir__)
FIXTURES    = File.expand_path("../../fixtures", __dir__)

def run_ar_dump(fixture, frozen_at: nil)
  tf = Tempfile.new(["parity-ar-test-", ".json"])
  out = tf.path
  tf.close  # close so ruby on the other side can write to it
  cmd = ["bundle", "exec", "--gemfile=#{GEMFILE}", "ruby", AR_DUMP,
         "#{FIXTURES}/#{fixture}", out]
  cmd += ["--frozen-at", frozen_at] if frozen_at
  stdout, stderr, status = Open3.capture3(*cmd)
  [status.exitstatus, stdout, stderr, out]
end

class ArDumpTest < Minitest::Test
  DEFAULT_FROZEN_AT = "2000-01-01T00:00:00.000Z"

  def test_ar_00_book_all
    code, stdout, stderr, out_path = run_ar_dump("ar-00")
    assert_equal 0, code, "dump failed\nstdout: #{stdout}\nstderr: #{stderr}"
    result = JSON.parse(File.read(out_path))
    assert_equal 1,                  result["version"]
    assert_equal "ar-00",            result["fixture"]
    assert_equal DEFAULT_FROZEN_AT,  result["frozenAt"]
    assert_equal 'SELECT "books".* FROM "books"', result["sql"]
    assert_equal [],                 result["binds"]
  ensure
    File.delete(out_path) if out_path && File.exist?(out_path)
  end

  def test_frozen_at_forwarded
    frozen = "2026-01-01T00:00:00.000Z"
    code, stdout, stderr, out_path = run_ar_dump("ar-00", frozen_at: frozen)
    assert_equal 0, code, "dump failed\nstdout: #{stdout}\nstderr: #{stderr}"
    result = JSON.parse(File.read(out_path))
    assert_equal frozen, result["frozenAt"]
  ensure
    File.delete(out_path) if out_path && File.exist?(out_path)
  end

  def test_frozen_at_missing_value
    tf = Tempfile.new(["parity-ar-test-", ".json"])
    out = tf.path
    tf.close
    cmd = ["bundle", "exec", "--gemfile=#{GEMFILE}", "ruby", AR_DUMP,
           "#{FIXTURES}/ar-00", out, "--frozen-at"]
    _stdout, stderr, status = Open3.capture3(*cmd)
    assert_equal 1, status.exitstatus
    assert_match(/--frozen-at requires a value/, stderr)
  ensure
    File.delete(out) if out && File.exist?(out)
  end

  def test_frozen_at_invalid_format
    tf = Tempfile.new(["parity-ar-test-", ".json"])
    out = tf.path
    tf.close
    cmd = ["bundle", "exec", "--gemfile=#{GEMFILE}", "ruby", AR_DUMP,
           "#{FIXTURES}/ar-00", out, "--frozen-at", "not-a-timestamp"]
    _stdout, stderr, status = Open3.capture3(*cmd)
    assert_equal 1, status.exitstatus
    assert_match(/--frozen-at must be ISO 8601 UTC with trailing Z/, stderr)
  ensure
    File.delete(out) if out && File.exist?(out)
  end
end
