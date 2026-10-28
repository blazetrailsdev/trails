import { describe, expect, it } from "vitest";
import { Enumerator, toEnum } from "./enumerator.js";
import { eachSlice, eachWithIndex, eachWithObject } from "./enumerable.js";
import { block } from "./hash.js";
import { StopIteration } from "./stop-iteration.js";
import { FloatDomainError } from "./float-domain-error.js";
import { rbFSend } from "./object.js";

describe("Enumerator", () => {
  const source = {
    eachPair(prefix: string, block: (value: string) => void): void {
      for (const value of ["a", "b"]) block(prefix + value);
    },
  };

  it("iterates the method it was built from with its recorded arguments", () => {
    const enumerator = toEnum<string>(source, "eachPair", "x");

    expect(enumerator).toBeInstanceOf(Enumerator);
    expect([...enumerator]).toEqual(["xa", "xb"]);
  });

  it("restarts from the receiver on every iteration", () => {
    const enumerator = toEnum<string>(source, "eachPair", "y");

    expect([...enumerator]).toEqual(["ya", "yb"]);
    expect([...enumerator]).toEqual(["ya", "yb"]);
  });

  it("isAll stops at the first element the block rejects", () => {
    const enumerator = toEnum<string>(source, "eachPair", "y");
    const seen: string[] = [];

    expect(enumerator.isAll((value) => seen.push(value) && value !== "ya")).toBe(false);
    expect(seen).toEqual(["ya"]);
    expect(enumerator.isAll((value) => value.startsWith("y"))).toBe(true);
    expect(enumerator.isAll(() => 0)).toBe(true);
    expect(enumerator.isAll(() => "")).toBe(true);
    expect(enumerator.isAll(() => null)).toBe(false);
  });

  it("isAll propagates what the block raises", () => {
    const enumerator = toEnum<string>(source, "eachPair", "y");

    expect(() =>
      enumerator.isAll(() => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
  });

  it("next resumes a generator block one element at a time, then raises StopIteration", async () => {
    const ran: string[] = [];
    const enumerator = new Enumerator<number>(
      block(async (yielder: { yield(value: number): unknown }) => {
        ran.push("first");
        await yielder.yield(1);
        ran.push("second");
        await yielder.yield(2);
      }),
    );

    expect(await enumerator.next()).toBe(1);
    expect(ran).toEqual(["first"]);
    expect(await enumerator.next()).toBe(2);
    await expect(enumerator.next()).rejects.toThrow(new StopIteration("iteration reached an end"));
    await expect(enumerator.next()).rejects.toThrow(StopIteration);
    expect(ran).toEqual(["first", "second"]);
  });
});

describe("Array#each with no block (rb_ary_each's RETURN_SIZED_ENUMERATOR, vendor/ruby/v3.3.11/array.c:2532)", () => {
  it("answers an Enumerator over an Array, and an object's own each is still dispatched", () => {
    expect([...(rbFSend(["a", "b"], "each") as Iterable<unknown>)]).toEqual(["a", "b"]);
    const own = { each: (block?: unknown) => `own:${typeof block}` };
    expect(rbFSend(own, "each")).toBe("own:undefined");
  });
});

describe("Enumerator over an each that answers a promise", () => {
  const asyncReceiver = {
    each(block: (i: number) => void): Promise<void> {
      return Promise.resolve().then(() => [1, 2, 3].forEach((i) => block(i)));
    },
  };

  it("toA answers a promise of the slices", async () => {
    await expect(eachSlice(asyncReceiver, 2).toA()).resolves.toEqual([[1, 2], [3]]);
  });

  it("yields the slices under for await", async () => {
    const slices: number[][] = [];
    for await (const slice of eachSlice(asyncReceiver, 2)) slices.push(slice);
    expect(slices).toEqual([[1, 2], [3]]);
  });

  it("sizes a sliced enumerator through enum_size", () => {
    expect(eachSlice([1, 2, 3], 2).size()).toBe(2);
    expect(eachSlice(asyncReceiver, 2).size()).toBeNull();
  });
});

describe("Enumerator#with_index (enumerator_with_index, vendor/ruby/v3.3.11/enumerator.c:676)", () => {
  it("packs each_with_object's two values and answers the memo", () => {
    const memo = eachWithObject(["a", "b"], {} as Record<string, number>).withIndex(
      null,
      ([key, hash]: [string, Record<string, number>], i: number) => {
        hash[key] = i;
      },
    );
    expect(memo).toEqual({ a: 0, b: 1 });
  });

  it("starts from the offset over a block-less each_with_index", () => {
    const seen: unknown[] = [];
    eachWithIndex(["x", "y"]).withIndex(5, (pair, i) => seen.push([pair, i]));
    expect(seen).toEqual([
      [["x", 0], 5],
      [["y", 1], 6],
    ]);
  });

  it("carries the receiver's size through each_with_index, each_with_object and with_index", () => {
    expect(eachWithIndex([1, 2]).size()).toBe(2);
    expect(eachWithObject([1, 2], {}).size()).toBe(2);
    expect(eachWithIndex([1, 2]).withIndex().size()).toBe(2);
  });

  it("converts the offset with rb_to_int", () => {
    const e = eachWithIndex([1]);
    expect(() => e.withIndex(NaN, () => {})).toThrow(FloatDomainError);
    expect(() => e.withIndex(Infinity, () => {})).toThrow("Infinity");
    expect(() => e.withIndex("1" as unknown as number, () => {})).toThrow(
      "no implicit conversion of String into Integer",
    );
  });

  it("keeps an Integer offset past long as a bigint", () => {
    const seen: unknown[] = [];
    eachWithIndex(["x"]).withIndex(10n ** 25n, (_pair, i) => seen.push(i));
    expect(seen).toEqual([10n ** 25n]);
  });

  it("advances an offset past the safe integer range as a bigint", () => {
    const seen: unknown[] = [];
    eachWithIndex(["x", "y"]).withIndex(2 ** 53, (_pair, i) => seen.push(i));
    expect(seen).toEqual([2n ** 53n, 2n ** 53n + 1n]);
    expect(
      eachWithIndex(["x"])
        .withIndex(10n ** 25n)
        .toA(),
    ).toEqual([[["x", 0], 10n ** 25n]]);
  });
});
