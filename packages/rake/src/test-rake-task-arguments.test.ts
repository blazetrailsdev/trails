import { describe, expect, it } from "vitest";
import { block, KeyError, map } from "@blazetrails/ruby-compat";
import { TaskArguments } from "./task-arguments.js";

describe("TestRakeTaskArguments", () => {
  it("empty arg list is empty", () => {
    const ta = new TaskArguments([], []);
    expect(ta.toHash()).toEqual({});
  });

  it("multiple values in args", () => {
    const ta = new TaskArguments(["a", "b", "c"], ["one", "two", "three"]);
    expect(ta.toHash()).toEqual({ a: "one", b: "two", c: "three" });
  });

  it("blank values in args", () => {
    const ta = new TaskArguments(["a", "b", "c"], ["", "two", ""]);
    expect(ta.toHash()).toEqual({ b: "two" });
  });

  it("has key", () => {
    const ta = new TaskArguments(["a"], ["one"]);
    expect(ta.hasKey("a")).toBeTruthy();
    expect(ta.isKey("a")).toBeTruthy();
    expect(ta.hasKey("b")).toBeFalsy();
    expect(ta.isKey("b")).toBeFalsy();
  });

  it("fetch", () => {
    const ta = new TaskArguments(["one"], [1]);
    expect(ta.fetch("one")).toBe(1);
    expect(
      ta.fetch(
        "two",
        block(() => 2),
      ),
    ).toBe(2);
    expect(() => ta.fetch("three")).toThrow(KeyError);
  });

  it("to s", () => {
    const ta = new TaskArguments(["a", "b", "c"], [1, 2, 3]);
    const expectation = "#<Rake::TaskArguments a: 1, b: 2, c: 3>";
    expect(ta.toString()).toBe(expectation);
    expect(ta.inspect()).toBe(expectation);
  });

  it("to hash", () => {
    const ta = new TaskArguments(["one"], [1]);
    const h = ta.toHash();
    h.one = 0;
    expect(ta.fetch("one")).toBe(1);
    expect(h.one).toBe(0);
  });

  it("enumerable behavior", () => {
    const ta = new TaskArguments(["a", "b", "c"], [1, 2, 3]);
    expect(map(ta, ([, v]: [string, unknown]) => (v as number) * 10).sort()).toEqual([10, 20, 30]);
  });

  it("named args", () => {
    const ta = new TaskArguments(["aa", "bb"], [1, 2]);
    expect(ta.aa).toBe(1);
    expect(ta.get("aa")).toBe(1);
    expect(ta.get("aa")).toBe(1);
    expect(ta.bb).toBe(2);
    expect(ta.cc).toBeNull();
  });

  it("args knows its names", () => {
    const ta = new TaskArguments(["aa", "bb"], [1, 2]);
    expect(ta.names).toEqual(["aa", "bb"]);
  });

  it("extra names are nil", () => {
    const ta = new TaskArguments(["aa", "bb", "cc"], [1, 2]);
    expect(ta.cc).toBeNull();
  });

  it("args do not reference env values", () => {
    const ta = new TaskArguments(["aa"], [1]);
    expect(ta.rev).toBeNull();
    expect(ta.ver).toBeNull();
  });

  it("creating new argument scopes", () => {
    const parent = new TaskArguments(["p"], [1]);
    const child = parent.newScope(["c", "p"]);
    expect(child.toHash()).toEqual({ p: 1 });
    expect(child.p).toBe(1);
    expect(child.get("p")).toBe(1);
    expect(child.get("p")).toBe(1);
    expect(child.c).toBeNull();
  });

  it("child hides parent arg names", () => {
    const parent = new TaskArguments(["aa"], [1]);
    const child = new TaskArguments(["aa"], [2], parent);
    expect(child.aa).toBe(2);
  });

  it("default arguments values can be merged", () => {
    const ta = new TaskArguments(["aa", "bb"], [null, "original_val"]);
    ta.withDefaults({ aa: "default_val" });
    expect(ta.get("aa")).toBe("default_val");
    expect(ta.get("bb")).toBe("original_val");
  });

  // PERMANENT-SKIP: the default is keyed by the String "cc" where the lookup is
  it.skip("default arguments that dont match names are ignored", () => {
    const ta = new TaskArguments(["aa", "bb"], [null, "original_val"]);
    ta.withDefaults({ cc: "default_val" });
    expect(ta.get("cc")).toBeNull();
  });
});
