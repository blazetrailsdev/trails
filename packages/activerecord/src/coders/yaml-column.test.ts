import { describe, it, expect, afterEach } from "vitest";
import { YAMLColumn, DisallowedClass } from "./yaml-column.js";
import { ActiveRecord } from "../ar-config.js";
import { Temporal } from "@blazetrails/date";

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

  describe("safe dump", () => {
    afterEach(() => (ActiveRecord.useYamlUnsafeLoad = false));

    class Unpermitted {
      secret = "s3cret";
    }

    it("raises DisallowedClass when dumping an unpermitted class instance", () => {
      const coder = new YAMLColumn("params");
      expect(() => coder.dump(new Unpermitted())).toThrow(DisallowedClass);
      expect(() => coder.dump(new Unpermitted())).toThrow(
        /Tried to dump unspecified class: Unpermitted/,
      );
      expect(() => coder.dump({ nested: [new Unpermitted()] })).toThrow(DisallowedClass);
    });

    it("dumps unpermitted class instances when use_yaml_unsafe_load is set", () => {
      ActiveRecord.useYamlUnsafeLoad = true;
      const coder = new YAMLColumn("params");
      expect(coder.dump(new Unpermitted())).toContain("s3cret");
    });
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
  it("yaml column permitted classes are consumed by safe dump", () => {
    const coder = new YAMLColumn("attr_name");
    expect(() => coder.dump([Temporal.Now.instant()])).toThrow(DisallowedClass);
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
