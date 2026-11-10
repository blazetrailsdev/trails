import { describe, expect, it } from "vitest";
import { ArgumentError, File, capitalize } from "@blazetrails/ruby-compat";
import { pathmap } from "../lib/ext/string.js";

describe("TestRakePathMap", () => {
  it("returns self with no args", () => {
    expect(pathmap("abc.rb")).toBe("abc.rb");
  });

  it("s returns file separator", () => {
    const sep = File.ALT_SEPARATOR || File.SEPARATOR;
    expect(pathmap("abc.rb", "%s")).toBe(sep);
    expect(pathmap("", "%s")).toBe(sep);
    expect(pathmap("a/b", "%d%s%f")).toBe(`a${sep}b`);
  });

  it("f returns basename", () => {
    expect(pathmap("abc.rb", "%f")).toBe("abc.rb");
    expect(pathmap("this/is/a/dir/abc.rb", "%f")).toBe("abc.rb");
    expect(pathmap("/this/is/a/dir/abc.rb", "%f")).toBe("abc.rb");
  });

  it("n returns basename without extension", () => {
    expect(pathmap("abc.rb", "%n")).toBe("abc");
    expect(pathmap("abc", "%n")).toBe("abc");
    expect(pathmap("this/is/a/dir/abc.rb", "%n")).toBe("abc");
    expect(pathmap("/this/is/a/dir/abc.rb", "%n")).toBe("abc");
    expect(pathmap("/this/is/a/dir/abc", "%n")).toBe("abc");
  });

  it("d returns dirname", () => {
    expect(pathmap("abc.rb", "%d")).toBe(".");
    expect(pathmap("/abc", "%d")).toBe("/");
    expect(pathmap("this/is/a/dir/abc.rb", "%d")).toBe("this/is/a/dir");
    expect(pathmap("/this/is/a/dir/abc.rb", "%d")).toBe("/this/is/a/dir");
  });

  it("9d returns partial dirname", () => {
    expect(pathmap("this/is/a/dir/abc.rb", "%2d")).toBe("this/is");
    expect(pathmap("this/is/a/dir/abc.rb", "%1d")).toBe("this");
    expect(pathmap("this/is/a/dir/abc.rb", "%0d")).toBe(".");
    expect(pathmap("this/is/a/dir/abc.rb", "%-1d")).toBe("dir");
    expect(pathmap("this/is/a/dir/abc.rb", "%-2d")).toBe("a/dir");
    expect(pathmap("this/is/a/dir/abc.rb", "%100d")).toBe("this/is/a/dir");
    expect(pathmap("this/is/a/dir/abc.rb", "%-100d")).toBe("this/is/a/dir");
  });

  it("x returns extension", () => {
    expect(pathmap("abc", "%x")).toBe("");
    expect(pathmap("abc.rb", "%x")).toBe(".rb");
    expect(pathmap("abc.xyz.rb", "%x")).toBe(".rb");
    expect(pathmap(".depends", "%x")).toBe("");
    expect(pathmap("dir/.depends", "%x")).toBe("");
  });

  it("x returns everything but extension", () => {
    expect(pathmap("abc", "%X")).toBe("abc");
    expect(pathmap("abc.rb", "%X")).toBe("abc");
    expect(pathmap("abc.xyz.rb", "%X")).toBe("abc.xyz");
    expect(pathmap("ab.xyz.rb", "%X")).toBe("ab.xyz");
    expect(pathmap("a.xyz.rb", "%X")).toBe("a.xyz");
    expect(pathmap("abc.rb", "%X")).toBe("abc");
    expect(pathmap("ab.rb", "%X")).toBe("ab");
    expect(pathmap("a.rb", "%X")).toBe("a");
    expect(pathmap(".depends", "%X")).toBe(".depends");
    expect(pathmap("a/dir/.depends", "%X")).toBe("a/dir/.depends");
    expect(pathmap("/.depends", "%X")).toBe("/.depends");
  });

  it("p returns entire pathname", () => {
    expect(pathmap("abc.rb", "%p")).toBe("abc.rb");
    expect(pathmap("this/is/a/dir/abc.rb", "%p")).toBe("this/is/a/dir/abc.rb");
    expect(pathmap("/this/is/a/dir/abc.rb", "%p")).toBe("/this/is/a/dir/abc.rb");
  });

  it("dash returns empty string", () => {
    expect(pathmap("abc.rb", "%-")).toBe("");
    expect(pathmap("abc.rb", "%X%-%x")).toBe("abc.rb");
  });

  it("percent percent returns percent", () => {
    expect(pathmap("", "a%%b")).toBe("a%b");
  });

  it("undefined percent causes error", () => {
    expect(() => {
      pathmap("dir/abc.rb", "%z");
    }).toThrow(ArgumentError);
  });

  it("pattern returns substitutions", () => {
    expect(pathmap("src/org/osb/Xyz.java", "%{src,bin}d")).toBe("bin/org/osb");
  });

  it("pattern can use backreferences", () => {
    expect(pathmap("dir/this/is", "%{t(hi)s,\\1}p")).toBe("dir/hi/is");
  });

  it("pattern with star replacement string uses block", () => {
    expect(pathmap("src/org/osb/Xyz.java", "%{/org,*}d", (d) => d.toUpperCase())).toBe(
      "src/ORG/osb",
    );
    expect(pathmap("src/org/osb/Xyz.java", "%{.*,*}f", (f) => capitalize(f, []))).toBe("Xyz.java");
  });

  it("pattern with no replacement nor block substitutes empty string", () => {
    expect(pathmap("abc.rb", "%{a}f")).toBe("bc.rb");
  });

  it("pattern works with certain valid operators", () => {
    expect(pathmap("dir/abc.rb", "%{a,x}p")).toBe("dir/xbc.rb");
    expect(pathmap("dir/abc.rb", "%{i,1}d")).toBe("d1r");
    expect(pathmap("dir/abc.rb", "%{a,x}f")).toBe("xbc.rb");
    expect(pathmap("dir/abc.rb", "%{r,R}x")).toBe(".Rb");
    expect(pathmap("dir/abc.rb", "%{a,x}n")).toBe("xbc");
  });

  it("multiple patterns", () => {
    expect(pathmap("this/is/a/dir/abc.rb", "%{a,b;dir,\\0ectory}p")).toBe(
      "this/is/b/directory/abc.rb",
    );
  });

  it("partial directory selection works with patterns", () => {
    expect(pathmap("this/is/a/really/long/path/ok.rb", "%{/really/,/}5d")).toBe("this/is/a/long");
  });

  it("pattern with invalid operator", () => {
    const run = () => pathmap("abc.xyz", "%{src,bin}z");
    expect(run).toThrow(ArgumentError);
    const ex = (() => {
      try {
        run();
      } catch (error) {
        return error as ArgumentError;
      }
    })()!;
    expect(ex.message).toMatch(/unknown.*pathmap.*spec.*z/i);
  });

  it("works with windows separators", () => {
    expect(File.ALT_SEPARATOR ? pathmap("dir\\abc.rb", "%n") : "abc").toBe("abc");
    expect(
      File.ALT_SEPARATOR ? pathmap("this\\is\\a\\dir\\abc.rb", "%d") : "this\\is\\a\\dir",
    ).toBe("this\\is\\a\\dir");
  });

  it("complex patterns", () => {
    const sep = pathmap("", "%s");
    expect(pathmap("dir/abc.rb", "%d/%n%x")).toBe("dir/abc.rb");
    expect(pathmap("abc.rb", "%d/%n%x")).toBe("./abc.rb");
    expect(pathmap("dir/abc.rb", "Your file extension is '%x'")).toBe(
      "Your file extension is '.rb'",
    );
    expect(pathmap("src/org/onestepback/proj/A.java", "%{src,bin}d/%n.class")).toBe(
      "bin/org/onestepback/proj/A.class",
    );
    expect(pathmap("src_work/src/org/onestepback/proj/A.java", "%{\\bsrc\\b,bin}X.class")).toBe(
      "src_work/bin/org/onestepback/proj/A.class",
    );
    expect(pathmap(".depends", "%X.bak")).toBe(".depends.bak");
    expect(pathmap("a/b/c/d/file.txt", "%-1d%s%3d%s%f")).toBe(`d${sep}a/b/c${sep}file.txt`);
  });
});
