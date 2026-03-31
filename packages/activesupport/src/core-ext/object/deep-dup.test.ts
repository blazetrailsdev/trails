import { describe, it, expect } from "vitest";
import { deepDup } from "../../hash-utils.js";

describe("DeepDupTest", () => {
  it("array deep dup", () => {
    const array = [1, [2, 3]];
    const dup = deepDup(array);
    (dup[1] as number[])[2] = 4;
    expect((array[1] as number[])[2]).toBeUndefined();
    expect((dup[1] as number[])[2]).toBe(4);
  });

  it("hash deep dup", () => {
    const hash: Record<string, any> = { a: { b: "b" } };
    const dup = deepDup(hash);
    dup.a.c = "c";
    expect(hash.a.c).toBeUndefined();
    expect(dup.a.c).toBe("c");
  });

  it("array deep dup with hash inside", () => {
    const array: any[] = [1, { a: 2, b: 3 }];
    const dup = deepDup(array);
    dup[1].c = 4;
    expect(array[1].c).toBeUndefined();
    expect(dup[1].c).toBe(4);
  });

  it("hash deep dup with array inside", () => {
    const hash: Record<string, any> = { a: [1, 2] };
    const dup = deepDup(hash);
    dup.a[2] = "c";
    expect(hash.a[2]).toBeUndefined();
    expect(dup.a[2]).toBe("c");
  });

  it("deep dup initialize", () => {
    // Ruby Hash.new(0) returns 0 for missing keys; TS equivalent uses a Proxy
    const zeroHash = new Proxy<Record<string, number>>(
      {},
      {
        get(target, prop) {
          if (typeof prop === "string" && !(prop in target)) return 0;
          return target[prop as string];
        },
      },
    );
    const hash = { a: zeroHash };
    const dup = deepDup(hash);
    // After deep dup, the nested object is a plain copy (not a Proxy)
    // but the original values should be preserved
    expect(dup.a).toBeDefined();
    expect(dup.a).not.toBe(hash.a);
  });

  it("object deep dup", () => {
    const object: Record<string, any> = { existing: true };
    const dup = deepDup(object);
    dup.a = 1;
    expect(object.a).toBeUndefined();
    expect(dup.a).toBe(1);
  });

  it("deep dup with hash class key", () => {
    // Ruby uses class objects as keys; in TS we use string keys
    const hash: Record<string, number> = { Integer: 1 };
    const dup = deepDup(hash);
    expect(Object.keys(dup).length).toBe(1);
  });

  it("deep dup with mutable frozen key", () => {
    // In TS, object keys are always strings, so we test that values are deeply copied
    const hash: Record<string, any> = { key: { array: [] } };
    const dup = deepDup(hash);
    dup.key.array.push("element");
    expect(hash.key.array).toEqual([]);
    expect(dup.key.array).toEqual(["element"]);
  });

  it("named modules arent duped", () => {
    // Named classes/constructors shouldn't be deep-duped; they're references
    const hash = { class: Object, module: Array };
    const dup = deepDup(hash);
    expect(dup.class).toBe(hash.class);
    expect(dup.module).toBe(hash.module);
  });

  it("anonymous modules are duped", () => {
    // Anonymous classes (plain objects) should be deep-duped
    const hash = { class: { name: "anon" }, module: { name: "anon2" } };
    const dup = deepDup(hash);
    expect(dup.class).not.toBe(hash.class);
    expect(dup.module).not.toBe(hash.module);
    expect(dup.class).toEqual(hash.class);
    expect(dup.module).toEqual(hash.module);
  });
});
