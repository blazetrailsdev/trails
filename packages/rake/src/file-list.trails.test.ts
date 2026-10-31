import { describe, expect, it } from "vitest";
import {
  ArgumentError,
  Enumerator,
  File,
  IndexError,
  Range,
  RuntimeError,
  block,
  flatten,
  rbFArray,
  tally,
} from "@blazetrails/ruby-compat";
import { FileList } from "./file-list.js";
import { useRakeTestCase } from "./test-helpers/file-creation.js";

const fl = () => new FileList().import(["a.c", "b.h", "c.c", "d.h"]);
const later = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 0));

describe("FileList delegation", () => {
  it("delegates every Array instance method name", () => {
    const names =
      `all? any? assoc at bsearch bsearch_index chain chunk chunk_while clear collect collect! collect_concat combination compact compact! concat count cycle deconstruct delete
delete_at delete_if detect difference dig drop drop_while each each_cons each_entry each_index each_slice each_with_index each_with_object empty? entries fetch fill
filter filter! filter_map find find_all find_index first flat_map flatten flatten! grep grep_v group_by include? index inject insert intersect? intersection join keep_if
last lazy length map map! max max_by member? min min_by minmax minmax_by none? one? pack permutation pop prepend product push rassoc reduce reject reject!
repeated_combination repeated_permutation replace reverse reverse! reverse_each rindex rotate rotate! sample select select! shift shuffle shuffle! size slice slice!
slice_after slice_before slice_when sort sort! sort_by sort_by! sum take take_while tally to_h to_set transpose union uniq uniq! unshift values_at zip`.split(
        /\s+/,
      );
    for (const name of names) {
      const base = name.replace(/[?!]$/, "").replace(/_(\w)/g, (_m, c) => c.toUpperCase());
      const cap = base[0].toUpperCase() + base.slice(1);
      const ts = name.endsWith("?") ? `is${cap}` : name.endsWith("!") ? `${base}Bang` : base;
      expect(FileList.DELEGATING_METHODS, name).toContain(ts);
    }
  });

  it("answers the methods the closed table missed", async () => {
    expect(await ((await fl().eachSlice(3)) as unknown as Enumerator).toA()).toEqual([
      ["a.c", "b.h", "c.c"],
      ["d.h"],
    ]);
    expect(await fl().eachWithObject([] as string[], (f, m) => m.push(f))).toHaveLength(4);
    expect(await fl().flatMap((f) => [f, f])).toHaveLength(8);
    expect(await fl().sum("", async (f: string) => later(f[0]))).toEqual("abcd");
    expect(await new FileList().import(["a", "a"]).tally()).toEqual(tally(["a", "a"]));
    expect(await fl().takeWhile((f) => later(f < "c"))).toEqual(["a.c", "b.h"]);
    expect(await fl().pop(2)).toEqual(["c.c", "d.h"]);
    expect(await fl().get(1, 2)).toEqual(["b.h", "c.c"]);
    expect(await fl().get(new Range(1, 2))).toEqual(["b.h", "c.c"]);
    expect(await fl().count((f: string) => later(f.endsWith(".c")))).toEqual(2);
    expect(await fl().isAny((f: string) => later(f === "c.c"))).toBe(true);
    expect(await fl().isAny(/\.z$/)).toBe(false);
    expect(await fl().min((a: string, b: string) => b.localeCompare(a))).toEqual("d.h");
    expect(await fl().max((a: string, b: string) => b.localeCompare(a))).toEqual("a.c");
    expect(await fl().max(2)).toEqual(["d.h", "c.c"]);
    expect(await (await fl().grep(/\.c$/, (f) => f.toUpperCase())).toA()).toEqual(["A.C", "C.C"]);
    expect(await fl().inject((a: string, b: string) => a + b)).toEqual("a.cb.hc.cd.h");
  });

  it("returns self from an in-place method and mutates the list", async () => {
    const f = fl();
    expect(await f.keepIf((x) => later(x.endsWith(".c")))).toBe(f);
    expect(await f.toA()).toEqual(["a.c", "c.c"]);
    expect(await f.reverseBang()).toBe(f);
    expect(await f.sliceBang(0, 1)).toEqual(["c.c"]);
    expect(await f.toA()).toEqual(["a.c"]);
  });

  it("answers the combinatoric and grouping arms", async () => {
    const f = new FileList().import(["a", "b", "c"]);
    expect(await ((await f.combination(3)) as unknown as Enumerator).toA()).toEqual([
      ["a", "b", "c"],
    ]);
    expect(await ((await f.permutation(2)) as Enumerator).toA()).toHaveLength(6);
    expect(await ((await f.repeatedCombination(2)) as unknown as Enumerator).toA()).toHaveLength(6);
    expect(await ((await f.repeatedPermutation(2)) as unknown as Enumerator).toA()).toHaveLength(9);
    expect(await f.sliceWhen((a, b) => b === "c")).toEqual([["a", "b"], ["c"]]);
    expect(await f.chunkWhile((a, b) => b !== "c")).toEqual([["a", "b"], ["c"]]);
    expect(await f.chunk((x) => x === "c")).toEqual([
      [false, ["a", "b"]],
      [true, ["c"]],
    ]);
    expect(await f.bsearch((x) => x >= "b")).toEqual("b");
  });
  it("answers the hand-written element arms", async () => {
    const f = fl();
    await f.set(0, 2, "x");
    expect(await f.toA()).toEqual(["x", "c.c", "d.h"]);
    await f.set(new Range(0, 1), ["y"]);
    expect(await f.toA()).toEqual(["y", "d.h"]);
    await f.set(3, "z");
    expect(await f.toA()).toEqual(["y", "d.h", null, "z"]);
    expect(await fl().fetch(9, "none")).toEqual("none");
    await expect(fl().fetch(9)).rejects.toBeInstanceOf(IndexError);
    expect(await (await fl().insert(-2, "m")).toA()).toEqual(["a.c", "b.h", "c.c", "m", "d.h"]);
    await expect(fl().insert(-7, "m")).rejects.toBeInstanceOf(IndexError);
    expect(await (await fl().fill("q", 3)).toA()).toEqual(["a.c", "b.h", "c.c", "q"]);
    expect(await fl().zip(["1"])).toHaveLength(4);
    expect((await fl().zip(new FileList().import(["1", "2", "3", "4"])))[3]).toEqual(["d.h", "4"]);
    expect(await fl().rotate()).toEqual(["b.h", "c.c", "d.h", "a.c"]);
    expect(await fl().rindex("b.h")).toEqual(1);
    expect(await fl().deleteAt(0)).toEqual("a.c");
    expect(await fl().delete("zz")).toBeNull();
    expect(await new FileList().import([["a"], ["c"]]).transpose()).toEqual([["a", "c"]]);
    expect(await new FileList().import([["a", 1]]).toH()).toEqual({ a: 1 });
    expect(await new FileList().import([[["a"]]]).dig(0, 0, 0)).toEqual("a");
    const seen: string[] = [];
    await new FileList().import(["a"]).cycle(2, (x: string) => seen.push(x));
    expect(seen).toEqual(["a", "a"]);
  });

  it("answers nil from an unchanged bang method", async () => {
    expect(await fl().flattenBang()).toBeNull();
    expect(await fl().uniqBang()).toBeNull();
    expect(await fl().compactBang()).toBeNull();
  });

  it("raises on a negative count", async () => {
    for (const m of [fl().last(-1), fl().pop(-1), fl().shift(-1)]) {
      await expect(m).rejects.toBeInstanceOf(ArgumentError);
    }
  });

  it("compares through Array#<=>, finds without a block, and appends several", async () => {
    expect(await new FileList().import([1, [2]]).compare([1, [3]])).toEqual(-1);
    expect(await fl().compare("x")).toBeNull();
    expect(await fl().find()).toBeInstanceOf(Enumerator);
    expect(await (await new FileList().append("a", "b")).toA()).toEqual(["a", "b"]);
  });
});

