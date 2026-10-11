import { execFile } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";
import { describe, expect, it } from "vitest";

const RUBY_SCRIPT = path.join(__dirname, "extract-ruby-tests.rb");

async function extractPaths(src: string, key = "path"): Promise<unknown[]> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rspec-context-"));
  try {
    const specFile = path.join(dir, "options_spec.rb");
    await fs.writeFile(specFile, src);
    const driver = `
      require_relative ${JSON.stringify(RUBY_SCRIPT)}
      require "json"
      ex = TestExtractor.new
      ex.process_file(${JSON.stringify(specFile)}, ${JSON.stringify(dir)})
      puts JSON.generate(ex.test_files.flat_map { |f| f[:testCases] }.map { |tc| tc[${JSON.stringify(key)}.to_sym] })
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

describe("an RSpec context name with an interpolation the loop does not expand", () => {
  const src = `
    describe '#write_float32' do
      tests = [['small floats', 3.14], ['big floats', Math::PI]]
      tests.each do |ctx, numeric|
        context("with #{ctx}") do
          it("encodes #{numeric} as float32") do
          end
        end
      end
      context 'with non numeric' do
        it 'raises argument error' do
        end
      end
    end
  `;

  it("keeps the blanked path", async () => {
    expect(await extractPaths(src)).toEqual([
      "#write_float32 > with  > encodes  as float32",
      "#write_float32 > with non numeric > raises argument error",
    ]);
  });

  it("records each dropped interpolation in the case's pattern", async () => {
    expect(await extractPaths(src, "pattern")).toEqual([
      ["#write_float32", "with <expr>", "encodes <expr> as float32"],
      null,
    ]);
  });
});
