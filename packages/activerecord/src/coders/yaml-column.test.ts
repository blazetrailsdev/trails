import { describe, it, expect } from "vitest";
import { YAMLColumn } from "./yaml-column.js";

// Trails-only round-trip coverage. The YAMLColumnTest / YAMLColumnTestWithSafeLoad
// blocks below stay Ruby-only (Psych safe-load / permitted-classes have no JS
// analog); these assert the dump/load contract the store coder relies on.
describe("YAMLColumn round-trip", () => {
  it("dumps and loads a plain hash", () => {
    const coder = new YAMLColumn("params");
    const dumped = coder.dump({ token: "abc", count: 3 });
    expect(typeof dumped).toBe("string");
    expect(coder.load(dumped)).toEqual({ token: "abc", count: 3 });
  });

  it("dumps nil as null and loads nil/blank as null", () => {
    const coder = new YAMLColumn("params");
    expect(coder.dump(null)).toBeNull();
    expect(coder.load(null)).toBeNull();
    expect(coder.load("")).toBeNull();
  });

  it("round-trips nested structures", () => {
    const coder = new YAMLColumn("params");
    const value = { a: [1, 2, { b: "x" }], c: { d: true } };
    expect(coder.load(coder.dump(value))).toEqual(value);
  });
});

describe("YAMLColumnTest", () => {
  it.skip("initialize takes class", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — yaml
  });
  it.skip("type mismatch on different classes on dump", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — yaml
  });
  it.skip("type mismatch on different classes", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — yaml
  });
  it.skip("nil is ok", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — yaml
  });
  it.skip("returns new with different class", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — yaml
  });
  it.skip("returns string unless starts with dash", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — yaml
  });
  it.skip("load raises on other classes", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — yaml
  });
  it.skip("load doesnt swallow yaml exceptions", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — yaml
  });
  it.skip("load doesnt handle undefined class or module", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — yaml
  });
});

describe("YAMLColumnTestWithSafeLoad", () => {
  it.skip("yaml column permitted classes are consumed by safe load", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — yaml
  });
  it.skip("yaml column permitted classes are consumed by safe dump", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — yaml
  });
  it.skip("yaml column permitted classes option", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — yaml
  });
  it.skip("yaml column unsafe load option", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — yaml
  });
  it.skip("yaml column override unsafe load option", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — yaml
  });
  it.skip("load doesnt handle undefined class or module", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — yaml
  });
});
