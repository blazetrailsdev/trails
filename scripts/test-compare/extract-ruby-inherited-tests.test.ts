import { execFile } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";
import { describe, expect, it } from "vitest";

const RUBY_SCRIPT = path.join(__dirname, "extract-ruby-tests.rb");

async function extractRuby(source: string): Promise<string[]> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "inherited-tests-"));
  try {
    const testFile = path.join(dir, "foreign_key_test.rb");
    await fs.writeFile(testFile, source);
    const driver = `
      require_relative ${JSON.stringify(RUBY_SCRIPT)}
      require "json"
      ex = TestExtractor.new
      ex.process_file(${JSON.stringify(testFile)}, ${JSON.stringify(dir)})
      puts JSON.generate(ex.test_files.flat_map { |f| f[:testCases] }.map { |tc| tc[:path] })
    `;
    const { stdout } = await promisify(execFile)("ruby", ["-e", driver], { encoding: "utf-8" });
    return JSON.parse(stdout);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("a test class that subclasses a same-file test class", () => {
  it("emits the superclass's tests under the subclass", async () => {
    const paths = await extractRuby(`
      class ChangeColumnTest < ActiveRecord::TestCase
        def test_one; assert true; end
        test "two" do assert true end
      end
      class ChangeColumnWithPrefixTest < ChangeColumnTest
        setup { }
      end
    `);
    expect(paths).toEqual([
      "ChangeColumnTest > one",
      "ChangeColumnTest > two",
      "ChangeColumnWithPrefixTest > one",
      "ChangeColumnWithPrefixTest > two",
    ]);
  });

  it("does not copy a test the subclass redefines, and inherits transitively, but not from a reopened class", async () => {
    const paths = await extractRuby(`
      class ATest < ActiveRecord::TestCase
        def test_one; assert true; end
        def test_two; assert true; end
      end
      class BTest < ATest
        def test_two; assert false; end
        class CTest < BTest; end
      end
      class TestCase; def test_reopened; assert true; end; end
      class DTest < TestCase; end
    `);
    expect(paths).toEqual([
      "ATest > one",
      "ATest > two",
      "BTest > two",
      "TestCase > reopened",
      "BTest > one",
      "BTest > CTest > two",
      "BTest > CTest > one",
    ]);
  });
});
