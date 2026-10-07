import { describe, it, expect } from "vitest";
import { rewriteHyphenNames, sourceOffset, type HyphenOptions } from "./hyphen-names.js";
import { compileJs } from "./emit-js.js";
import { parse } from "./parser.js";
import { TseSyntaxError } from "./lexer.js";

const LP: HyphenOptions = { resolve: "literal", positions: "property" };
const AP: HyphenOptions = { resolve: "alias", positions: "property" };
const LI: HyphenOptions = { resolve: "literal", positions: "identifier" };
const AI: HyphenOptions = { resolve: "alias", positions: "identifier" };

const out = (code: string, o: HyphenOptions): string => {
  const r = rewriteHyphenNames(code, o);
  return r.issues.length > 0 ? `ERR ${r.issues.map((i) => i.code).join(",")}` : r.code;
};

describe("rewriteHyphenNames: the three forms", () => {
  it("rewrites assignment, access and shorthand to a literal key", () => {
    expect(out("this.window-size = '10px'", LP)).toBe(`this["window-size"] = '10px'`);
    expect(out("this.window-size", LP)).toBe(`this["window-size"]`);
    expect(out("f({window-size})", LP)).toBe(`f({"window-size": windowSize})`);
  });

  it("rewrites the same three forms to a camelCase alias", () => {
    expect(out("this.window-size = '10px'", AP)).toBe("this.windowSize = '10px'");
    expect(out("this.window-size", AP)).toBe("this.windowSize");
    expect(out("f({window-size})", AP)).toBe("f({windowSize})");
  });
});

describe("rewriteHyphenNames: the whitespace rule", () => {
  it("leaves a both-sides-spaced minus alone", () => {
    for (const o of [LP, AP, LI, AI]) {
      expect(out("a - b", o)).toBe("a - b");
      expect(out("x.y - z.w", o)).toBe("x.y - z.w");
      expect(out("a -\n b", o)).toBe("a -\n b");
    }
  });

  it("rejects whitespace on exactly one side", () => {
    for (const code of ["this.test- 1", "this.test -1", "a\n-b", "this.a-", "x.typeof -y"]) {
      expect(out(code, LP)).toBe("ERR one-sided");
    }
  });

  it("rejects an unspaced minus that cannot be a name", () => {
    expect(out("f()-1", LP)).toBe("ERR unspaced-minus");
    expect(out("a[0]-b", LP)).toBe("ERR unspaced-minus");
    expect(out("this.a---b", LP)).toBe("ERR unspaced-minus");
  });

  it("leaves unary minus alone", () => {
    for (const code of [
      "a - -b",
      "f(-x)",
      "[a, -b]",
      "return -x",
      "typeof -x",
      "x = -1",
      "a * -b",
    ]) {
      expect(out(code, LP)).toBe(code);
    }
  });
});

describe("rewriteHyphenNames: grammar edges", () => {
  it("rejects a segment starting with a digit", () => {
    for (const code of ["this.x-1", "this.col-2", "arr.length-1", "n-1"]) {
      expect(out(code, LP)).toBe("ERR digit-segment");
      expect(out(code, AI)).toBe("ERR digit-segment");
    }
  });

  it("accepts keyword segments in property position", () => {
    expect(out("this.is-new", LP)).toBe(`this["is-new"]`);
    expect(out("this.data-class", LP)).toBe(`this["data-class"]`);
    expect(out("this.for-each", AP)).toBe("this.forEach");
  });

  it("keeps `--` and `-=` as their own operators", () => {
    expect(out("this.a--", LP)).toBe("this.a--");
    expect(out("this.a-=1", LP)).toBe("this.a-=1");
    expect(out("this.a -= 1", LP)).toBe("this.a -= 1");
    expect(out("this.a--b", LP)).toBe("ERR consecutive-hyphens");
  });

  it("leaves a leading hyphen to the JS parser", () => {
    expect(out("this.-a", LP)).toBe("this.-a");
  });

  it("handles optional chaining, calls, and quoted/computed keys beside it", () => {
    expect(out("this.a-b?.c-d()", LP)).toBe(`this["a-b"]?.["c-d"]()`);
    expect(out("this.a-b?.c-d()", AP)).toBe("this.aB?.cD()");
    expect(out("this.fetch-all()", LP)).toBe(`this["fetch-all"]()`);
    expect(out("this['a-b'].c-d[e - f]", LP)).toBe(`this['a-b']["c-d"][e - f]`);
    expect(out("x.a-b-c", LP)).toBe(`x["a-b-c"]`);
  });

  it("handles destructuring defaults and renames, object keys and methods", () => {
    expect(out("const {window-size = 10} = o", LP)).toBe(
      `const {"window-size": windowSize = 10} = o`,
    );
    expect(out("const {window-size = 10} = o", AP)).toBe("const {windowSize = 10} = o");
    expect(out("const {window-size: w} = o", LP)).toBe(`const {"window-size": w} = o`);
    expect(out("f({window-size: 10, b, fetch-all() {}})", LP)).toBe(
      `f({"window-size": 10, b, "fetch-all"() {}})`,
    );
  });

  it("skips strings, comments, regex literals and template text, but not ${}", () => {
    expect(out("'a-b' + \"c-d\" // e-f\n + g.h-i", LP)).toBe(`'a-b' + "c-d" // e-f\n + g["h-i"]`);
    expect(out("x = /a-b/.test(s.t-u)", LP)).toBe(`x = /a-b/.test(s["t-u"])`);
    expect(out("`x-y ${this.a-b} ${a - b} ${`n-m ${p.q-r}`}`", LP)).toBe(
      '`x-y ${this["a-b"]} ${a - b} ${`n-m ${p["q-r"]}`}`',
    );
    expect(out("1e-5 - x", LP)).toBe("1e-5 - x");
  });

  it("rejects a hyphenated #private name", () => {
    expect(out("this.#a-b", LP)).toBe("ERR private-name");
  });

  it("does not read a block's `{a-b}` as shorthand", () => {
    expect(out("() => {a-b}", LP)).toBe("ERR bare-name");
    expect(out("if (x) { y.a-b }", LP)).toBe(`if (x) { y["a-b"] }`);
  });
});

