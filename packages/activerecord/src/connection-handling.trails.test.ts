import { describe, it, expect } from "vitest";
import { Nodes } from "@blazetrails/arel";
import { Base } from "./base.js";
import { leaseConnection, withConnection, connection } from "./connection-handling.js";

describe("directly bound adapter", () => {
  it("connection, leaseConnection and withConnection resolve to the same session", async () => {
    const pool = Base.connectionPool();
    const bound = await pool.checkout();
    try {
      class Boundish extends Base {}
      Boundish.adapter = bound;

      const direct = connection.call(Boundish as unknown as typeof Base);
      const leased = await leaseConnection.call(Boundish as unknown as typeof Base);
      const scoped = await withConnection.call(Boundish as unknown as typeof Base, (conn) => conn);

      expect(direct).toBe(bound);
      expect(leased).toBe(bound);
      expect(scoped).toBe(bound);
    } finally {
      pool.checkin(bound);
    }
  });
});

describe("Arel toSql through Table.engine", () => {
  it("borrows a connection for the visit and returns it to the pool", () => {
    Base.releaseConnection();
    const pool = Base.connectionPool();
    expect(pool.activeConnection).toBeNull();

    expect(new Nodes.SqlLiteral("1").eq(1).toSql()).toBe("1 = 1");

    expect(pool.activeConnection).toBeNull();
    expect(pool.isPermanentLease()).toBe(true);
  });

  it("keeps a lease the block made sticky, as connection_pool.rb:421 checks after yielding", () => {
    Base.releaseConnection();
    const pool = Base.connectionPool();
    const leased = pool.withConnectionSync(() => pool.leaseConnectionSync());
    try {
      expect(pool.activeConnection).toBe(leased);
    } finally {
      Base.releaseConnection();
    }
  });

  it("restores the lease when the checkout itself raises", () => {
    Base.releaseConnection();
    const pool = Base.connectionPool();
    const acquire = pool.acquireConnectionSync;
    pool.acquireConnectionSync = () => {
      throw new Error("checkout failed");
    };
    try {
      expect(() => pool.withConnectionSync((conn) => conn)).toThrow("checkout failed");
    } finally {
      pool.acquireConnectionSync = acquire;
    }
    expect(pool.activeConnection).toBeNull();
    expect(pool.isPermanentLease()).toBe(true);
  });
});
