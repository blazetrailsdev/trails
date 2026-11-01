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
      [1, "=begin\ntext\n=end"],
      [4, "# yes"],
    ]);
  });

  it("answers error? for an unterminated literal", () => {
    for (const source of ["x = 'a\n", 'x = "a#{\n', "x = <<~T\n a\n", "=begin\n", "x = %q(a\n"]) {
      expect(lex(source).isError()).toBe(true);
    }
  });
});
