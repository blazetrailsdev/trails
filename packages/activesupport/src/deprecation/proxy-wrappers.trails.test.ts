import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Deprecation } from "../deprecation.js";
import {
  NameError,
  rbEqual,
  constGet,
  constSet,
  TopLevel,
  constDefined,
  rbModRemoveConst,
} from "@blazetrails/ruby-compat";
import {
  DeprecatedConstantProxy,
  DeprecatedInstanceVariableProxy,
  DeprecatedObjectProxy,
  DeprecationProxy,
} from "./proxy-wrappers.js";
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
    new DeprecatedInstanceVariableProxy(new Owner(), "targetRecord", "@record", {
      deprecator,
    }) as unknown as Record;

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
    const proxy = new DeprecatedObjectProxy("foo", ":bomb:", deprecator);
    expect(await assertDeprecated(/:bomb:/, deprecator, () => rbEqual(proxy, "foo"))).toBe(true);
    expect(await assertDeprecated(/:bomb:/, deprecator, () => rbEqual(proxy, "bar"))).toBe(false);
  });

  it("sends == to an Integer target of DeprecatedInstanceVariableProxy", async () => {
    const owner = { count: 1 };
    const proxy = new DeprecatedInstanceVariableProxy(owner, "count", "@count", { deprecator });
    expect(await assertDeprecated("@count.==", deprecator, () => rbEqual(proxy, 1))).toBe(true);
  });

  it("is not reached from String#== on the target side, as rb_str_equal's to_str probe misses", () => {
    const proxy = new DeprecatedObjectProxy("foo", ":bomb:", deprecator);
    expect(rbEqual("foo", proxy)).toBe(false);
  });
});

describe("DeprecatedConstantProxy#const_missing", () => {
  const deprecator = new Deprecation();

  class Base {
    static INHERITED = "from the ancestor";
  }
  class Target extends Base {
    static CHILD = "only a static member";
  }
  Object.defineProperty(Target, "name", { value: "Undeprecated::Target" });

  beforeAll(() => {
    constSet(TopLevel, "Undeprecated", {});
    constSet(constGet(Object, "Undeprecated") as object, "Target", Target);
  });
  afterAll(() => {
    if (constDefined(Object, "Undeprecated::Target", false))
      rbModRemoveConst(constGet(Object, "Undeprecated") as object, "Target");
  });

  it("resolves a child constant against the target itself, as target.const_get does", async () => {
    const proxy = new DeprecatedConstantProxy(
      "Old",
      "Undeprecated::Target",
      deprecator,
    ) as unknown as {
      CHILD: unknown;
      INHERITED: unknown;
      MISSING: unknown;
    };
    await assertDeprecated("Old", deprecator, () => {
      expect(proxy.CHILD).toBe("only a static member");
    });
    await assertDeprecated("Old", deprecator, () => {
      expect(proxy.INHERITED).toBe("from the ancestor");
    });
    await assertDeprecated("Old", deprecator, () => {
      expect(() => proxy.MISSING).toThrow(NameError);
      expect(() => proxy.MISSING).toThrow("uninitialized constant Undeprecated::Target::MISSING");
    });
  });
});

describe("prototype-chain method_missing", () => {
  it("a subclass with a #private field still answers the dynamic names", () => {
    class Sub extends DeprecatedObjectProxy {
      #secret = 1;
      secret(): number {
        return this.#secret;
      }
    }
    const deprecator = new Deprecation("1.0", "Test");
    deprecator.behavior = "silence";
    const sub = new Sub([1, 2, 3], "deprecated", deprecator) as Sub & { length: number };
    expect(sub.secret()).toBe(1);
    expect((sub as unknown as { includes(x: number): boolean }).includes(2)).toBe(true);
    expect(sub instanceof DeprecationProxy).toBe(true);
    expect(Object.getPrototypeOf(sub)).toBe(Sub.prototype);
  });
});
