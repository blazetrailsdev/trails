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
    const hash: Record<string, number> = { Integer: 1 };
    const dup = deepDup(hash);
    expect(Object.keys(dup).length).toBe(1);
  });

  it("deep dup with mutable frozen key", () => {
    const hash: Record<string, any> = { key: { array: [] } };
    const dup = deepDup(hash);
    dup.key.array.push("element");
    expect(hash.key.array).toEqual([]);
    expect(dup.key.array).toEqual(["element"]);
  });

  it("named modules arent duped", () => {
    const hash = { class: Object, module: Array };
    const dup = deepDup(hash);
    expect(dup.class).toBe(hash.class);
    expect(dup.module).toBe(hash.module);
  });

  it("anonymous modules are duped", () => {
    const hash = { class: { name: "anon" }, module: { name: "anon2" } };
    const dup = deepDup(hash);
    expect(dup.class).not.toBe(hash.class);
    expect(dup.module).not.toBe(hash.module);
    expect(dup.class).toEqual(hash.class);
    expect(dup.module).toEqual(hash.module);
  });
});
