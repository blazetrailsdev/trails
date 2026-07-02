import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const HERE = __dirname;

// Exercises the Ruby extractor's raw (non-deduped) assertionCount through its
// real Ripper parser (shelled out), pinning production behavior.
describe("Ruby extractor assertion-count collection", () => {
  const RUBY_SCRIPT = path.join(HERE, "extract-ruby-tests.rb");

  function rubyAssertionCounts(
    fixtures: Record<string, string>,
  ): Record<string, number | undefined> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "assert-rb-"));
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
        ex.test_files.each { |f| f[:testCases].each { |tc| out[tc[:description]] = tc[:assertionCount] } }
        puts JSON.generate(out)
      `;
      const stdout = execFileSync("ruby", ["-e", driver], { encoding: "utf-8" });
      return JSON.parse(stdout);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  it("counts every assertion call without deduping kinds", () => {
    const c = rubyAssertionCounts({
      "cases/foo_test.rb": `
        class FooTest < ActiveSupport::TestCase
          def test_repeated_kinds
            assert_equal 1, a
            assert_equal 2, b
            assert_nil c
          end

          def test_none
            x = compute
          end

          def test_nested_block
            assert_difference "Post.count" do
              assert_equal 1, x
            end
          end

          # Ripper wraps a parenthesized call as [:method_add_arg, [:fcall,...]];
          # the raw count must not double-count the wrapper + its fcall child.
          def test_parenthesized
            assert_equal(1, a)
            assert_nil b
            assert(c)
          end
        end
      `,
    });
    expect(c["repeated kinds"]).toBe(3);
    expect(c["none"]).toBe(0);
    // assert_difference itself + the nested assert_equal = 2
    expect(c["nested block"]).toBe(2);
    // parenthesized calls count once each, not twice
    expect(c["parenthesized"]).toBe(3);
  });

  it("counts custom helpers by prefix and every Ripper call shape (vcall/command_call)", () => {
    const c = rubyAssertionCounts({
      "cases/custom_test.rb": `
        class CustomTest < ActiveSupport::TestCase
          def test_custom_helpers
            assert_queries_count(2) { Post.all.to_a }   # command w/ block
            assert_no_queries { cached.first }
            assert_not_predicate post, :valid?
            assert_not user.admin?
          end

          def test_call_shapes
            assert_auto_incremented                      # :vcall (bare)
            assert_transaction_is_not_broken             # :vcall (bare)
            sql.must_be_like %{SELECT 1}                 # :command_call
          end

          def test_lookalikes_not_counted
            assertion = build_assertion
            asserted = true
          end
        end
      `,
    });
    // assert_queries_count + assert_no_queries + assert_not_predicate + assert_not = 4
    expect(c["custom helpers"]).toBe(4);
    // 2 bare :vcall + 1 :command_call = 3
    expect(c["call shapes"]).toBe(3);
    // `assertion` / `asserted` are not assertion calls
    expect(c["lookalikes not counted"]).toBe(0);
  });

  it("expands same-file helper methods (incl. test_* used as helpers)", () => {
    const c = rubyAssertionCounts({
      "cases/copy_test.rb": `
        class CopyTest < ActiveSupport::TestCase
          def test_copy_table(from = "customers", to = "customers2")
            assert_equal row_count(to), row_count(from)
            assert_equal column_names(to), column_names(from)
          end

          def test_copy_table_with_binary_column
            test_copy_table "binaries", "binaries2"
          end
        end
      `,
    });
    // Delegating test folds in the helper's 2 asserts (copy_table symmetry trap).
    expect(c["copy table with binary column"]).toBe(2);
    // The helper-as-test still counts its own 2 directly.
    expect(c["copy table"]).toBe(2);
  });

  it("expands helpers recursively through sub-helpers (depth-capped)", () => {
    const c = rubyAssertionCounts({
      "cases/dump_test.rb": `
        class DumpTest < ActiveSupport::TestCase
          def do_dump_index_assertions_for_one_index
            assert_equal 1, a
            assert_equal 2, b
          end

          def do_dump_index_tests_for_schema
            assert_predicate top, :present?
            do_dump_index_assertions_for_one_index
            do_dump_index_assertions_for_one_index
          end

          def test_dump_indexes_for_schema_one
            do_dump_index_tests_for_schema
          end
        end
      `,
    });
    // top assert (1) + 2 sub-helper calls × 2 = 5
    expect(c["dump indexes for schema one"]).toBe(5);
  });

  it("guards against helper recursion cycles", () => {
    const c = rubyAssertionCounts({
      "cases/cycle_test.rb": `
        class CycleTest < ActiveSupport::TestCase
          def ping
            assert_equal 1, a
            pong
          end

          def pong
            assert_equal 2, b
            ping
          end

          def test_cyclic
            ping
          end
        end
      `,
    });
    // ping(1) → pong(1) → ping on path (skipped) = 2, no infinite loop
    expect(c["cyclic"]).toBe(2);
  });

  it("counts assertions in it/test-macro bodies", () => {
    const c = rubyAssertionCounts({
      "cases/bar_test.rb": `
        test "macro body" do
          assert_equal 1, a
          assert_not_nil b
        end
      `,
    });
    expect(c["macro body"]).toBe(2);
  });
});

// Exercises the Ruby extractor's literal expected-VALUE capture (assertionValues)
// through the real Ripper parser, pinning the tagged-token encoding and the
// per-assertion expected-argument selection (arg 0, or arg 1 for *_includes).
describe("Ruby extractor assertion-value collection", () => {
  const RUBY_SCRIPT = path.join(HERE, "extract-ruby-tests.rb");

  function rubyAssertionValues(
    fixtures: Record<string, string>,
  ): Record<string, (string | null)[] | undefined> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "assert-rb-val-"));
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
        ex.test_files.each { |f| f[:testCases].each { |tc| out[tc[:description]] = tc[:assertionValues] } }
        puts JSON.generate(out)
      `;
      const stdout = execFileSync("ruby", ["-e", driver], { encoding: "utf-8" });
      return JSON.parse(stdout);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  it("captures the first positional literal as a tagged token, lockstep with kinds", () => {
    const v = rubyAssertionValues({
      "cases/vals_test.rb": `
        class ValsTest < ActiveSupport::TestCase
          def test_literals
            assert_equal 5, a
            assert_equal "hi", b
            assert_equal true, c
            assert_equal :sym, d
            assert_nil e
          end
        end
      `,
    });
    // A symbol folds to the same s: token as a string; assert_nil's arg is a
    // variable (non-literal) → null. Length matches the 5 assertionKinds.
    expect(v["literals"]).toEqual(["n:5", "s:hi", "b:true", "s:sym", null]);
  });

  it("captures negative numeric literals and the parenthesized form", () => {
    const v = rubyAssertionValues({
      "cases/paren_test.rb": `
        class ParenTest < ActiveSupport::TestCase
          def test_paren
            assert_equal(-3, a)
            assert_equal(1.5, b)
          end
        end
      `,
    });
    expect(v["paren"]).toEqual(["n:-3", "n:1.5"]);
  });

  it("captures the membership arg (index 1) for the *_includes family", () => {
    const v = rubyAssertionValues({
      "cases/incl_test.rb": `
        class InclTest < ActiveSupport::TestCase
          def test_incl
            assert_includes coll, "member"
            assert_not_includes other, :sym
          end
        end
      `,
    });
    expect(v["incl"]).toEqual(["s:member", "s:sym"]);
  });

  it("emits null for a non-literal expected argument", () => {
    const v = rubyAssertionValues({
      "cases/computed_test.rb": `
        class ComputedTest < ActiveSupport::TestCase
          def test_computed
            assert_equal compute(x), y
            assert_equal 7, z
          end
        end
      `,
    });
    expect(v["computed"]).toEqual([null, "n:7"]);
  });

  it("captures values through helper expansion in lockstep with kinds", () => {
    const v = rubyAssertionValues({
      "cases/helper_test.rb": `
        class HelperTest < ActiveSupport::TestCase
          def check_row
            assert_equal 1, a
            assert_equal 2, b
          end

          def test_delegates
            check_row
          end
        end
      `,
    });
    expect(v["delegates"]).toEqual(["n:1", "n:2"]);
  });
});
