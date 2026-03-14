import { describe, it, expect } from "vitest";
import { Table, Nodes } from "./index.js";

describe("Attributes", () => {
  const users = new Table("users");
  it("responds to lower", () => {
    const name = users.get("name");
    const fn = name.lower();
    expect(fn).toBeInstanceOf(Nodes.NamedFunction);
    expect(fn.name).toBe("LOWER");
  });

  describe("equality", () => {
    it("is equal with equal ivars", () => {
      const c1 = new Nodes.NamedFunction("COUNT", [users.get("id")]);
      const c2 = new Nodes.NamedFunction("COUNT", [users.get("id")]);
      expect(c1.name).toBe(c2.name);
    });

    it("is not equal with different ivars", () => {
      const a = new Nodes.NamedFunction("COUNT", [users.get("id")]);
      const b = new Nodes.NamedFunction("COUNT", [users.get("name")]);
      expect(a).not.toEqual(b);
    });
  });
});
