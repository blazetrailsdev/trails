import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let text: string;

beforeAll(async () => {
  process.env.CODEGEN_GEM = "activejob";
  const { GemIndex } = await import("./gem-index.js");
  const { Resolver } = await import("./resolve.js");
  const { TypeOracle } = await import("./types.js");
  const { Emitter } = await import("./emit.js");
  const { ROOT } = await import("./gem.js");
  const ir = JSON.parse(
    readFileSync(path.join(import.meta.dirname, "fixtures/sample.json"), "utf8"),
  );
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
  text = emitter.emitFile(ir).text;
});

describe("lowering ActiveJob::Sample#collect", () => {
  it("dispatches Array#delete on an untyped receiver at run time", () => {
    expect(text).toContain("rbDelete(jobs, payload)");
  });

  it("reassigns a local String appended to, as a JS string is immutable", () => {
    expect(text).toContain('(message = rbAppend(message, "\\n\\nNone"))');
  });

  it("interpolates an untyped value by its Ruby to_s", () => {
    expect(text).toContain("No job found with ${rbObjAsString(expected)}");
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
