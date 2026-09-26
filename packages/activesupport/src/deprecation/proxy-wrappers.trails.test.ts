import { describe, expect, it } from "vitest";
import { Deprecation } from "../deprecation.js";
import { rbEqual } from "@blazetrails/ruby-compat";
import { DeprecatedInstanceVariableProxy, DeprecatedObjectProxy } from "./proxy-wrappers.js";
import { assertDeprecated } from "../testing/deprecation.js";

class Record {
  isPersisted(): boolean {
    return true;
  }
  saveBang(): boolean {
    return true;
  }
  plus(other: number): number {
    return other + 1;
  }
}

class Owner {
  private _record = new Record();
  targetRecord(): Record {
    return this._record;
  }
}

describe("DeprecatedInstanceVariableProxy#warn", () => {
  const deprecator = new Deprecation();
  const proxy = (): Record =>
    DeprecatedInstanceVariableProxy.new(new Owner(), "targetRecord", "@record", {
      deprecator,
    }) as Record;

  it("renders a predicate as its Ruby name", async () => {
    const result = await assertDeprecated(
      "Call target_record.persisted? instead of @record.persisted?. Args: []",
      deprecator,
      () => proxy().isPersisted(),
    );
    expect(result).toBe(true);
  });

  it("renders a bang method as its Ruby name", async () => {
    await assertDeprecated(
      "Call target_record.save! instead of @record.save!. Args: []",
      deprecator,
      () => proxy().saveBang(),
    );
  });

  it("renders an operator as its Ruby name", async () => {
    const result = await assertDeprecated(
      "Call target_record.+ instead of @record.+. Args: [1]",
      deprecator,
      () => proxy().plus(1),
    );
    expect(result).toBe(2);
  });
});

describe("DeprecationProxy#method_missing ==", () => {
  const deprecator = new Deprecation();

  it("sends == to a String target of DeprecatedObjectProxy", async () => {
    const proxy = DeprecatedObjectProxy.new("foo", ":bomb:", deprecator);
    expect(await assertDeprecated(/:bomb:/, deprecator, () => rbEqual(proxy, "foo"))).toBe(true);
    expect(await assertDeprecated(/:bomb:/, deprecator, () => rbEqual(proxy, "bar"))).toBe(false);
  });

  it("sends == to an Integer target of DeprecatedInstanceVariableProxy", async () => {
    const owner = { count: 1 };
    const proxy = DeprecatedInstanceVariableProxy.new(owner, "count", "@count", { deprecator });
    expect(await assertDeprecated("@count.==", deprecator, () => rbEqual(proxy, 1))).toBe(true);
  });

  it("is not reached from String#== on the target side, as rb_str_equal's to_str probe misses", () => {
    const proxy = DeprecatedObjectProxy.new("foo", ":bomb:", deprecator);
    expect(rbEqual("foo", proxy)).toBe(false);
  });
});
