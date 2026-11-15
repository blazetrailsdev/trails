import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const RUBY_SCRIPT = path.join(__dirname, "extract-ruby-tests.rb");

function rubyTestNames(source: string): string[] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "private-rb-"));
  try {
    const rel = "cases/foo_test.rb";
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, source);
    const driver = `
      require_relative ${JSON.stringify(RUBY_SCRIPT)}
      require "json"
      ex = TestExtractor.new
      ex.process_file(File.join(${JSON.stringify(dir)}, ${JSON.stringify(rel)}), ${JSON.stringify(dir)})
      puts JSON.generate(ex.test_files.flat_map { |f| f[:testCases].map { |tc| tc[:description] } })
    `;
    return JSON.parse(execFileSync("ruby", ["-e", driver], { encoding: "utf-8" }));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("Ruby extractor private test_* defs", () => {
  it("skips a def test_* below a bare private, scoped to its body", () => {
    const names = rubyTestNames(`
class FooTest < ActiveSupport::TestCase
  Post = Struct.new(:title) do
    private
    def secret; end
  end

  class << self
    private
    def helper; end
  end

  def test_runs
    assert test_app_dev_dependencies
  end

  private
    def test_app_dev_dependencies; {}; end
end

class BarTest < ActiveSupport::TestCase
  def test_also_runs; assert true; end
end
`);
    expect(names).toEqual(["runs", "also runs"]);
  });
});
