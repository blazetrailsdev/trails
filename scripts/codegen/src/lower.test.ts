import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let text: string;
let rules: string;
let tsType: (t: unknown) => string;

async function emitFixture(name: string): Promise<string> {
  process.env.CODEGEN_GEM = "activejob";
  const { GemIndex } = await import("./gem-index.js");
  const { Resolver } = await import("./resolve.js");
  const { TypeOracle } = await import("./types.js");
  const { Emitter } = await import("./emit.js");
  const { ROOT } = await import("./gem.js");
  const ir = JSON.parse(readFileSync(path.join(import.meta.dirname, `fixtures/${name}`), "utf8"));
  const index = new GemIndex();
  index.add(ir);
  const resolver = new Resolver(
    index,
    path.join(ROOT, "scripts/codegen/data/pkg-exports.json"),
    new TypeOracle(path.join(import.meta.dirname, "fixtures/empty-oracle.json")),
  );
  index.finish((f) => resolver.tsFileOf(f));
  const emitter = new Emitter(index, resolver);
  emitter.register(ir);
  tsType = (t) => emitter.lw.tsType(t as never);
  return emitter.emitFile(ir).text;
}

beforeAll(async () => {
  text = await emitFixture("sample.json");
  rules = await emitFixture("rules.json");
});

describe("lowering ActiveJob::Sample#collect", () => {
  it("dispatches Array#delete on an untyped receiver at run time", () => {
    expect(text).toContain(
      "(Array.isArray(jobs) ? aryDelete(jobs, payload) : hashDelete(jobs, payload))",
    );
  });

  it("reassigns a local String appended to, as a JS string is immutable", () => {
    expect(text).toContain('(message = message + "\\n\\nNone")');
  });

  it("interpolates an untyped value natively, nil as the empty string", () => {
    expect(text).toContain('No job found with ${expected ?? ""}');
  });

  it("splats each Hash pair across an all? block's parameters", () => {
    expect(text).toContain(
      "(expected instanceof globalThis.Map ? [...expected] : Array.isArray(expected) ? expected : Object.entries(expected ?? {})).every(([key, value]: any) =>",
    );
  });

  it("tests is_a?(Hash) with ruby-compat's Hash", () => {
    expect(text).toContain("rbObjIsKindOf(payload, Hash)");
  });

  it("runs Integer#times as a counted loop and Array#join through its Ruby form", () => {
    expect(text).toContain("for (let i = 0, _n = 3; i < _n; i++) {");
    expect(text).toContain('aryJoin(jobs, ", ")');
  });
});

describe("lowering active_job/rules.rb", () => {
  it("writes a singleton_class attr_accessor through its setX function", () => {
    expect(rules).toContain("ActiveJob.setVerboseLogs(false);");
  });

  it("emits a def overriding an inherited attr_accessor as a getter/setter pair", () => {
    expect(rules).toContain('get jobId(): any {\n    return "FIXED-ID";');
    expect(rules).toContain("set jobId(value) {\n    this._jobId = value;");
  });

  it("writes ExecutionContext[k] through its setKey", () => {
    expect(rules).toContain('ExecutionContext.setKey("job", job);');
  });

  it("tallies by identity and splats each pair across a two-parameter block", () => {
    expect(rules).toContain(
      ".map((x: any) => rbObjClass(x)).reduce((h: Map<any, number>, x: any) => h.set(x, (h.get(x) ?? 0) + 1), new Map())",
    );
    expect(rules).toContain("([_klass, count]: any) => -count");
    expect(rules).toContain("counts.map(([klass, count]: any) =>");
  });

  it("reads a class_attribute predicate as a getter", () => {
    expect(rules).toContain("if (rbObjClass(job).isLogArguments) {");
  });

  it("dispatches a bare call to the class's own method before Kernel#format", () => {
    expect(rules).toContain("this.format(arg)");
    expect(rules).not.toContain("rbFormat");
  });
});

describe("lowering Rails reads in active_job/rules.rb", () => {
  it("reads the TopLevel.Trails seat with a non-null assertion, not a cast", () => {
    expect(rules).toContain('if (TopLevel.Trails!.env["test?"]()) {');
    expect(rules).toContain("return TopLevel.Trails!.logger!;");
    expect(rules).toContain("return TopLevel.Trails!.backtraceCleaner;");
    expect(rules).not.toContain("TopLevel.Trails as any");
  });
});

describe("Ruby truthiness and interpolation in active_job/rules.rb, natively", () => {
  it("tests a parameter typed by its boolean default as a JS boolean", () => {
    expect(rules).toContain("if (force) {");
  });

  it("tests a block parameter for presence", () => {
    expect(rules).toContain("if (block != null) {");
  });

  it("tests an untyped value as neither nil nor false", () => {
    expect(rules).toContain("if (options != null && options !== false) {");
    expect(rules).toContain('if ((fetch(options, "check") ?? false) !== false) {');
    expect(rules).not.toContain("rtest(");
  });

  it("interpolates an untyped value with nil as the empty string", () => {
    expect(rules).toContain('return `checked ${options ?? ""}`;');
  });
});

describe("local declarations in active_job/rules.rb", () => {
  it("lets TypeScript infer a local the method assigns once", () => {
    expect(rules).toContain("const counts = [...");
  });

  it("types an empty Hash literal as an open record", () => {
    expect(rules).toContain("const opts: Record<string, any> = {};");
  });

  it("keeps a reassigned local untyped, as Ruby may change its type", () => {
    expect(rules).toContain("let total: any = 0;");
  });

  it("keeps a ruby-compat helper's unknown-typed result untyped", () => {
    expect(rules).toContain("const line: any = aryJoin(");
  });
});

describe("a hand twin's oracle type as a TS signature type", () => {
  it("spells primitives, nullable ones with null", () => {
    expect(tsType({ k: "prim", name: "string" })).toBe("string");
    expect(tsType({ k: "prim", name: "number", nullable: true })).toBe("number | null");
  });

  it("parenthesizes a nullable array element", () => {
    expect(tsType({ k: "array", el: { k: "prim", name: "string", nullable: true } })).toBe(
      "(string | null)[]",
    );
  });

  it("leaves an unknown or class type as any until it can be imported", () => {
    expect(tsType(null)).toBe("any");
    expect(tsType({ k: "class", key: "@activesupport/duration.ts#Duration" })).toBe("any");
  });
});

describe("option hashes in active_job/rules.rb", () => {
  it("spells an options literal's keys camelCase, as its later writes are", () => {
    expect(rules).toContain("const options: Record<string, any> = { primaryKey: 1 };");
    expect(rules).toContain("options.onDelete = 2;");
  });
});

describe("typed ivars in active_job/rules.rb", () => {
  it("declares an ivar initialize assigns unconditionally with its assigned type", () => {
    expect(rules).toContain("declare _name: string;");
    expect(rules).toContain("declare _hits: number;");
  });

  it("widens an ivar assigned elsewhere with null, as Ruby reads nil before it is set", () => {
    expect(rules).toContain("declare _label: string | null;");
  });
});

describe("Proc.new in active_job/rules.rb", () => {
  it("is the block's own function, not the JS Function constructor", () => {
    expect(rules).toContain('return () => this.note("later");');
    expect(rules).not.toContain("new Function(");
  });
});
