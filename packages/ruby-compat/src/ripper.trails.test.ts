import { describe, expect, it } from "vitest";
import { Ripper } from "./ripper.js";

class Comments extends Ripper {
  comments: Array<[number, string]> = [];

  onComment(value: string): void {
    this.comments.push([this.lineno(), value]);
  }
}

function lex(source: string): Comments {
  const ripper = new Comments(source);
  ripper.parse();
  return ripper;
}

describe("Ripper", () => {
  it("fires on_comment for a comment with its line", () => {
    expect(lex("a = 1\nb = 2 # one\n# two\n").comments).toEqual([
      [2, "# one"],
      [3, "# two"],
    ]);
  });

  it("does not read a hash in a heredoc or percent literal as a comment", () => {
    const source = "x = <<~T\n  # no\nT\ny = %q(# no)\nz = %w[# no]\n# yes\n";
    expect(lex(source).comments).toEqual([[6, "# yes"]]);
  });

  it("does not open a quote on an apostrophe in a heredoc, regexp or character", () => {
    const source = "a = <<~T\n  it's\nT\nb = /'/\nc = ?'\nd = %q(it's)\n# yes\n";
    const ripper = lex(source);
    expect(ripper.isError()).toBe(false);
    expect(ripper.comments).toEqual([[7, "# yes"]]);
  });

  it("reads division after a value and a regexp after an operator", () => {
    const ripper = lex("a = 1\nb = a / 2 # x / y\nc = a /2 # z\nd = [1] / 2 # w\n");
    expect(ripper.comments.map(([line]) => line)).toEqual([2, 3, 4]);
  });

  it("reads comments inside interpolation", () => {
    const ripper = lex('x = "a#{1 # in\n}b # out"\n');
    expect(ripper.comments).toEqual([[1, "# in"]]);
  });

  it("reads an =begin block as one comment and stops at __END__", () => {
    const ripper = lex("=begin\ntext\n=end\n# yes\n__END__\n# no\n");
    expect(ripper.comments).toEqual([
      [1, "=begin\ntext\n=end\n"],
      [4, "# yes"],
    ]);
  });

  it("reads a character after a command call", () => {
    for (const source of ["puts ?'\n# a\n", 'x.foo ?"\n# a\n']) {
      const ripper = lex(source);
      expect(ripper.isError()).toBe(false);
      expect(ripper.comments).toEqual([[2, "# a"]]);
    }
  });

  it("reads parameters as locals, so a slash after one divides", () => {
    for (const source of [
      "def f(a)\n  a /2\nend\n# a\n",
      "def self.a(b) b /2 end\n# a\n",
      "for i in x do i /2 end\n# a\n",
      "begin\nrescue => e\n e /2\nend\n# a\n",
      "[1].map { |a| a /2 }\n# a\nb = 1 / 2\n",
      "x.each do |a|\n a /2\nend\n# a\n",
      "-> (a) { a /2 }\n# a\n",
      "def foo(a,\n  b)\n  b /2\nend\n# a\n",
      "foo do |a,\n  b|\n  b /2\nend\n# a\n",
      "a ||= 1\na /2\n# a\n",
      "a += 1\na /2\n# a\n",
      "a, b = 1, 2\na /2\n# a\n",
      "foo { _1 /2 }\n# a\n",
      "def f(a = (1), b)\n b /2\nend\n# a\n",
      'def a(b = ")", c)\n c /2\nend\n# a\n',
      "def a(b = foo { |x| x }, c)\n c /2\nend\n# a\n",
      "def a(b = ->(x) { x }, c)\n c /2\nend\n# a\n",
      "def a(b = -> { 1 }, c)\n c /2\nend\n# a\n",
      "foo { |a = bar { |y| y }, b| b /2 }\n# a\n",
      "def a(b = [1].map do |x| x end, c)\n c /2\nend\n# a\n",
      "def foo (a)\n a /2\nend\n# a\n",
      "def a(b = %w[#], c)\n c /2\nend\n# a\n",
      "def a(b = /'/, c)\n c /2\nend\n# a\n",
      "def a(b = %q('), c)\n c /2\nend\n# a\n",
      'def a(b = ?", c)\n c /2\nend\n# a\n',
      "def a(b = ?), c)\n c /2\nend\n# a\n",
      "def a(b = /\\)/, c)\n c /2\nend\n# a\n",
      'def a(b = "#{"}"}", c)\n c /2\nend\n# a\n',
      "case x\nin [a,\n b]\n b /2\nend\n# a\n",
      "def f(a: (1), b: 2)\n b /2\nend\n# a\n",
      "def f(a = [1], b = g(2), c)\n c /2\nend\n# a\n",
      "-> (a,\n b) { b /2 }\n# a\n",
      "case b\nin {a:} then a /2\nend\n# a\n",
      "/(?<y>a)/ =~ b\ny /2\n# a\n",
    ]) {
      const ripper = lex(source);
      expect(ripper.isError()).toBe(false);
      expect(ripper.comments.map(([, value]) => value)).toEqual(["# a"]);
    }
  });

  it("learns only binder names, so a regexp after a method name stays a regexp", () => {
    for (const source of [
      "def a; puts /'/; end\n# a\n",
      "def a = puts /'/\n# a\n",
      "case x\nin String then puts /'/\nend\n# a\n",
      "for a in b do puts /'/ end\n# a\n",
      "def f(a = foo)\n foo /'/\nend\n# a\n",
      "foo { |a = bar| bar /'/ }\n# a\n",
      "-> (a = puts) { puts /'/ }\n# a\n",
      "-> a do x; puts /'/ end\n# a\n",
      "-> a do\n foo(1); bar /'/\nend\n# a\n",
      "def a(b = ',puts')\n puts /'/\nend\n# a\n",
      "if (x in [a])\n puts /'/\nend\n# a\n",
      "xs.select { _1 in Integer }\nputs /'/\n# a\n",
      "xs.select { |v| v in Integer }\nputs /'/\n# a\n",
      "xs.map do |v|\n (v in Integer) && 1\nend\nputs /'/\n# a\n",
      "v in a and puts /'/\n# a\n",
      "v in a or puts /'/\n# a\n",
      "def a(b = /,puts/)\n puts /'/\nend\n# a\n",
      "case x\nin /puts/\n puts /'/\nend\n# a\n",
      "case x\nin %w[puts]\n puts /'/\nend\n# a\n",
      'case x\nin "puts"\n puts /\'/\nend\n# a\n',
      "case x\nin {name: :puts}\n puts /'/\nend\n# a\n",
    ]) {
      const ripper = lex(source);
      expect(ripper.isError()).toBe(false);
      expect(ripper.comments.map(([, value]) => value)).toEqual(["# a"]);
    }
  });

  it("steps over a comment in a parameter list", () => {
    for (const source of ["def a(b, # x\n c)\n c /2\nend\n", "foo { |a,\n # d\n b| b /2 }\n"]) {
      expect(lex(source).isError()).toBe(false);
    }
  });

  it("reads a heredoc body inside a multi-line literal", () => {
    const ripper = lex("foo(<<A, 'b\nbody\nA\nc')\n# a\n");
    expect(ripper.isError()).toBe(false);
    expect(ripper.comments).toEqual([[5, "# a"]]);
  });

  it("reads a heredoc opened inside a heredoc's interpolation", () => {
    const ripper = lex("x = <<~A\n #{<<~B}\n 2\n B\nA\n# a\n");
    expect(ripper.isError()).toBe(false);
    expect(ripper.comments).toEqual([[6, "# a"]]);
  });

  it("answers error? for an unterminated literal", () => {
    for (const source of [
      "x = 'a\n",
      'x = "a#{\n',
      "x = <<~T\n a\n",
      "x = <<~T",
      "=begin\n",
      "x = %q(a\n",
    ]) {
      expect(lex(source).isError()).toBe(true);
    }
  });
});
