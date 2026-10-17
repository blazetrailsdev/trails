import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let text: string;
let rules: string;

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
  return emitter.emitFile(ir).text;
}

beforeAll(async () => {
  text = await emitFixture("sample.json");
  rules = await emitFixture("rules.json");
});

describe("lowering ActiveJob::Sample#collect", () => {
  it("dispatches Array#delete on an untyped receiver at run time", () => {
    expect(text).toContain("rbDelete(jobs, payload)");
  });

  it("reassigns a local String appended to, as a JS string is immutable", () => {
    expect(text).toContain('(message = rbAppend(message, "\\n\\nNone"))');
  });

  it("interpolates an untyped value natively, nil as the empty string", () => {
    expect(text).toContain('No job found with ${expected ?? ""}');
  });

  it("splats each Hash pair across an all? block's parameters", () => {
    expect(text).toContain("rbEntries(expected).every(([key, value]: any) =>");
  });

  it("tests is_a?(Hash) with ruby-compat's Hash", () => {
    expect(text).toContain("rbObjIsKindOf(payload, Hash)");
  });

  it("runs Integer#times and Array#join through their Ruby forms", () => {
    expect(text).toContain("times((3), (i?: any) =>");
    expect(text).toContain('aryJoin(jobs, ", ")');
  });
});

describe("lowering active_job/rules.rb", () => {
  it("writes a singleton_class attr_accessor through its setX function", () => {
    expect(rules).toContain("ActiveJob.setVerboseLogs(false);");
  });

  it("emits a def overriding an inherited attr_accessor as a getter/setter pair", () => {
    expect(rules).toContain('get jobId(): any {\n    return "FIXED-ID";');
    expect(rules).toContain("set jobId(value: any) {\n    this._jobId = value;");
  });

  it("writes ExecutionContext[k] through its setKey", () => {
    expect(rules).toContain('ExecutionContext.setKey("job", job);');
  });

  it("tallies by identity and splats each pair across a two-parameter block", () => {
    expect(rules).toContain("tally(rbEnum(jobs).map((x: any) => (x.constructor as any)))");
    expect(rules).toContain("([_klass, count]: any) => -count");
    expect(rules).toContain("counts.map(([klass, count]: any) =>");
  });

  it("reads a class_attribute predicate as a getter", () => {
    expect(rules).toContain("if ((job.constructor as any).isLogArguments) {");
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
