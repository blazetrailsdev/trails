import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { SHIM_SOURCES, implementedShimNames, runtimeShim } from "./runtime-shim.js";

let shim: Record<string, (...args: unknown[]) => unknown>;

beforeAll(async () => {
  const dir = path.join(import.meta.dirname, "..", ".ir-shim-test");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "codegen-runtime.ts");
  writeFileSync(
    file,
    runtimeShim([
      "times",
      "rbBinop",
      "rbDelete",
      "rbSingletonPublicMethods",
      "rbMakeException",
      "rbRaise",
      "rbAsyncEnum",
      "rbAryEnsure",
      "notPorted",
    ]),
  );
  shim = await import(file);
});

describe("runtimeShim", () => {
  it("Integer#times yields in order, awaiting an async block before the next, and answers the receiver", async () => {
    const seen: number[] = [];
    const result = await shim.times(3, async (i: number) => {
      await Promise.resolve();
      seen.push(i);
    });
    expect(seen).toEqual([0, 1, 2]);
    expect(result).toBe(3);
  });

  it("rbBinop compares through the receiver's <=>", () => {
    const at = (n: number) => ({ compare: (o: { n: number }) => Math.sign(n - o.n), n });
    expect(shim.rbBinop(at(2), ">", at(1))).toBe(true);
    expect(shim.rbBinop(at(1), ">=", at(2))).toBe(false);
    expect(shim.rbBinop(1, "<", 2)).toBe(true);
  });

  it("rbBinop takes Array difference by element", () => {
    expect(shim.rbBinop([1, 2, 3], "-", [2])).toEqual([1, 3]);
  });

  it("rbDelete removes an Array element or a Hash key, answering the removed value", () => {
    const ary = [1, 2, 1];
    expect(shim.rbDelete(ary, 1)).toBe(1);
    expect(ary).toEqual([2]);
    const hash: Record<string, number> = { a: 1 };
    expect(shim.rbDelete(hash, "a")).toBe(1);
    expect(hash).toEqual({});
  });

  it("rbSingletonPublicMethods lists a class_attribute written on the class by its Ruby reader name", () => {
    class Job {}
    Object.defineProperty(Job, "__class_attr__queueAdapter", { value: 1, enumerable: false });
    expect(shim.rbSingletonPublicMethods(Job)).toEqual(["_queue_adapter"]);
  });

  it("rbMakeException builds the class with the arguments raise was given", () => {
    class Boom extends Error {
      constructor(
        readonly code: number,
        message = "",
      ) {
        super(message);
      }
    }
    const e = shim.rbMakeException(Boom, 7) as Boom;
    expect(e).toBeInstanceOf(Boom);
    expect(e.code).toBe(7);
  });

  it("rbRaise raises the class it is given, with the message", async () => {
    const { ArgumentError, RuntimeError } = await import("@blazetrails/ruby-compat");
    expect(() => shim.rbRaise(ArgumentError, "bad")).toThrow(ArgumentError);
    expect(() => shim.rbRaise(ArgumentError, "bad")).toThrow("bad");
    expect(() => shim.rbRaise("plain")).toThrow(RuntimeError);
    expect(() => shim.rbRaise()).toThrow("unhandled exception");
  });

  it("rbAsyncEnum inject leaves the receiver's elements in place", async () => {
    const xs = [1, 2, 3];
    expect(await shim.rbAsyncEnum(xs, "inject", async (a: number, b: number) => a + b)).toBe(6);
    expect(xs).toEqual([1, 2, 3]);
  });

  it("rbAsyncEnum sum adds Strings and Arrays with their +", async () => {
    expect(await shim.rbAsyncEnum(["a", "b"], "sum", "", async (x: string) => x)).toBe("ab");
    expect(await shim.rbAsyncEnum([[1], [2]], "sum", [], async (x: number[]) => x)).toEqual([1, 2]);
  });

  it("rbAsyncEnum sum raises TypeError where Integer#+ would", async () => {
    const { TypeError: RbTypeError } = await import("@blazetrails/ruby-compat");
    await expect(shim.rbAsyncEnum(["a"], "sum", async (x: string) => x)).rejects.toThrow(
      RbTypeError,
    );
  });

  it("rbAsyncEnum each yields a Hash pair as one value", async () => {
    const seen: unknown[] = [];
    await shim.rbAsyncEnum({ a: 1 }, "each", async (...args: unknown[]) => {
      seen.push(args);
    });
    expect(seen).toEqual([[["a", 1]]]);
  });

  it("rbAryEnsure splats an Array, wraps any other value, and yields nothing for nil", () => {
    expect(shim.rbAryEnsure([1, 2])).toEqual([1, 2]);
    expect(shim.rbAryEnsure({ a: 1 })).toEqual([{ a: 1 }]);
    expect(shim.rbAryEnsure(null)).toEqual([]);
  });

  it("an unported helper throws, naming itself", () => {
    expect(() => shim.notPorted()).toThrow(
      "codegen-runtime: notPorted is not in @blazetrails/ruby-compat",
    );
  });
});

describe("SHIM_SOURCES", () => {
  it("names the Ruby source of every implemented helper, and of nothing else", () => {
    expect(Object.keys(SHIM_SOURCES).sort()).toEqual(implementedShimNames().sort());
  });
});
