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

  // Fixtures are minimal — the extractor needs no class wrapper or assertion body.
  it("derives gates from dir, class wrapping, and in-body skips", () => {
    const g = rubyGates({
      "cases/adapters/postgresql/foo_test.rb": `test "pg dir" do; end`,
      "cases/bar_test.rb": `
        if current_adapter?(:PostgreSQLAdapter)
          test "class gated" do; end
        end
        unless current_adapter?(:PostgreSQLAdapter)
          test "non pg" do; end
        end
        test "feature skip" do; skip "j" unless supports_json?; end
        test "skip if mysql" do; skip "m" if current_adapter?(:Mysql2Adapter, :TrilogyAdapter); end
        test "mariadb only" do; skip "mar" unless @c.mariadb?; end
        test "unconditional" do; end
      `,
    });
    expect(g["pg dir"]).toEqual({ adapters: ["postgresql"], source: ["dir"] });
    expect(g["class gated"]).toEqual({ adapters: ["postgresql"], source: ["class"] });
    expect(g["non pg"]).toEqual({ adapters: ["mysql", "sqlite"], source: ["class"] });
    expect(g["feature skip"]).toEqual({ features: ["json"], source: ["body-skip"] });
    expect(g["skip if mysql"]).toEqual({
      adapters: ["postgresql", "sqlite"],
      source: ["body-skip"],
    });
    expect(g["mariadb only"]).toEqual({ guards: ["mariadb"], source: ["body-skip"] });
    expect(g["unconditional"] ?? null).toBeNull(); // no gate key → null over JSON
  });

  it("treats prepared_statements as a guard, dropping the adapter set in a compound", () => {
    const g = rubyGates({
      "cases/bar_test.rb": `
        unless current_adapter?(:PostgreSQLAdapter) ||
            (current_adapter?(:SQLite3Adapter) && !ActiveRecord::Base.lease_connection.prepared_statements)
          test "ps compound" do; end
        end
        if current_adapter?(:PostgreSQLAdapter) && ActiveRecord::Base.lease_connection.prepared_statements
          test "pg and ps" do; end
        end
      `,
    });
    // The runtime `prepared_statements` predicate can't be evaluated statically,
    // so a compound mixing it with an adapter check drops the (unsound) adapter
    // set and keeps a non-comparable guard.
    expect(g["ps compound"]).toEqual({ guards: ["prepared_statements"], source: ["class"] });
    expect(g["pg and ps"]).toEqual({ guards: ["prepared_statements"], source: ["class"] });
  });

  it("captures a negated current_adapter? exclusion in a compound trailing-if", () => {
    const g = rubyGates({
      // Mirrors persistence_test.rb:1614 — `end if supports_X? && !current_adapter?(:SQLite3Adapter)`.
      "cases/persistence_test.rb": `
        def test_returns_pk_after_insert; end if supports_insert_returning? && !current_adapter?(:SQLite3Adapter)
        def test_pure_exclusion; end if !current_adapter?(:SQLite3Adapter)
        def test_feature_only; end if supports_insert_returning?
        def test_or_compound; end if supports_insert_returning? || !current_adapter?(:SQLite3Adapter)
      `,
    });
    // feature + adapter exclusion both surface (SQLite dropped).
    expect(g["returns pk after insert"]).toEqual({
      adapters: ["mysql", "postgresql"],
      features: ["insert_returning"],
      source: ["class"],
    });
    // a bare negated adapter is the complement adapter set.
    expect(g["pure exclusion"]).toEqual({
      adapters: ["mysql", "postgresql"],
      source: ["class"],
    });
    // unchanged: feature-only stays feature-only.
    expect(g["feature only"]).toEqual({ features: ["insert_returning"], source: ["class"] });
    // `||` makes the run-on set a disjunction → the exclusion is unsound, dropped.
    expect(g["or compound"]).toEqual({ features: ["insert_returning"], source: ["class"] });
  });

  it("does not emit an adapter exclusion under `unless` (negation → disjunction)", () => {
    const g = rubyGates({
      // `unless feature && !sqlite` runs when `!feature || sqlite` — a disjunction
      // that isn't one adapter set, so only the inverted feature guard surfaces.
      "cases/bar_test.rb": `
        def test_unless_compound; end unless supports_insert_returning? && !current_adapter?(:SQLite3Adapter)
      `,
    });
    expect(g["unless compound"]).toEqual({ guards: ["no_insert_returning"], source: ["class"] });
  });

  it("intersects a positive adapter with a negated adapter in a pure conjunction", () => {
    const g = rubyGates({
      "cases/bar_test.rb": `
        def test_pg_not_mysql; end if current_adapter?(:PostgreSQLAdapter) && !current_adapter?(:Mysql2Adapter)
        def test_pos_neg_or; end if current_adapter?(:PostgreSQLAdapter) || !current_adapter?(:Mysql2Adapter)
      `,
    });
    // `&&` → PG minus MySQL = PG (sound intersection of the include and exclusion).
    expect(g["pg not mysql"]).toEqual({ adapters: ["postgresql"], source: ["class"] });
    // `||` mixing a positive and a negated adapter is unsound → no adapter set.
    expect(g["pos neg or"] ?? null).toBeNull();
  });

  it("intersects a dir adapter with an in-body feature skip", () => {
    const g = rubyGates({
      "cases/adapters/postgresql/combo_test.rb": `test "pg json" do; skip "x" unless supports_json?; end`,
    });
    expect(g["pg json"]).toEqual({
      adapters: ["postgresql"],
      features: ["json"],
      source: ["body-skip", "dir"],
    });
  });

  it("gates block-form / elsif conditional skips (not always_skip)", () => {
    const g = rubyGates({
      "cases/block_test.rb": `
        test "needs concurrent" do
          unless supports_concurrent_connections?; skip "no async"; end
        end
        test "json on mariadb" do
          if current_adapter?(:Mysql2Adapter, :TrilogyAdapter) && @c.mariadb?; skip "x"; end
        end
        if current_adapter?(:PostgreSQLAdapter)
          test "pg branch" do; end
        elsif current_adapter?(:Mysql2Adapter, :TrilogyAdapter)
          test "mysql branch" do; end
        end
      `,
    });
    expect(g["needs concurrent"]).toEqual({
      features: ["concurrent_connections"],
      source: ["body-skip"],
    });
    // compound `&&` → unsound adapter set dropped, mariadb guard kept
    expect(g["json on mariadb"]).toEqual({ guards: ["mariadb"], source: ["body-skip"] });
    expect(g["pg branch"]).toEqual({ adapters: ["postgresql"], source: ["class"] });
    expect(g["mysql branch"]).toEqual({ adapters: ["mysql"], source: ["class"] });
  });

  it("does not treat a receiver `.skip` (e.g. Arel OFFSET) as a test skip", () => {
    const g = rubyGates({
      "cases/offset_test.rb": `
        test "uses offset" do; manager.skip(10); relation.skip 5; end
        test "bare skip is a guard" do; skip "always"; end
      `,
    });
    expect(g["uses offset"] ?? null).toBeNull();
    expect(g["bare skip is a guard"]).toEqual({ guards: ["always_skip"], source: ["body-skip"] });
  });
});
