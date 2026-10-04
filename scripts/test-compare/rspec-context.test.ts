import { execFile } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";
import { describe, expect, it } from "vitest";

const RUBY_SCRIPT = path.join(__dirname, "extract-ruby-tests.rb");

async function extractPaths(src: string): Promise<string[]> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rspec-context-"));
  try {
    const specFile = path.join(dir, "options_spec.rb");
    await fs.writeFile(specFile, src);
    const driver = `
      require_relative ${JSON.stringify(RUBY_SCRIPT)}
      require "json"
      ex = TestExtractor.new
      ex.process_file(${JSON.stringify(specFile)}, ${JSON.stringify(dir)})
      puts JSON.generate(ex.test_files.flat_map { |f| f[:testCases] }.map { |tc| tc[:path] })
    `;
    const { stdout } = await promisify(execFile)("ruby", ["-e", driver], { encoding: "utf-8" });
    return JSON.parse(stdout);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("an RSpec context block", () => {
  it("is a path segment, as describe is", async () => {
    expect(
      await extractPaths(`
        describe Thor::Options do
          describe "#parse" do
            context "when stop_on_unknown is true" do
              it "stops parsing on first non-option" do
              end
            end
            context("when exclusives is given") do
              it "raises an error" do
              end
            end
          end
        end
      `),
    ).toEqual([
      "#parse > when stop_on_unknown is true > stops parsing on first non-option",
      "#parse > when exclusives is given > raises an error",
    ]);
  });
});
