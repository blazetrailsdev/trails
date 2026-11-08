import { describe, it, expect } from "vitest";
import { ParameterFilter, type Filter } from "./parameter-filter.js";
import { HashWithIndifferentAccess } from "./hash-with-indifferent-access.js";
import { withIndifferentAccess } from "./core-ext/hash/indifferent-access.js";

function swapcase(str: string): string {
  return str.replace(/\p{L}/gu, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()));
}

type Params = Record<string, unknown>;

describe("ParameterFilterTest", () => {
  it("process parameter filter", () => {
    const testHashes: [Params, Params, Filter[]][] = [
      [{ foo: "bar" }, { foo: "bar" }, ["food"]],
      [{ foo: "bar" }, { foo: "[FILTERED]" }, ["foo"]],
      [{ foo: "bar", bar: "foo" }, { foo: "[FILTERED]", bar: "foo" }, ["foo", "baz"]],
      [{ foo: "bar", baz: "foo" }, { foo: "[FILTERED]", baz: "[FILTERED]" }, ["foo", "baz"]],
      [{ bar: { foo: "bar", bar: "foo" } }, { bar: { foo: "[FILTERED]", bar: "foo" } }, ["fo"]],
      [{ foo: { foo: "bar", bar: "foo" } }, { foo: "[FILTERED]" }, ["f", "banana"]],
      [
        { deep: { cc: { code: "bar", bar: "foo" }, ss: { code: "bar" } } },
        { deep: { cc: { code: "[FILTERED]", bar: "foo" }, ss: { code: "bar" } } },
        ["deep.cc.code"],
      ],
      [{ baz: [{ foo: "baz" }, "1"] }, { baz: [{ foo: "[FILTERED]" }, "1"] }, [/foo/]],
    ];

    for (const [beforeFilter, afterFilter, filterWords] of testHashes) {
      let parameterFilter = new ParameterFilter(filterWords);
      expect(parameterFilter.filter(beforeFilter)).toEqual(afterFilter);

      filterWords.push("blah");
      filterWords.push((key, value) => {
        if (/bargain/.test(key)) return [...String(value)].reverse().join("");
      });
      filterWords.push((key, value, originalParams) => {
        if ((originalParams!["barg"] as Params)["blah"] === "bar" && key === "hello") {
          return "world!";
        }
      });

      filterWords.push((key, value) => {
        if (key === "array_elements") return String(value).toUpperCase();
      });

      parameterFilter = new ParameterFilter(filterWords);
      beforeFilter["barg"] = {
        bargain: "gain",
        blah: "bar",
        bar: { bargain: { blah: "foo", hello: "world" } },
      };
      afterFilter["barg"] = {
        bargain: "niag",
        blah: "[FILTERED]",
        bar: { bargain: { blah: "[FILTERED]", hello: "world!" } },
      };

      beforeFilter["array_elements"] = ["element1", "element2"];
      afterFilter["array_elements"] = ["ELEMENT1", "ELEMENT2"];

      expect(parameterFilter.filter(beforeFilter)).toEqual(afterFilter);
    }
  });

  it("filter should return mask option when value is filtered", () => {
    const mask = Object.freeze({});
    const testHashes: [Params, Params, Filter[]][] = [
      [{ foo: "bar" }, { foo: "bar" }, ["food"]],
      [{ foo: "bar" }, { foo: mask }, ["foo"]],
      [{ foo: "bar", bar: "foo" }, { foo: mask, bar: "foo" }, ["foo", "baz"]],
      [{ foo: "bar", baz: "foo" }, { foo: mask, baz: mask }, ["foo", "baz"]],
      [{ bar: { foo: "bar", bar: "foo" } }, { bar: { foo: mask, bar: "foo" } }, ["fo"]],
      [{ foo: { foo: "bar", bar: "foo" } }, { foo: mask }, ["f", "banana"]],
      [
        { deep: { cc: { code: "bar", bar: "foo" }, ss: { code: "bar" } } },
        { deep: { cc: { code: mask, bar: "foo" }, ss: { code: "bar" } } },
        ["deep.cc.code"],
      ],
      [{ baz: [{ foo: "baz" }, "1"] }, { baz: [{ foo: mask }, "1"] }, [/foo/]],
    ];

    for (const [beforeFilter, afterFilter, filterWords] of testHashes) {
      let parameterFilter = new ParameterFilter(filterWords, { mask });
      expect(parameterFilter.filter(beforeFilter)).toEqual(afterFilter);

      filterWords.push("blah");
      filterWords.push((key, value) => {
        if (/bargain/.test(key)) return [...String(value)].reverse().join("");
      });
      filterWords.push((key, value, originalParams) => {
        if ((originalParams!["barg"] as Params)["blah"] === "bar" && key === "hello") {
          return "world!";
        }
      });

      parameterFilter = new ParameterFilter(filterWords, { mask });
      beforeFilter["barg"] = {
        bargain: "gain",
        blah: "bar",
        bar: { bargain: { blah: "foo", hello: "world" } },
      };
      afterFilter["barg"] = {
        bargain: "niag",
        blah: mask,
        bar: { bargain: { blah: mask, hello: "world!" } },
      };

      expect(parameterFilter.filter(beforeFilter)).toEqual(afterFilter);
    }
  });

  it("filter_param", () => {
    const parameterFilter = new ParameterFilter(["foo", /bar/]);
    expect(parameterFilter.filterParam("food", "secret value")).toBe("[FILTERED]");
    expect(parameterFilter.filterParam("baz.foo", "secret value")).toBe("[FILTERED]");
    expect(parameterFilter.filterParam("barbar", "secret value")).toBe("[FILTERED]");
    expect(parameterFilter.filterParam("baz", "non secret value")).toBe("non secret value");
  });

  it("filter_param can work with empty filters", () => {
    const parameterFilter = new ParameterFilter();
    expect(parameterFilter.filterParam("foo", "bar")).toBe("bar");
  });

  it("parameter filter should maintain hash with indifferent access", () => {
    const testHashes: [HashWithIndifferentAccess<unknown>, Filter[]][] = [
      [withIndifferentAccess({ foo: "bar" }), ["blah"]],
      [withIndifferentAccess({ foo: "bar" }), []],
    ];

    for (const [beforeFilter, filterWords] of testHashes) {
      const parameterFilter = new ParameterFilter(filterWords);
      expect(parameterFilter.filter(beforeFilter as unknown as Params)).toBeInstanceOf(
        HashWithIndifferentAccess,
      );
    }
  });

  it("filter_param should return mask option when value is filtered", () => {
    const mask = Object.freeze({});
    const parameterFilter = new ParameterFilter(["foo", /bar/], { mask });
    expect(parameterFilter.filterParam("food", "secret value")).toEqual(mask);
    expect(parameterFilter.filterParam("baz.foo", "secret value")).toEqual(mask);
    expect(parameterFilter.filterParam("barbar", "secret value")).toEqual(mask);
    expect(parameterFilter.filterParam("baz", "non secret value")).toEqual("non secret value");
  });

  it("process parameter filter with hash having integer keys", () => {
    const testHashes: [Params, Params, Filter[]][] = [
      [{ 13: "bar" }, { 13: "[FILTERED]" }, ["13"]],
      [{ 20: "bar" }, { 20: "bar" }, ["13"]],
    ];

    for (const [beforeFilter, afterFilter, filterWords] of testHashes) {
      const parameterFilter = new ParameterFilter(filterWords);
      expect(parameterFilter.filter(beforeFilter)).toEqual(afterFilter);
    }
  });

  it("precompile_filters", () => {
    const patterns: (RegExp | string)[] = [/A.a/, /b.B/i, "ccC", "ddD"];
    const keys = ["Aaa", "Bbb", "Ccc", "Ddd"];
    const deepPatterns: (RegExp | string)[] = [/A\.a/, /b\.B/i, "c.C", "d.D"];
    const deepKeys = ["A.a", "B.b", "C.c", "D.d"];
    const procs = [() => {}, () => {}];

    const precompiled = ParameterFilter.precompileFilters([...patterns, ...deepPatterns, ...procs]);

    expect(precompiled.filter((filter) => filter instanceof RegExp).length).toBe(2);
    expect(precompiled.length).toBe(2 + procs.length);

    const regexp = precompiled.find(
      (filter) =>
        filter instanceof RegExp && filter.source.includes((patterns[0] as RegExp).source),
    ) as RegExp;
    for (const key of keys) expect(key).toMatch(regexp);
    expect(swapcase(keys[0])).not.toMatch(regexp);

    const deepRegexp = precompiled.find(
      (filter) =>
        filter instanceof RegExp && filter.source.includes((deepPatterns[0] as RegExp).source),
    ) as RegExp;
    for (const deepKey of deepKeys) expect(deepKey).toMatch(deepRegexp);
    expect(swapcase(deepKeys[0])).not.toMatch(deepRegexp);

    expect(regexp).not.toEqual(deepRegexp);
    expect(precompiled.filter((filter) => procs.includes(filter as () => void))).toEqual(procs);
  });
});
