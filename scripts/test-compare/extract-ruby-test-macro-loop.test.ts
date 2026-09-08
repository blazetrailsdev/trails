import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const HERE = __dirname;
const RUBY_SCRIPT = path.join(HERE, "extract-ruby-tests.rb");

interface Extracted {
  cases: Array<{ description: string; style: string; assertionCount: number }>;
  unexpandedLoops: string[];
}

function extract(body: string): Extracted {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "test-macro-loop-rb-"));
  try {
    const rel = "cases/foo_test.rb";
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, `class FooTest < ActiveSupport::TestCase\n${body}\nend\n`);
    const driver = `
      require_relative ${JSON.stringify(RUBY_SCRIPT)}
      require "json"
      ex = TestExtractor.new
      ex.process_file(File.join(${JSON.stringify(dir)}, ${JSON.stringify(rel)}), ${JSON.stringify(dir)})
      cases = ex.test_files.flat_map { |f| f[:testCases] }
        .map { |tc| { description: tc[:description], style: tc[:style], assertionCount: tc[:assertionCount] } }
      puts JSON.generate({ cases: cases, unexpandedLoops: ex.unexpanded_loops })
    `;
    return JSON.parse(execFileSync("ruby", ["-e", driver], { encoding: "utf-8" }));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("Ruby extractor test-macro loop expansion", () => {
  it("expands a constant table destructured by the block, one case per row", () => {
    // journey/route/definition/scanner_test.rb:70-75 — without expansion the
    // whole family collapses to the interpolation's literal prefix.
    const { cases, unexpandedLoops } = extract(`
      CASES = [
        ["/",     [:SLASH]],
        ["*omg",  [:STAR]],
      ]

      CASES.each do |pattern, expected_tokens|
        test "Scanning \`#{pattern}\`" do
          @scanner.scan_setup pattern
          assert_tokens expected_tokens, @scanner, pattern
        end
      end
    `);
    expect(cases).toEqual([
      { description: "Scanning `/`", style: "test", assertionCount: 1 },
      { description: "Scanning `*omg`", style: "test", assertionCount: 1 },
    ]);
    expect(unexpandedLoops).toEqual([]);
  });

  it("expands an inline array literal with a single block parameter", () => {
    const { cases } = extract(`
      ["get", "post"].each do |verb|
        test "routes #{verb}" do
          assert_equal 1, 1
        end
      end
    `);
    expect(cases.map((c) => c.description)).toEqual(["routes get", "routes post"]);
  });

  it("leaves an unresolvable receiver to the ordinary walk", () => {
    const { cases, unexpandedLoops } = extract(`
      SERIALIZERS.keys.each do |format|
        test "round trips #{format}" do
          assert_equal 1, 1
        end
      end
    `);
    expect(cases.map((c) => c.description)).toEqual(["round trips "]);
    expect(unexpandedLoops).toEqual([]);
  });
});
