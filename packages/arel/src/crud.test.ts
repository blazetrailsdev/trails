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
} from "./index.js";

describe("Arel", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  const visitor = new Visitors.ToSql();

  describe("crud", () => {
    it("should call insert on the connection", () => {
      const mgr = new InsertManager(users);
      mgr.insert([[users.get("name"), "dean"]]);
      expect(mgr.toSql()).toContain('INSERT INTO "users"');
    });

    it("should call update on the connection", () => {
      const mgr = new UpdateManager();
      mgr.table(users).set([[users.get("name"), "sam"]]).where(users.get("id").eq(1));
      expect(mgr.toSql()).toContain('UPDATE "users"');
    });

    it("should call delete on the connection", () => {
      const mgr = new DeleteManager();
      mgr.from(users).where(users.get("id").eq(1));
      expect(mgr.toSql()).toContain('DELETE FROM "users"');
    });
  });
});
