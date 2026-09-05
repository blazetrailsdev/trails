import { describe, it, expect } from "vitest";
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
