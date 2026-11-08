import { describe, it, expect } from "vitest";
import { Attribute, Attributes, Table } from "./index.js";
import { uniq } from "./test-helpers/uniq.js";

const attribute = (relation: string, name: string): Attribute =>
  new Attributes.Attribute(
    relation as unknown as ConstructorParameters<typeof Attributes.Attribute>[0],
    name,
  );

describe("Attributes", () => {
  it("responds to lower", () => {
    const relation = new Table("users");
    const attribute = relation.get("foo");
    const node = attribute.lower();
    expect(node.name).toBe("LOWER");
    expect(node.expressions).toEqual([attribute]);
  });

  describe("equality", () => {
    it("is equal with equal ivars", () => {
      const array = [attribute("foo", "bar"), attribute("foo", "bar")];
      expect(uniq(array).length).toBe(1);
    });

    it("is not equal with different ivars", () => {
      const array = [attribute("foo", "bar"), attribute("foo", "baz")];
      expect(uniq(array).length).toBe(2);
    });
  });
});
