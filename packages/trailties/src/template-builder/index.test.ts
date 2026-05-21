import { describe, expect, it } from "vitest";
import {
  ref,
  type,
  tsBody,
  tsImport,
  tsImportDefault,
  tsImportType,
  tsField,
  tsMethod,
  tsClass,
  tsInterface,
  tsModule,
  tsRaw,
} from "./index.js";
import { assertNoRubySource, parseTs } from "./testing.js";

describe("template-builder", () => {
  it("dedupes imports across declarations", () => {
    const { refs: ar } = tsImport("@blazetrails/activerecord", { Base: "named" });
    const out = tsModule({
      declarations: [
        tsClass({ name: "A", extends: ar.Base, body: [] }),
        tsClass({ name: "B", extends: ar.Base, body: [] }),
      ],
    });
    expect(out.match(/from "@blazetrails\/activerecord"/g) ?? []).toHaveLength(1);
    expect(out).toContain(`import { Base } from "@blazetrails/activerecord";`);
  });

  it("combines default + named in same import and emits type-only + renames", () => {
    const t = tsImportType("x", { T: "named" });
    const d = tsImportDefault("./foo.js", "Foo");
    const out = tsModule({
      imports: [
        { from: "x", default: "Foo" },
        { from: "x", named: { Bar: "Bar" } },
        { from: "y", named: { LocalName: "Original" } },
        t.import,
        d.import,
      ],
      declarations: [],
    });
    expect(out).toContain(`import Foo, { Bar } from "x";`);
    expect(out).toContain(`import type { T } from "x";`);
    expect(out).toContain(`import { Original as LocalName } from "y";`);
    expect(out).toContain(`import Foo from "./foo.js";`);
  });

  it("propagates refs through type and tsBody, dedents tsBody", () => {
    const u = ref("User", "./user.js");
    const body = tsBody`
      const u = new ${u}();
      return u;
    `;
    expect(body.text).toBe("const u = new User();\nreturn u;");
    const out = tsModule({
      declarations: [
        tsClass({
          name: "C",
          body: [tsMethod({ name: "make", params: [], returnType: type`Array<${u}>`, body })],
        }),
      ],
    });
    expect(out).toContain(`import { User } from "./user.js";`);
    expect(out).toContain(`Array<User>`);
    expect(out).toContain(`return u;`);
  });

  it("preserves explicit renames AND auto-collects additional refs from the same module", () => {
    const renamed = ref("LocalName", "y");
    const other = ref("Sibling", "y");
    const out = tsModule({
      imports: [{ from: "y", named: { LocalName: "Original" } }],
      declarations: [
        tsClass({
          name: "C",
          body: [
            tsMethod({
              name: "f",
              params: [],
              returnType: "void",
              body: tsBody`new ${renamed}(); new ${other}();`,
            }),
          ],
        }),
      ],
    });
    expect(out).toContain(`import { Original as LocalName, Sibling } from "y";`);
    expect(out.match(/from "y"/g) ?? []).toHaveLength(1);
  });

  it("throws on conflicting default imports from the same module", () => {
    expect(() =>
      tsModule({
        imports: [
          { from: "x", default: "Foo" },
          { from: "x", default: "Bar" },
        ],
        declarations: [],
      }),
    ).toThrow(/Conflicting default imports/);
  });

  it("throws on conflicting named imports for the same alias", () => {
    expect(() =>
      tsModule({
        imports: [
          { from: "x", named: { A: "Alpha" } },
          { from: "x", named: { A: "Beta" } },
        ],
        declarations: [],
      }),
    ).toThrow(/Conflicting named imports/);
  });

  it('accepts the "named" shorthand in Import.named', () => {
    const out = tsModule({
      imports: [{ from: "x", named: { Foo: "named", Bar: "named" } }],
      declarations: [],
    });
    expect(out).toContain(`import { Bar, Foo } from "x";`);
  });

  it("does not add a duplicate named binding when an explicit default import covers it", () => {
    const d = tsImportDefault("./foo.js", "Foo");
    const r = ref("Foo", "./foo.js");
    const out = tsModule({
      imports: [d.import],
      declarations: [
        tsClass({
          name: "C",
          body: [
            tsMethod({ name: "f", params: [], returnType: "void", body: tsBody`new ${r}();` }),
          ],
        }),
      ],
    });
    expect(out).toContain(`import Foo from "./foo.js";`);
    expect(out).not.toContain(`{ Foo }`);
  });

  it("throws when an import binds the same identifier as both default and named", () => {
    expect(() =>
      tsModule({
        imports: [{ from: "x", default: "Foo", named: { Foo: "named" } }],
        declarations: [],
      }),
    ).toThrow(/both default and named/);
  });

  it("tsImportDefault preserves the default name as the refs key type", () => {
    const d = tsImportDefault("./foo.js", "Foo");
    // Compile-time: d.refs.Foo is Ref; runtime: shape is correct.
    expect(d.refs.Foo).toBeDefined();
  });

  it("supports tsInterface extends and raw declarations", () => {
    const base = ref("Base", "./base.js");
    const out = tsModule({
      declarations: [
        tsRaw("// hand-rolled banner"),
        tsInterface({ name: "Sub", extends: [base], body: [tsField("id", "number")] }),
      ],
    });
    expect(out).toContain(`// hand-rolled banner`);
    expect(out).toContain(`export interface Sub extends Base {`);
    expect(out).toContain(`import type { Base } from "./base.js";`);
    expect(parseTs(out).diagnostics).toEqual([]);
  });

  it("emits a valid hand-built module (snapshot + parse + no-Ruby)", () => {
    const { refs: ar } = tsImport("@blazetrails/activerecord", { Base: "named" });
    const out = tsModule({
      preamble: "// auto-generated",
      declarations: [
        tsClass({
          name: "User",
          extends: ar.Base,
          body: [
            tsField("name", "string"),
            tsMethod({
              name: "greet",
              params: [],
              returnType: "string",
              body: tsBody`return "hi " + this.name;`,
            }),
          ],
        }),
        tsInterface({ name: "UserShape", body: [tsField("name", "string")] }),
      ],
    });
    expect(out).toMatchSnapshot();
    expect(parseTs(out).diagnostics).toEqual([]);
    assertNoRubySource(out);
  });

  it("promotes a renamed type-only import to value when the binding is used as a value", () => {
    const local = ref("Local", "x");
    const out = tsModule({
      imports: [{ from: "x", typeOnly: true, named: { Local: "Original" } }],
      declarations: [
        tsClass({
          name: "C",
          body: [
            tsMethod({ name: "f", params: [], returnType: "void", body: tsBody`new ${local}();` }),
          ],
        }),
      ],
    });
    expect(out).toContain(`import { Original as Local } from "x";`);
    expect(out).not.toContain(`import type { Local }`);
    expect(out).not.toContain(`import type { Original`);
  });

  it("reconciles overlapping value + type-only imports for the same binding", () => {
    const out = tsModule({
      imports: [
        { from: "x", named: { Foo: "Foo" } },
        { from: "x", typeOnly: true, named: { Foo: "Foo", Bar: "Bar" } },
      ],
      declarations: [],
    });
    expect(out).toContain(`import { Foo } from "x";`);
    expect(out).toContain(`import type { Bar } from "x";`);
    expect(out).not.toMatch(/import type \{[^}]*Foo[^}]*\} from "x"/);
  });

  it("auto-imports type-only refs as 'import type' when never used as a value", () => {
    const t = ref("Opts", "./opts.js");
    const out = tsModule({
      declarations: [tsInterface({ name: "I", body: [tsField("o", t)] })],
    });
    expect(out).toContain(`import type { Opts } from "./opts.js";`);
  });

  it("promotes a ref to a value import when any usage is in value position", () => {
    const base = ref("Base", "./base.js");
    const out = tsModule({
      declarations: [tsClass({ name: "C", extends: base, body: [tsField("b", base)] })],
    });
    expect(out).toContain(`import { Base } from "./base.js";`);
    expect(out).not.toContain(`import type`);
  });

  it("sanitizes JSDoc comments against terminator-injection", () => {
    const out = tsModule({
      declarations: [
        tsClass({
          name: "C",
          body: [
            tsField("a", "string", { comment: "evil */ injected" }),
            tsField("b", "string", { comment: "first line\nsecond line" }),
          ],
        }),
      ],
    });
    expect(out).not.toMatch(/evil \*\/ injected/);
    expect(out).toContain("evil *\\/ injected");
    expect(out).toContain("   * first line");
    expect(out).toContain("   * second line");
    expect(parseTs(out).diagnostics).toEqual([]);
  });

  it("assertNoRubySource flags Ruby class/module/def lines", () => {
    expect(() => assertNoRubySource("class User < Base\nend")).toThrow();
    expect(() => assertNoRubySource("module Foo\nend")).toThrow();
    expect(() => assertNoRubySource("  def greet\n  end")).toThrow();
    expect(() => assertNoRubySource(`export class User extends Base {}`)).not.toThrow();
  });
});
