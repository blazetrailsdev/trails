import { describe, it, expect } from "vitest";
import { Hash } from "@blazetrails/ruby-compat";
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
    const zeroHash = new Hash<number, number>(0);
    const hash = { a: zeroHash };
    const dup = deepDup(hash);
    expect(dup.a.get(44)).toEqual(0);
  });

  it("object deep dup", () => {
    const object: Record<string, unknown> = {};
    const dup = deepDup(object);
    dup.a = 1;
    expect(Object.hasOwn(object, "a")).toBeFalsy();
    expect(Object.hasOwn(dup, "a")).toBeTruthy();
  });

  it("deep dup with hash class key", () => {
    const hash = new Hash<unknown, number>();
    hash.set(Number, 1);
    const dup = deepDup(hash);
    expect([...dup.keys()].length).toEqual(1);
  });

  it("deep dup with mutable frozen key", () => {
    const key = Object.freeze({ array: [] as string[] });
    const hash = new Hash<{ array: string[] }, string>();
    hash.set(key, ":value");
    const dup = deepDup(hash);
    for (const k of dup.keys()) k.array.push(":array_element");
    expect([...dup.keys()]).not.toEqual([...hash.keys()]);
  });

  it("named modules arent duped", () => {
    const hash = { class: Object, module: Array };
    expect(deepDup(hash)).toEqual(hash);
  });

  it("anonymous modules are duped", () => {
    const hash = { class: { name: "anon" }, module: { name: "anon2" } };
    const dup = deepDup(hash);
    expect(dup.class).not.toBe(hash.class);
    expect(dup.module).not.toBe(hash.module);
  });
});
