import { describe, it, expect } from "vitest";
import { Model } from "./index.js";
import { withIndifferentAccess } from "@blazetrails/activesupport";

describe("AccessTest", () => {
  class SliceModel extends Model {
    static {
      this.attribute("name", "string");
      this.attribute("age", "integer");
      this.attribute("email", "string");
    }
  }

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
