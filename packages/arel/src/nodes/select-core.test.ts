import { describe, it, expect, beforeEach } from "vitest";
import {
  Table,
  sql,
  star,
  SelectManager,
  InsertManager,
  UpdateManager,
  DeleteManager,
  Nodes,
  Visitors,
  Collectors,
} from "../index.js";

describe("Arel", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  const visitor = new Visitors.ToSql();

  describe("select-core", () => {
    it("inequality with different ivars", () => {
      const a = new Nodes.Ascending(users.get("name"));
      const b = new Nodes.Ascending(users.get("email"));
      expect((a.expr as Nodes.Attribute).name).not.toBe((b.expr as Nodes.Attribute).name);
    });

    it("equality with same ivars", () => {
      const a = new Nodes.Ascending(users.get("name"));
      const b = new Nodes.Ascending(users.get("name"));
      expect(a.direction).toBe(b.direction);
    });

    it("clone", () => {
      const core = new Nodes.SelectCore();
      core.projections.push(users.get("id"));
      core.wheres.push(users.get("id").eq(1));
      const cloned = core.clone();
      expect(cloned).not.toBe(core);
      expect(cloned.projections).toEqual(core.projections);
      expect(cloned.projections).not.toBe(core.projections);
      expect(cloned.wheres).toEqual(core.wheres);
      expect(cloned.wheres).not.toBe(core.wheres);
    });

    it("set quantifier", () => {
      const mgr = new SelectManager(users);
      mgr.project(star).distinct();
      expect((mgr.ast.cores[0] as Nodes.SelectCore).setQuantifier).toBeInstanceOf(Nodes.Distinct);
      expect(mgr.toSql()).toContain("SELECT DISTINCT");
    });
  });
});
