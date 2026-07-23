import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const HERE = __dirname;

describe("Ruby extractor literal quote style", () => {
  const RUBY_SCRIPT = path.join(HERE, "extract-ruby-tests.rb");

  function rubyAssertionValues(source: string): Record<string, string[]> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quote-rb-"));
    try {
      const rel = "cases/foo_test.rb";
      const p = path.join(dir, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, source);
      const driver = `
        require_relative ${JSON.stringify(RUBY_SCRIPT)}
        require "json"
        ex = TestExtractor.new
        ex.process_file(File.join(${JSON.stringify(dir)}, ${JSON.stringify(rel)}), ${JSON.stringify(dir)})
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

  function rubyQuoteStyles(source: string): Array<[number[], string]> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quote-rb-"));
    try {
      const p = path.join(dir, "source.rb");
      fs.writeFileSync(p, source);
      const driver = `
        require_relative ${JSON.stringify(RUBY_SCRIPT)}
        require "json"
        styles = TestExtractor.new.send(:build_quote_styles, File.read(${JSON.stringify(p)}))
        puts JSON.generate(styles.map { |pos, style| [pos, style.to_s] })
      `;
      return JSON.parse(execFileSync("ruby", ["-e", driver], { encoding: "utf-8" }));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  it("keeps a dynamic symbol from unbalancing the enclosing literal's stack", () => {
    // `:"x"` / `%s(y)` close with tstring_end, so they must also open the stack
    // — otherwise they pop an entry belonging to a still-open outer literal.
    const styles = rubyQuoteStyles(`x = "a#{:"b"}c"\ny = %s(d)\nz = :e\n`);
    expect(styles.map(([, style]) => style)).toEqual(["double", "double", "double", "single"]);
  });

  it("keeps escape sequences raw in single-quoted heredocs", () => {
    const v = rubyAssertionValues(
      [
        "class FooTest < ActiveSupport::TestCase",
        "  def test_single_heredoc",
        "    assert_equal(<<~'EOS', x)",
        "      a\\nb",
        "    EOS",
        "  end",
        "",
        "  def test_double_heredoc",
        "    assert_equal(<<~EOS, x)",
        "      a\\nb",
        "    EOS",
        "  end",
        "end",
      ].join("\n"),
    );
    expect(v["single heredoc"]).toEqual(["s:a\\nb\n"]);
    expect(v["double heredoc"]).toEqual(["s:a\nb\n"]);
  });

  it("keeps escape sequences raw in a %q literal whose content starts on a later line", () => {
    const v = rubyAssertionValues(
      [
        "class FooTest < ActiveSupport::TestCase",
        "  def test_multiline_q",
        "    assert_equal %q{",
        "a\\nb",
        "}, x",
        "  end",
        "",
        "  def test_multiline_bigq",
        "    assert_equal %Q{",
        "a\\nb",
        "}, x",
        "  end",
        "end",
      ].join("\n"),
    );
    expect(v["multiline q"]).toEqual(["s:\na\\nb\n"]);
    expect(v["multiline bigq"]).toEqual(["s:\na\nb\n"]);
  });

  it("still distinguishes inline single- and double-quoted literals", () => {
    const v = rubyAssertionValues(
      [
        "class FooTest < ActiveSupport::TestCase",
        "  def test_inline",
        "    assert_equal 'a\\nb', x",
        '    assert_equal "a\\nb", y',
        "  end",
        "end",
      ].join("\n"),
    );
    expect(v["inline"]).toEqual(["s:a\\nb", "s:a\nb"]);
  });

  it("attributes the heredoc body past interleaved same-line literals", () => {
    const v = rubyAssertionValues(
      [
        "class FooTest < ActiveSupport::TestCase",
        "  def test_interleaved",
        "    assert_equal(<<~'EOS', \"c\\nd\")",
        "      a\\nb",
        "    EOS",
        "  end",
        "end",
      ].join("\n"),
    );
    expect(v["interleaved"]).toEqual(["s:a\\nb\n"]);
  });
});
