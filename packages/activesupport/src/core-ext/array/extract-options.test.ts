import { describe, expect, it } from "vitest";
import { extractOptionsBang, HashWithIndifferentAccess, OrderedOptions } from "../../index.js";

describe("ExtractOptionsTest", () => {
  // Ruby's `class HashSubclass < Hash`; a class instance is not a plain object,
  // so it is the TS shape of a Hash subclass that does not opt in.
  class HashSubclass {
    foo?: number;
  }

  class ExtractableHashSubclass {
    foo?: number;
    isExtractableOptions(): boolean {
      return true;
    }
  }

  it("extract options", () => {
    expect(extractOptionsBang([])[1]).toEqual({});
    expect(extractOptionsBang([1])[1]).toEqual({});
    expect(extractOptionsBang([{ a: ":b" }])[1]).toEqual({ a: ":b" });
    expect(extractOptionsBang([1, { a: ":b" }])[1]).toEqual({ a: ":b" });
  });

  it("extract options doesnt extract hash subclasses", () => {
    const hash = new HashSubclass();
    hash.foo = 1;
    const [array, options] = extractOptionsBang([hash]);
    expect(options).toEqual({});
    expect(array).toEqual([hash]);
  });

  it("extract options extracts extractable subclass", () => {
    const hash = new ExtractableHashSubclass();
    hash.foo = 1;
    const [array, options] = extractOptionsBang([hash]);
    expect(options).toBe(hash);
    expect(array).toEqual([]);
  });

  it("extract options extracts hash with indifferent access", () => {
    const array = [new HashWithIndifferentAccess({ foo: 1 })];
    const [, options] = extractOptionsBang(array);
    expect((options as unknown as HashWithIndifferentAccess).get("foo")).toBe(1);
  });

  it("extract options extracts ordered options", () => {
    const hash = new OrderedOptions();
    hash.set("foo", 1);
    const [array, options] = extractOptionsBang([hash]);
    expect(options).toBe(hash);
    expect(array).toEqual([]);
  });
});
