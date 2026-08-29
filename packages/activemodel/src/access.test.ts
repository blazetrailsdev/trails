/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body, the way the Rails
   test model it mirrors does (attributes_test.rb:6-8); the empty class/interface merge beside it is
   how `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import { Model } from "./index.js";
import { withIndifferentAccess, include } from "@blazetrails/activesupport";
import { Attributes, type AttributesClassHalf } from "./attributes.js";

describe("AccessTest", () => {
  class SliceModel extends Model {
    declare age: number;
    declare name: string;
    declare static attribute: AttributesClassHalf["attribute"];

    static {
      include(this, Attributes);
      this.attribute("name", "string");
      this.attribute("age", "integer");
      this.attribute("email", "string");
    }
  }
  interface SliceModel extends Attributes {}

  it("slice", () => {
    const m = new SliceModel({ name: "Alice", age: 30, email: "a@b.com" });
    const expected = withIndifferentAccess({ name: m.name, age: m.age });
    const actual = m.slice("name", "age");

    expect([...actual.keys()]).toEqual([...expected.keys()]);

    expected.forEach((value, key) => {
      expect(actual.get(key)).toEqual(value);
    });
  });

  it("slice with array", () => {
    const m = new SliceModel({ name: "Alice", age: 30, email: "a@b.com" });
    const expected = withIndifferentAccess({ name: m.name, age: m.age });
    const actual = m.slice(["name", "age"]);

    expect([...actual.entries()]).toEqual([...expected.entries()]);
  });

  it("values_at", () => {
    const m = new SliceModel({ name: "Alice", age: 30, email: "a@b.com" });
    expect(m.valuesAt("name", "age")).toEqual(["Alice", 30]);
  });

  it("values_at with array", () => {
    const m = new SliceModel({ name: "Alice", age: 30, email: "a@b.com" });
    expect(m.valuesAt(["name", "age"])).toEqual(["Alice", 30]);
  });
});
