import { describe, it, expect } from "vitest";
import { Table, DeleteManager } from "./index.js";

// TS-only coverage: the full ORDER BY / LIMIT rendering and the `wheres`
// reader, which Rails' delete_manager_test.rb exercises only through
// `assert_match(/LIMIT 10/)`.
describe("DeleteManagerTest (trails)", () => {
  const users = new Table("users");

  it("handles limit properly", () => {
    const mgr = new DeleteManager();
    mgr.from(users);
    mgr.where(users.get("active").eq(false));
    mgr.order(users.get("created_at").asc());
    mgr.take(10);
    expect(mgr.toSql()).toBe(
      `DELETE FROM "users" WHERE "users"."active" = 'f' ORDER BY "users"."created_at" ASC LIMIT 10`,
    );
  });

  it("wheres getter returns WHERE conditions", () => {
    const manager = new DeleteManager();
    manager.from(users);
    manager.where(users.get("id").eq(1));
    expect(manager.wheres.length).toBe(1);
  });
});
