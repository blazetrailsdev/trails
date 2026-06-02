import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { TestGate } from "./types.js";

const HERE = __dirname;

// The Ruby extractor is exercised through its real Ripper parser (shelled out)
// so the test pins the exact production behavior, not a re-implementation.
describe("Ruby extractor gate detection", () => {
  const RUBY_SCRIPT = path.join(HERE, "extract-ruby-tests.rb");

  function rubyGates(fixtures: Record<string, string>): Record<string, TestGate | undefined> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-rb-"));
    try {
      for (const [rel, src] of Object.entries(fixtures)) {
        const p = path.join(dir, rel);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, src);
      }
      const rels = JSON.stringify(Object.keys(fixtures));
      const driver = `
        require_relative ${JSON.stringify(RUBY_SCRIPT)}
        require "json"
        ex = TestExtractor.new
        JSON.parse(${JSON.stringify(rels)}).each do |rel|
          ex.process_file(File.join(${JSON.stringify(dir)}, rel), ${JSON.stringify(dir)})
        end
        out = {}
        ex.test_files.each { |f| f[:testCases].each { |tc| out[tc[:description]] = tc[:gate] } }
        puts JSON.generate(out)
      `;
      const stdout = execFileSync("ruby", ["-e", driver], { encoding: "utf-8" });
      return JSON.parse(stdout);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  it("derives gates from dir, class wrapping, and in-body skips", () => {
    const g = rubyGates({
      "cases/adapters/postgresql/foo_test.rb": `
        class FooTest < ActiveRecord::TestCase
          test "pg dir" do; assert true; end
        end
      `,
      "cases/bar_test.rb": `
        class BarTest < ActiveRecord::TestCase
          if current_adapter?(:PostgreSQLAdapter)
            test "class gated" do; assert true; end
          end

          test "feature skip" do
            skip "needs json" unless supports_json?
            assert true
          end

          test "skip if mysql" do
            skip "mysql wrong" if current_adapter?(:Mysql2Adapter, :TrilogyAdapter)
            assert true
          end

          test "unconditional" do; assert true; end
        end
      `,
    });

    expect(g["pg dir"]).toEqual({ adapters: ["postgresql"], source: ["dir"] });
    expect(g["class gated"]).toEqual({ adapters: ["postgresql"], source: ["class"] });
    expect(g["feature skip"]).toEqual({ features: ["json"], source: ["body-skip"] });
    expect(g["skip if mysql"]).toEqual({
      adapters: ["postgresql", "sqlite"],
      source: ["body-skip"],
    });
    // No gate key on the test case → null over the JSON boundary.
    expect(g["unconditional"] ?? null).toBeNull();
  });

  it("inverts `unless current_adapter?` to the complementary set", () => {
    const g = rubyGates({
      "cases/baz_test.rb": `
        class BazTest < ActiveRecord::TestCase
          unless current_adapter?(:PostgreSQLAdapter)
            test "non pg" do; assert true; end
          end
        end
      `,
    });
    expect(g["non pg"]).toEqual({ adapters: ["mysql", "sqlite"], source: ["class"] });
  });

  it("captures DB-feature support keys and version/mariadb guards", () => {
    const g = rubyGates({
      "cases/qux_test.rb": `
        class QuxTest < ActiveRecord::TestCase
          test "needs savepoints" do
            skip "no savepoints" unless supports_savepoints?
            assert true
          end

          test "mariadb only" do
            skip "mariadb thing" unless @conn.mariadb?
            assert true
          end
        end
      `,
    });
    expect(g["needs savepoints"]).toEqual({ features: ["savepoints"], source: ["body-skip"] });
    expect(g["mariadb only"]).toEqual({ guards: ["mariadb"], source: ["body-skip"] });
  });
});
