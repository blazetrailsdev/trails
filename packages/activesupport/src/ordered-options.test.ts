/**
 * Mirrors: activesupport/test/ordered_options_test.rb
 *
 * Ruby's Hash reads and writes are spelled by docs/ruby-ts-conventions.md —
 * `[]` is `get`, `[]=` is `set`, `key?` is `isKey` — and the `method_missing`
 * reads and writes (`a.foo`, `a.foo = 1`) are property access through the
 * class's Proxy, typed by the `Options` alias below.
 *
 * `OrderedOptions#[]=` symbolizes its key (ordered_options.rb:37-39), which is
 * what makes the gem's `a["else_where"]` and `a[:else_where]` the same entry.
 * A Ruby Symbol is a JS string, so the two spellings are already one key here
 * and the assertions that separate them collapse onto each other; each such
 * site says so.
 */

import { describe, it, expect } from "vitest";
import { assertRespondTo } from "./testing/assertions.js";
import { KeyError } from "./core-ext/key-error.js";
import { OrderedOptions, InheritableOptions } from "./ordered-options.js";

/** The `method_missing` surface: any name reads and writes the Hash. */
type Options = { [key: string]: any };

describe("OrderedOptionsTest", () => {
  it("usage", () => {
    const a = new OrderedOptions();

    expect(a.get("notSet")).toBeUndefined();

    a.set("allowConcurrency", true);
    expect(a.size).toBe(1);
    expect(a.get("allowConcurrency")).toBeTruthy();

    a.set("allowConcurrency", false);
    expect(a.size).toBe(1);
    expect(a.get("allowConcurrency")).toBeFalsy();

    a.set("elseWhere", 56);
    expect(a.size).toBe(2);
    expect(a.get("elseWhere")).toBe(56);
  });

  it("looping", () => {
    const a = new OrderedOptions();

    a.set("allowConcurrency", true);
    a.set("elseWhere", 56);

    const test: [string, unknown][] = [
      ["allowConcurrency", true],
      ["elseWhere", 56],
    ];

    let index = 0;
    a.each((key, value) => {
      expect(key).toBe(test[index][0]);
      expect(value).toBe(test[index][1]);
      index += 1;
    });
  });

  it("string dig", () => {
    const a = new OrderedOptions();

    a.set("testKey", 56);
    expect((a as unknown as Options).testKey).toBe(56);
    expect(a.get("testKey")).toBe(56);
    expect(a.dig("testKey")).toBe(56);
    // The gem's fourth arm digs the String spelling of the third arm's Symbol.
    expect(a.dig("testKey")).toBe(56);
  });

  it("nested dig", () => {
    const a = new OrderedOptions();

    a.set("testKey", [{ a: 1 }]);
    expect(a.dig("testKey", 0, "a")).toBe(1);
    expect(a.dig("testKey", 1, "a")).toBeUndefined();
  });

  it("method access", () => {
    const a = new OrderedOptions() as unknown as Options;

    expect(a.notSet).toBeUndefined();

    a.allowConcurrency = true;
    expect(a.size).toBe(1);
    expect(a.allowConcurrency).toBeTruthy();

    a.allowConcurrency = false;
    expect(a.size).toBe(1);
    expect(a.allowConcurrency).toBeFalsy();

    a.elseWhere = 56;
    expect(a.size).toBe(2);
    expect(a.elseWhere).toBe(56);
  });

  it("inheritable options continues lookup in parent", () => {
    const parent = new OrderedOptions();
    parent.set("foo", true);

    const child = new InheritableOptions(parent) as unknown as Options;
    expect(child.foo).toBeTruthy();
  });

  it("inheritable options can override parent", () => {
    const parent = new OrderedOptions();
    parent.set("foo", ":bar");

    const child = new InheritableOptions(parent);
    child.set("foo", ":baz");

    expect((child as unknown as Options).foo).toBe(":baz");
  });

  it("inheritable options inheritable copy", () => {
    const original = new InheritableOptions();
    const copy = original.inheritableCopy();

    expect(copy instanceof (original.constructor as typeof InheritableOptions)).toBeTruthy();
    expect(copy).not.toBe(original);
  });

  it("introspection", () => {
    const a = new OrderedOptions() as unknown as Options;
    assertRespondTo(a, "blah");
    assertRespondTo(a, "blah=");
    expect((a.blah = 42)).toBe(42);
    expect(a.blah).toBe(42);
  });

  it("raises with bang", () => {
    const a = new OrderedOptions() as unknown as Options;
    a.foo = ":bar";
    assertRespondTo(a, "foo!");

    expect(() => a["foo!"]()).not.toThrow();
    expect(a["foo!"]()).toBe(a.foo);

    expect(() => {
      a.foo = null;
      a["foo!"]();
    }).toThrow(KeyError);
    expect(() => a["nonExistingKey!"]()).toThrow(KeyError);
  });

  it("inheritable options with bang", () => {
    const a = new InheritableOptions({ foo: ":bar" }) as unknown as Options;

    expect(() => a["foo!"]()).not.toThrow();
    expect(a["foo!"]()).toBe(a.foo);

    expect(() => {
      a.foo = null;
      a["foo!"]();
    }).toThrow(KeyError);
    expect(() => a["nonExistingKey!"]()).toThrow(KeyError);
  });

  it("ordered option inspect", () => {
    const a = new OrderedOptions() as unknown as Options;
    expect(a.inspect()).toBe("#<ActiveSupport::OrderedOptions {}>");

    a.foo = ":bar";
    a.set("baz", ":quz");

    // The gem interpolates the Hash literal's own rendering (`#{{ foo: :bar }}`).
    const hash = `{foo: ":bar", baz: ":quz"}`;
    expect(a.inspect()).toBe(`#<ActiveSupport::OrderedOptions ${hash}>`);
  });

  it("inheritable option inspect", () => {
    const object = new InheritableOptions({ one: "first value" });
    // As above: the gem interpolates each Hash literal's own rendering.
    const one = `{one: "first value"}`;
    expect(object.inspect()).toBe(`#<ActiveSupport::InheritableOptions ${one}>`);

    object.set("two", "second value");
    object.set("three", "third value");
    const all = `{one: "first value", two: "second value", three: "third value"}`;
    expect(object.inspect()).toBe(`#<ActiveSupport::InheritableOptions ${all}>`);
  });

  it("ordered options to h", () => {
    const object = new OrderedOptions() as unknown as Options;
    expect(object.toH()).toEqual({});
    object.one = "first value";
    object.set("two", "second value");
    object.set("three", "third value");

    expect(object.toH()).toEqual({
      one: "first value",
      two: "second value",
      three: "third value",
    });
  });

  it("inheritable options to h", () => {
    const object = new InheritableOptions({ one: "first value" });
    expect(object.toH()).toEqual({ one: "first value" });

    object.set("two", "second value");
    object.set("three", "third value");

    expect(object.toH()).toEqual({
      one: "first value",
      two: "second value",
      three: "third value",
    });
  });

  it("ordered options dup", () => {
    const object = new OrderedOptions() as unknown as Options;
    object.one = "first value";
    object.set("two", "second value");
    object.set("three", "third value");

    const duplicate = object.dup();
    expect(duplicate.toH()).toEqual(object.toH());
    expect(duplicate).not.toBe(object);
  });

  it("inheritable options dup", () => {
    const object = new InheritableOptions({ one: "first value" });
    object.set("two", "second value");
    object.set("three", "third value");

    const duplicate = object.dup();
    expect(duplicate.toH()).toEqual(object.toH());
    expect(duplicate).not.toBe(object);
  });

  it("ordered options key", () => {
    const object = new OrderedOptions() as unknown as Options;
    object.one = "first value";
    object.set("two", "second value");
    object.set("three", "third value");

    // Each pair is the gem's Symbol arm followed by its String arm, which `[]=`
    // symbolizes onto the same key here.
    expect(object.isKey("one")).toBeTruthy();
    expect(object.isKey("one")).toBeTruthy();
    expect(object.isKey("two")).toBeTruthy();
    expect(object.isKey("two")).toBeTruthy();
    expect(object.isKey("three")).toBeTruthy();
    expect(object.isKey("three")).toBeTruthy();
    expect(object.isKey("four")).toBeFalsy();
  });

  it("inheritable options key", () => {
    const object = new InheritableOptions({ one: "first value" });
    object.set("two", "second value");
    object.set("three", "third value");

    // As in "ordered options key": the gem's String arms are the same key here.
    expect(object.isKey("one")).toBeTruthy();
    expect(object.isKey("one")).toBeTruthy();
    expect(object.isKey("two")).toBeTruthy();
    expect(object.isKey("two")).toBeTruthy();
    expect(object.isKey("three")).toBeTruthy();
    expect(object.isKey("three")).toBeTruthy();
    expect(object.isKey("four")).toBeFalsy();
  });

  it("inheritable options overridden", () => {
    const object = new InheritableOptions({
      one: "first value",
      two: "second value",
      three: "third value",
    }) as unknown as Options;
    object.set("one", "first value override");
    object.set("two", "second value override");

    expect(object.isOverridden("one")).toBeTruthy();
    expect(object.one).toBe("first value override");
    expect(object.isOverridden("two")).toBeTruthy();
    expect(object.two).toBe("second value override");
    expect(object.isOverridden("three")).toBeFalsy();
    expect(object.three).toBe("third value");
  });

  it("inheritable options overridden with nil", () => {
    const object = new InheritableOptions() as unknown as Options;
    object.set("one", "first value override");
    object.set("two", "second value override");

    expect(object.isOverridden("one")).toBeFalsy();
    expect(object.one).toBe("first value override");
    expect(object.isOverridden("two")).toBeFalsy();
    expect(object.two).toBe("second value override");
  });

  it("inheritable options each", () => {
    const object = new InheritableOptions({ one: "first value", two: "second value" });
    object.set("one", "first value override");
    object.set("three", "third value");

    let count = 0;
    const keys: string[] = [];
    object.each((key) => {
      count += 1;
      keys.push(key);
    });
    expect(count).toBe(3);
    expect(keys).toEqual(["one", "two", "three"]);
  });

  it("inheritable options to a", () => {
    const object = new InheritableOptions({ one: "first value", two: "second value" });
    object.set("one", "first value override");
    object.set("three", "third value");

    expect(object.entries()).toEqual([
      ["one", "first value override"],
      ["two", "second value"],
      ["three", "third value"],
    ]);
    expect(object.toA()).toEqual([
      ["one", "first value override"],
      ["two", "second value"],
      ["three", "third value"],
    ]);
  });

  it("inheritable options count", () => {
    const object = new InheritableOptions({ one: "first value", two: "second value" });
    object.set("one", "first value override");
    object.set("three", "third value");

    expect(object.count).toBe(3);
  });

  it("ordered options to s", () => {
    const object = new OrderedOptions() as unknown as Options;
    expect(object.toString()).toBe("{}");

    object.one = "first value";
    object.set("two", "second value");
    object.set("three", "third value");

    expect(object.toString()).toBe(
      `{one: "first value", two: "second value", three: "third value"}`,
    );
  });

  it("inheritable options to s", () => {
    const object = new InheritableOptions({ one: "first value" });
    expect(object.toString()).toBe(`{one: "first value"}`);

    object.set("two", "second value");
    object.set("three", "third value");
    expect(object.toString()).toBe(
      `{one: "first value", two: "second value", three: "third value"}`,
    );
  });

  it("odrered options pp", () => {
    const object = new OrderedOptions() as unknown as Options;
    object.one = "first value";
    object.set("two", "second value");
    object.set("three", "third value");

    // No PP here; `pretty_print` (ordered_options.rb:116-118) hands PP the same
    // `to_h` this renders.
    expect(object.toString()).toBe(
      `{one: "first value", two: "second value", three: "third value"}`,
    );
  });

  it("inheritable options pp", () => {
    const object = new InheritableOptions({ one: "first value" });
    object.set("two", "second value");
    object.set("three", "third value");
    expect(object.toString()).toBe(
      `{one: "first value", two: "second value", three: "third value"}`,
    );

    // As above: no PP; `pretty_print` renders the same `to_h`.
    expect(object.toString()).toBe(
      `{one: "first value", two: "second value", three: "third value"}`,
    );
  });
});
