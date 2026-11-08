/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Wrapper spells `include ActiveSupport::DeepMergeable` in its body (deep_mergeable_test.rb:6-8); the
   empty class/interface merge carries the mixed-in methods onto its type. */
import { describe, expect, it, beforeEach } from "vitest";
import { include } from "@blazetrails/ruby-compat";
import { DeepMergeable, type DeepMergeableHost } from "./deep-mergeable.js";

type MergeBlock = (key: unknown, thisVal: unknown, otherVal: unknown) => unknown;

function newWrapper() {
  class Wrapper {
    constructor(public underlying: Map<unknown, unknown>) {}

    static of<T extends typeof Wrapper>(this: T, value: unknown): unknown {
      if (value instanceof Map) {
        return new this(new Map([...value].map(([k, v]) => [k, this.of(v)])));
      } else {
        return value;
      }
    }

    get(key: unknown): unknown {
      return this.underlying.get(key);
    }

    mergeBang(other: Wrapper, block?: MergeBlock): this {
      const merged = new Map(this.underlying);
      for (const [key, otherVal] of other.underlying) {
        merged.set(
          key,
          block && merged.has(key) ? block(key, merged.get(key), otherVal) : otherVal,
        );
      }
      this.underlying = merged;
      return this;
    }
  }
  interface Wrapper extends DeepMergeableHost {}
  include(Wrapper, DeepMergeable);
  return Wrapper;
}

const Wrapper = newWrapper();
const SubWrapper = class extends Wrapper {};
const OtherWrapper = newWrapper();
const OmniWrapper = class extends Wrapper {
  override isDeepMerge(other: unknown): boolean {
    return super.isDeepMerge(other) || other instanceof OtherWrapper;
  }
};

const h = (o: Record<string, unknown>): Map<unknown, unknown> =>
  new Map(
    Object.entries(o).map(([k, v]) => [
      k,
      typeof v === "object" ? h(v as Record<string, unknown>) : v,
    ]),
  );

type W = InstanceType<typeof Wrapper>;

describe("DeepMergeableTest", () => {
  let hash1: Map<unknown, unknown>;
  let hash2: Map<unknown, unknown>;
  let merged: Map<unknown, unknown>;
  let summed: Map<unknown, unknown>;
  let nestedValueKey: string;
  let sumValues: MergeBlock;

  beforeEach(() => {
    hash1 = h({ a: 1, b: 1, c: { d1: 1, d2: 1, d3: { e1: 1, e3: 1 } } });
    hash2 = h({ a: 2, c: { d2: 2, d3: { e2: 2, e3: 2 } } });
    merged = h({ a: 2, b: 1, c: { d1: 1, d2: 2, d3: { e1: 1, e2: 2, e3: 2 } } });
    summed = h({ a: 3, b: 1, c: { d1: 1, d2: 3, d3: { e1: 1, e2: 2, e3: 3 } } });
    nestedValueKey = "c";
    sumValues = (_key, value1, value2) => (value1 as number) + (value2 as number);
  });

  it("deep_merge works", () => {
    expect((Wrapper.of(hash1) as W).deepMerge(Wrapper.of(hash2))).toEqual(Wrapper.of(merged));
  });

  it("deep_merge! works", () => {
    expect((Wrapper.of(hash1) as W).deepMergeBang(Wrapper.of(hash2))).toEqual(Wrapper.of(merged));
  });

  it("deep_merge supports a merge block", () => {
    expect((Wrapper.of(hash1) as W).deepMerge(Wrapper.of(hash2), sumValues)).toEqual(
      Wrapper.of(summed),
    );
  });

  it("deep_merge! supports a merge block", () => {
    expect((Wrapper.of(hash1) as W).deepMergeBang(Wrapper.of(hash2), sumValues)).toEqual(
      Wrapper.of(summed),
    );
  });

  it("deep_merge does not mutate the instance", () => {
    const instance = Wrapper.of(new Map(hash1)) as W;
    instance.deepMerge(Wrapper.of(hash2));
    expect(instance).toEqual(Wrapper.of(hash1));
  });

  it("deep_merge! mutates the instance", () => {
    const instance = Wrapper.of(hash1) as W;
    instance.deepMergeBang(Wrapper.of(hash2));
    expect(instance).toEqual(Wrapper.of(merged));
  });

  it("deep_merge! does not mutate the underlying values", () => {
    const instance = Wrapper.of(new Map(hash1)) as W;
    const underlying = instance.underlying;
    instance.deepMergeBang(Wrapper.of(hash2));
    expect(underlying).toEqual((Wrapper.of(hash1) as W).underlying);
  });

  it("deep_merge deep merges subclass values by default", () => {
    const nestedValue = (Wrapper.of(hash1) as W)
      .deepMerge(SubWrapper.of(hash2))
      .get(nestedValueKey);
    expect(nestedValue).toEqual((Wrapper.of(merged) as W).get(nestedValueKey));
  });

  it("deep_merge does not deep merge non-subclass values by default", () => {
    const nestedValue = (Wrapper.of(hash1) as W)
      .deepMerge(OtherWrapper.of(hash2))
      .get(nestedValueKey);
    expect(nestedValue).toEqual((OtherWrapper.of(hash2) as W).get(nestedValueKey));
  });

  it("deep_merge? can be overridden to allow deep merging of non-subclass values", () => {
    const nestedValue = (OmniWrapper.of(hash1) as W)
      .deepMerge(OtherWrapper.of(hash2))
      .get(nestedValueKey);
    expect(nestedValue).toEqual((OmniWrapper.of(merged) as W).get(nestedValueKey));
  });
});
