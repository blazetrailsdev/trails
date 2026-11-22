/**
 * trails-only covers for `OrderedOptions#dig`'s inherited `rb_obj_dig` seats
 * (`vendor/ruby/v3.3.11/object.c:3906`) — the object-that-answers-`dig` arm and
 * `no_dig_method`'s TypeError (`:3897-3900`) — which the gem's own suite
 * reaches only through nested Hashes.
 */
import { describe, it, expect } from "vitest";
import { KeyError, rbEqual } from "@blazetrails/ruby-compat";
import { OrderedOptions } from "../lib/ordered-options.js";
import { HashWithIndifferentAccess } from "../lib/hash-with-indifferent-access.js";

describe("OrderedOptions", () => {
  it("dig hands the remaining identifiers to an object that answers dig", () => {
    const a = new OrderedOptions();
    a.set("testKey", new HashWithIndifferentAccess<unknown>({ a: { b: 1 } }));
    expect(a.dig("testKey", ":a", "b")).toBe(1);
  });

  it("dig raises TypeError for a non-diggable intermediate", () => {
    const a = new OrderedOptions();
    a.set("testKey", 56);
    expect(() => a.dig("testKey", "a")).toThrow("Integer does not have #dig method");
  });

  it("dig raises TypeError for a non-Integer Array index", () => {
    const a = new OrderedOptions();
    a.set("testKey", [{ a: 1 }]);
    expect(() => a.dig("testKey", "0")).toThrow("no implicit conversion of String into Integer");
  });

  it("dig indexes a Map intermediate through rb_hash_aref", () => {
    const a = new OrderedOptions();
    a.set("testKey", new Map([["a", 1]]));
    expect(a.dig("testKey", "a")).toBe(1);
  });

  it("update answers the options, so a property read off its result works", () => {
    const a = new OrderedOptions().update({ foo: 1 }) as OrderedOptions & { foo: unknown };
    expect(a.foo).toBe(1);
    expect(a.set("bar", 2).get("bar")).toBe(2);
  });
});

describe("OrderedOptions method_missing in the prototype chain", () => {
  it("lets a subclass with a #private field construct and answer dynamic names", () => {
    class Sub extends OrderedOptions {
      #tag = "sub";
      tag(): string {
        return this.#tag;
      }
    }
    const options = new Sub() as Sub & Record<string, unknown>;
    options.foo = 1;
    expect(options.tag()).toBe("sub");
    expect(options.foo).toBe(1);
    expect(options.get("foo")).toBe(1);
    expect(Object.keys(options)).not.toContain("foo");
    expect(options instanceof Sub).toBe(true);
    expect(Object.getPrototypeOf(options)).toBe(Sub.prototype);
  });
});

describe("OrderedOptions Hash#==", () => {
  it("compares equal to a Hash of the same contents in both orders", () => {
    const options = new OrderedOptions();
    options.set("a", 1);
    const nested = new OrderedOptions();
    nested.set("b", 2);
    options.set("nested", nested);
    expect(rbEqual({ a: 1, nested: { b: 2 } }, options)).toBe(true);
    expect(rbEqual(options, { a: 1, nested: { b: 2 } })).toBe(true);
    expect(rbEqual({ a: 1, nested: { b: 3 } }, options)).toBe(false);
    expect(rbEqual(options, { a: 1, nested: { b: 3 } })).toBe(false);
  });

  it("compares equal to another OrderedOptions and to a HashWithIndifferentAccess", () => {
    const left = new OrderedOptions();
    left.set("a", 1);
    const right = new OrderedOptions();
    right.set("a", 1);
    const other = new OrderedOptions();
    other.set("a", 2);
    expect(rbEqual(left, right)).toBe(true);
    expect(rbEqual(left, other)).toBe(false);
    const hwia = new HashWithIndifferentAccess({ a: 1 });
    expect(rbEqual(left, hwia)).toBe(true);
    expect(rbEqual(hwia, left)).toBe(true);
    expect(rbEqual(other, hwia)).toBe(false);
    expect(rbEqual(hwia, other)).toBe(false);
  });
});

describe("OrderedOptions#fetch", () => {
  it("raises KeyError inspecting a missing key as a Symbol", () => {
    let error: unknown;
    try {
      new OrderedOptions().fetch("nothing");
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(KeyError);
    expect((error as KeyError).message).toBe("key not found: :nothing");
    expect((error as KeyError).key()).toBe("nothing");
  });
});
