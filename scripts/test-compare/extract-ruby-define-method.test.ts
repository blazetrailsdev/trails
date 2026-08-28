import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const HERE = __dirname;
const RUBY_SCRIPT = path.join(HERE, "extract-ruby-tests.rb");

interface Extracted {
  cases: Array<{ description: string; style: string; line: number }>;
  unexpandedLoops: string[];
}

function extract(body: string): Extracted {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "define-method-rb-"));
  try {
    const rel = "cases/foo_test.rb";
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, `class FooTest < ActiveSupport::TestCase\n${body}\nend\n`);
    const driver = `
      require_relative ${JSON.stringify(RUBY_SCRIPT)}
      require "json"
      ex = TestExtractor.new
      ex.process_file(File.join(${JSON.stringify(dir)}, ${JSON.stringify(rel)}), ${JSON.stringify(dir)})
      cases = ex.test_files.flat_map { |f| f[:testCases] }
        .map { |tc| { description: tc[:description], style: tc[:style], line: tc[:line] } }
      puts JSON.generate({ cases: cases, unexpandedLoops: ex.unexpanded_loops })
    `;
    return JSON.parse(execFileSync("ruby", ["-e", driver], { encoding: "utf-8" }));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("Ruby extractor define_method loop expansion", () => {
  it("expands a constant array whose name interpolates klass.name.gsub", () => {
    const { cases, unexpandedLoops } = extract(`
  [
    Nodes::Sum,
    Arel::Nodes::Exists,
  ].each do |klass|
    define_method("test_#{klass.name.gsub('::', '_')}") do
      assert_equal 1, 1
    end
  end
`);
    expect(cases.map((c) => c.description)).toEqual(["Nodes Sum", "Arel Nodes Exists"]);
    expect(cases.every((c) => c.style === "define_method")).toBe(true);
    expect(unexpandedLoops).toEqual([]);
  });

  it("expands %w and %i word arrays, including the paren-less define_method form", () => {
    const { cases } = extract(`
  %w(file data).each do |method|
    define_method "test_send_#{method}_status" do
      assert_not_nil process(method)
    end
  end
  %i(plurals singulars).each do |scope|
    define_method("test_clear_inflections_with_#{scope}") do
      assert_equal 1, 1
    end
  end
`);
    expect(cases.map((c) => c.description)).toEqual([
      "send file status",
      "send data status",
      "clear inflections with plurals",
      "clear inflections with singulars",
    ]);
  });

  it("expands a dynamic-symbol name and skips a generated non-test method", () => {
    const { cases } = extract(`
  [:a, :b].each do |name|
    define_method(:"test_to_regexp_#{name}") do
      assert_equal 1, 1
    end
    define_method("helper_#{name}") { 1 }
  end
`);
    expect(cases.map((c) => c.description)).toEqual(["to regexp a", "to regexp b"]);
  });

  it("reports a loop whose element values are not static literals", () => {
    const { cases, unexpandedLoops } = extract(`
  [ :all, [] ].each do |scope|
    define_method("test_clear_inflections_with_#{scope}") do
      assert_equal 1, 1
    end
  end
`);
    expect(cases).toEqual([]);
    expect(unexpandedLoops).toEqual(["cases/foo_test.rb:3"]);
  });

  it("reports a loop whose name interpolation is not statically evaluable", () => {
    const { cases, unexpandedLoops } = extract(`
  [:a, :b].each do |path|
    define_method(:"test_names_#{Regexp.escape(path)}") do
      assert_equal 1, 1
    end
  end
`);
    expect(cases).toEqual([]);
    expect(unexpandedLoops).toEqual(["cases/foo_test.rb:3"]);
  });

  it("leaves a non-define_method each block to the ordinary walk", () => {
    const { cases, unexpandedLoops } = extract(`
  [:a, :b].each do |name|
    puts name
  end

  def test_ordinary
    assert_equal 1, 1
  end
`);
    expect(cases.map((c) => [c.description, c.style])).toEqual([["ordinary", "def_test"]]);
    expect(unexpandedLoops).toEqual([]);
  });
});
