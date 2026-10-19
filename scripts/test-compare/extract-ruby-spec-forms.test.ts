import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const RUBY_SCRIPT = path.join(__dirname, "extract-ruby-tests.rb");

function rubyTestCases(src: string): Record<string, { count: number; kinds: string[] }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spec-forms-rb-"));
  try {
    fs.writeFileSync(path.join(dir, "spec_foo.rb"), src);
    const driver = `
      require_relative ${JSON.stringify(RUBY_SCRIPT)}
      require "json"
      ex = TestExtractor.new
      ex.process_file(File.join(${JSON.stringify(dir)}, "spec_foo.rb"), ${JSON.stringify(dir)})
      out = {}
      ex.test_files.each { |f| f[:testCases].each { |tc| out[tc[:description]] = { count: tc[:assertionCount], kinds: tc[:assertionKinds] } } }
      puts JSON.generate(out)
    `;
    return JSON.parse(execFileSync("ruby", ["-e", driver], { encoding: "utf-8" }));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("Ruby extractor minitest spec forms", () => {
  const cases = rubyTestCases(`
    describe Foo do
      it "predicates" do
        r.must_be :empty?
        r.wont_be :empty?
        r.wont_be :nil?
      end

      it "operators" do
        r.must_be :<, 3
      end

      it "expect receivers" do
        expect(r).must_equal 1
        expect(r).must_be :<=, 2
      end
    end
  `);

  it("reads a one-operand must_be / wont_be as assert_predicate / refute_predicate", () => {
    expect(cases["predicates"]).toEqual({
      count: 3,
      kinds: ["assert_predicate", "refute_predicate", "refute_nil"],
    });
  });

  it("keeps must_be with an operand as an operator", () => {
    expect(cases["operators"]).toEqual({ count: 1, kinds: ["must_be"] });
  });

  it("does not count the expect receiver of a must_* call", () => {
    expect(cases["expect receivers"]).toEqual({ count: 2, kinds: ["must_equal", "must_be"] });
  });
});
