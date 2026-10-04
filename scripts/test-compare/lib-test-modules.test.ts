import { execFile } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";
import { describe, expect, it } from "vitest";
import { collectLibTests, extractTestsFromSource } from "./extract-ts-core.js";

const RUBY_SCRIPT = path.join(__dirname, "extract-ruby-tests.rb");

const LINT_RB = `
module ActiveModel
  module Lint
    module Tests
      def test_to_key
        assert_respond_to model, :to_key
        assert model.to_key.nil?, "to_key should return nil"
      end
    end
  end
end
`;

async function extractRuby(include: string): Promise<{ description: string; kinds: string[] }[]> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lib-test-modules-"));
  try {
    const lib = path.join(dir, "activemodel", "lib", "active_model");
    const cases = path.join(dir, "activemodel", "test", "cases");
    await fs.mkdir(lib, { recursive: true });
    await fs.mkdir(cases, { recursive: true });
    await fs.writeFile(path.join(lib, "lint.rb"), LINT_RB);
    const testFile = path.join(cases, "lint_test.rb");
    await fs.writeFile(testFile, `class LintTest < ActiveModel::TestCase\n  ${include}\nend\n`);
    const driver = `
      require_relative ${JSON.stringify(RUBY_SCRIPT)}
      require "json"
      ex = TestExtractor.new
      ex.process_file(${JSON.stringify(testFile)}, ${JSON.stringify(cases)})
      cases = ex.test_files.flat_map { |f| f[:testCases] }
        .map { |tc| { description: tc[:description], kinds: tc[:assertionKinds] } }
      puts JSON.generate(cases)
    `;
    const { stdout } = await promisify(execFile)("ruby", ["-e", driver], { encoding: "utf-8" });
    return JSON.parse(stdout);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("a test case that includes a lib module of tests", () => {
  it("emits the lib module's tests for the including Ruby file", async () => {
    expect(await extractRuby("include ActiveModel::Lint::Tests")).toEqual([
      { description: "to key", kinds: ["assert_respond_to", "assert"] },
    ]);
  });

  it("leaves a module outside the enrollment set alone", async () => {
    expect(await extractRuby("include ActiveModel::Lint")).toEqual([]);
  });

  const LINT_TS = `
    export function model(input) { assertRespondTo(input, "toModel"); return input.toModel(); }
    export namespace Tests {
      export function testToKey(input) {
        assertRespondTo(model(input), "toKey");
        assert(model(input).toKey() == null, "to_key should return nil");
      }
    }
  `;
  const libTests = collectLibTests(LINT_TS, "lint.ts", "Tests");

  it("folds a namespaced lib test call into the TS test's assertions", () => {
    const source = `describe("LintTest", () => {
      it("to key", () => { Tests.testToKey(model); });
      it("to key through the package", () => { Lint.Tests.testToKey(model); });
    });`;
    const { testCases } = extractTestsFromSource(source, "lint.test.ts", libTests);
    for (const testCase of testCases) {
      expect(testCase.assertionKinds).toEqual(["assertRespondTo", "assert"]);
      expect(testCase.assertionCount).toBe(2);
    }
  });

  it("does not fold a same-named method on another receiver", () => {
    const source = `it("to key", () => { other.testToKey(model); });`;
    const { testCases } = extractTestsFromSource(source, "lint.test.ts", libTests);
    expect(testCases[0].assertionCount).toBe(0);
  });
});