describe("FileList#egrep", () => {
  useRakeTestCase();

  it("a String pattern is String#match's receiver, each line the Regexp", async () => {
    await File.writeAsync("egrep.txt", "no\nX.Z");
    const found: unknown[] = [];
    const matched = await FileList.get("egrep.txt").egrep(
      "XYZZY",
      block((fn: string, ln: number, line: string) => void found.push([fn, ln, line])),
    );
    expect(matched).toEqual(1);
    expect(found).toEqual([["egrep.txt", 2, "X.Z"]]);
  });

  it("hands its options to File.open", async () => {
    await File.writeAsync("egrep.txt", "XYZZY\n");
    let line: unknown = null;
    await FileList.get("egrep.txt").egrep(
      /XYZZY/,
      { externalEncoding: "ASCII-8BIT" },
      block((_fn: string, _ln: number, l: unknown) => void (line = l)),
    );
    expect(line).toBeInstanceOf(Uint8Array);
  });
});

describe("FileList#toAry", () => {
  it("raises on a pending list", () => {
    const pending = FileList.get("x");
    expect(() => pending.toAry()).toThrow(RuntimeError);
    expect(() => new FileList().include(pending)).toThrow(RuntimeError);
  });

  it("converts implicitly once resolved", async () => {
    const resolved = await FileList.get("x").resolve();
    expect(flatten(["a", resolved])).toEqual(["a", "x"]);
    expect(rbFArray(resolved)).toEqual(["x"]);
    expect(await new FileList().include(resolved).toA()).toEqual(["x"]);
  });
});

describe("FileList enumerators", () => {
  it("lazy, chain and blockless iterators answer an Enumerator", async () => {
    const fl = FileList.get("a.c", "b.c");

    expect(await fl.lazy()).toBeInstanceOf(Enumerator.Lazy);
    expect(await ((await fl.chain(["x"])) as Enumerator).toA()).toEqual(["a.c", "b.c", "x"]);
    for (const iterator of [
      fl.each(),
      fl.map(undefined as never),
      fl.eachSlice(1),
      fl.cycle(),
      fl.takeWhile(undefined as never),
      fl.minBy(),
      fl.deleteIf(undefined as never),
      fl.groupBy(undefined as never),
    ]) {
      expect(await iterator).toBeInstanceOf(Enumerator);
    }
    const each = (await fl.map(undefined as never)) as unknown as Enumerator;
    expect(each.size()).toBe(2);
    expect(await each.each((fn: never) => `${fn}!`)).toEqual(["a.c!", "b.c!"]);
  });
});
