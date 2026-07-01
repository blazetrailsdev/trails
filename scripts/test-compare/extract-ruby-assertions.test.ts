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