describe("rewriteHyphenNames: where a name is legal", () => {
  it("rejects a bare hyphenated name in property-only mode", () => {
    expect(out("a-b", LP)).toBe("ERR bare-name");
    expect(out("({a-b: c-d})", AP)).toBe("ERR bare-name");
  });

  it("camelCases a bare name in full-identifier mode, under either resolution", () => {
    expect(out("const window-size = 10", AI)).toBe("const windowSize = 10");
    expect(out("const window-size = 10; f({window-size})", LI)).toBe(
      `const windowSize = 10; f({"window-size": windowSize})`,
    );
    expect(out("({a-b: c-d})", LI)).toBe(`({"a-b": cD})`);
  });

  it("silently turns today's unspaced subtraction into one name (the hazard)", () => {
    expect(out("post.total-discount", LP)).toBe(`post["total-discount"]`);
    expect(out("end-start", AI)).toBe("endStart");
  });
});

describe("sourceOffset", () => {
  it("maps columns after a rewrite back to the source", () => {
    const src = "this.window-size.length + this.a-b.x";
    const r = rewriteHyphenNames(src, LP);
    expect(r.code).toBe(`this["window-size"].length + this["a-b"].x`);
    expect(sourceOffset(r.edits, r.code.indexOf(".length"))).toBe(src.indexOf(".length"));
    expect(sourceOffset(r.edits, r.code.indexOf(".x"))).toBe(src.indexOf(".x"));
    expect(sourceOffset(r.edits, r.code.indexOf('"a-b"'))).toBe(src.indexOf(".a-b"));
  });
});

describe("compileJs with hyphenNames", () => {
  const run = (source: string, self: object, o: HyphenOptions | null = LP): string => {
    const { code } = compileJs(source, { hyphenNames: o });
    const body = code.replace(/^export default function render\(context, locals\) \{/, "");
    const buf: string[] = [];
    const ob = {
      safeAppend: (s: string) => buf.push(s),
      append: (v: unknown) => buf.push(String(v)),
    };
    new Function("context", "locals", body.replace(/\}\s*$/, "")).call(
      self,
      { outputBuffer: ob },
      {},
    );
    return buf.join("");
  };

  it("is off by default, so existing templates compile unchanged", () => {
    expect(compileJs("<%= a-b %>").code).toContain("_ob.append( a-b );");
  });

  it("runs all three forms end to end with literal keys", () => {
    const self: Record<string, unknown> = { "window-size": "10px" };
    const source =
      "<% this.max-width = '5px'; const windowSize = 3; const o = {window-size}; %>" +
      '<div style="width: <%= this.window-size %>" data-n="<%= o[\'window-size\'] - 1 %>">';
    expect(run(source, self)).toBe('<div style="width: 10px" data-n="2">');
    expect(self["max-width"]).toBe("5px");
  });

  it("runs the same template with the alias resolution", () => {
    const self: Record<string, unknown> = { windowSize: "10px" };
    expect(run("<% this.max-width = 1 %><%= this.window-size %>", self, AP)).toBe("10px");
    expect(self.maxWidth).toBe(1);
  });

  it("leaves HTML text, with its own hyphens, alone", () => {
    expect(run('<a data-turbo-frame="x-y" aria-label="a -b"><%= 3 - 1 %></a>', {})).toBe(
      '<a data-turbo-frame="x-y" aria-label="a -b">2</a>',
    );
  });

  it("treats `-%>` as the trim marker, not a trailing hyphen", () => {
    expect(run("<% this.a-b = 1 -%>\nx", {})).toBe("x");
  });

  it("is enabled per file by a pragma", () => {
    expect(run("<%! hyphen-names: literal !%><%= this.a-b %>", { "a-b": 7 }, null)).toBe("7");
    expect(run("<%! hyphen-names: alias !%><%= this.a-b %>", { aB: 8 }, null)).toBe("8");
  });

  it("raises a positioned TseSyntaxError for a one-sided minus", () => {
    let err: TseSyntaxError | undefined;
    try {
      parse("<p>\n  <%= this.test -1 %>\n", true, LP);
    } catch (e) {
      err = e as TseSyntaxError;
    }
    expect(err).toBeInstanceOf(TseSyntaxError);
    expect(err!.message).toMatch(/^2:17: whitespace on only one side/);
    expect([err!.srcLine, err!.srcCol]).toEqual([1, 16]);
  });

  it("positions an error on a later line of a multi-line tag", () => {
    expect(() => parse("<%\n  const a = 1;\n  x.b- a\n%>", true, LP)).toThrow(/^3:6: /);
  });
});
