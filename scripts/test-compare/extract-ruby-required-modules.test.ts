import { execFile } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";
import { describe, expect, it } from "vitest";

const RUBY_SCRIPT = path.join(__dirname, "extract-ruby-tests.rb");

async function extractRuby(moduleName: string): Promise<string[]> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "required-modules-"));
  try {
    await fs.writeFile(
      path.join(dir, "common.rb"),
      `module ${moduleName}\n  def test_basic_broadcast\n    assert true\n  end\nend\n`,
    );
    const testFile = path.join(dir, "async_test.rb");
    await fs.writeFile(
      testFile,
      `require_relative "common"\nclass AsyncAdapterTest < ActionCable::TestCase\n  include ${moduleName}\nend\n`,
    );
    const driver = `
      require_relative ${JSON.stringify(RUBY_SCRIPT)}
      require "json"
      ex = TestExtractor.new
      ex.process_file(${JSON.stringify(testFile)}, ${JSON.stringify(dir)})
      puts JSON.generate(ex.test_files.flat_map { |f| f[:testCases] }.map { |tc| tc[:description] })
    `;
    const { stdout } = await promisify(execFile)("ruby", ["-e", driver], { encoding: "utf-8" });
    return JSON.parse(stdout);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("a test case that includes a module from a require_relative sibling", () => {
  it("emits the enrolled module's tests for the including file", async () => {
    expect(await extractRuby("CommonSubscriptionAdapterTest")).toEqual(["basic broadcast"]);
  });

  it("leaves a module outside the enrollment set alone", async () => {
    expect(await extractRuby("BehaviorsTest")).toEqual([]);
  });
});
