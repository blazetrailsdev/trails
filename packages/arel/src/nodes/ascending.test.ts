import { describe, it, expect } from "vitest";
import { Table, Nodes } from "../index.js";

describe("Arel", () => {
  const users = new Table("users");

  describe("ascending", () => {
    it("construct", () => {
      const asc = new Nodes.Ascending(users.get("name"));
      expect(asc).toBeInstanceOf(Nodes.Ascending);
      expect(asc.expr).toBeInstanceOf(Nodes.Attribute);
    });

    it("reverse", () => {
      const asc = new Nodes.Ascending(users.get("name"));
      const reversed = asc.reverse();
      expect(reversed).toBeInstanceOf(Nodes.Descending);
    });

    it("direction", () => {
      const asc = new Nodes.Ascending(users.get("name"));
      expect(asc.direction).toBe("asc");
    });

    it("ascending?", () => {
      const asc = new Nodes.Ascending(users.get("name"));
      expect(asc.isAscending()).toBe(true);
    });

    it("descending?", () => {
      const asc = new Nodes.Ascending(users.get("name"));
      expect(asc.isDescending()).toBe(false);
    });

    it("equality with same ivars", () => {
      const a = new Nodes.Ascending(users.get("name"));
      const b = new Nodes.Ascending(users.get("name"));
      expect(a.direction).toBe(b.direction);
    });

    it("inequality with different ivars", () => {
      const a = new Nodes.Ascending(users.get("name"));
      const b = new Nodes.Ascending(users.get("email"));
      expect((a.expr as Nodes.Attribute).name).not.toBe((b.expr as Nodes.Attribute).name);
    });
  });
});
