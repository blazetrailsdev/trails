import { describe, it, expect, vi, afterEach } from "vitest";
import { Nodes } from "@blazetrails/arel";
import { Base } from "./base.js";
import { leaseConnection, withConnection, connection } from "./connection-handling.js";
import { adapterDouble, establishConnectionTo } from "./test-helpers/adapter-double.js";
import { permanentConnectionCheckout, setPermanentConnectionCheckout } from "./active-record.js";
import { ConnectionNotEstablished } from "./errors.js";

describe("directly bound adapter", () => {
  it("connection, leaseConnection and withConnection resolve to the same session", async () => {
    class Boundish extends Base {}
    const bound = adapterDouble();
    await establishConnectionTo(Boundish, bound);

    const leased = await leaseConnection.call(Boundish as unknown as typeof Base);
    const direct = connection.call(Boundish as unknown as typeof Base);
    const scoped = await withConnection.call(Boundish as unknown as typeof Base, (conn) => conn);

    expect(direct).toBe(bound);
    expect(leased).toBe(bound);
    expect(scoped).toBe(bound);
  });
});

describe("connection without a threaded lease", () => {
  it("raises ConnectionNotEstablished instead of checking one out synchronously", () => {
    const was = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
    try {
      Base.releaseConnection();
      expect(() => Base.connection).toThrow(ConnectionNotEstablished);
      expect(Base.connectionPool().activeConnection).toBeNull();
    } finally {
      setPermanentConnectionCheckout(was);
    }
  });

  it("makes a connection threaded by withConnection permanent, as lease_connection does", async () => {
    const was = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
    try {
      Base.releaseConnection();
      const conn = await Base.withConnection(async (connection) => {
        expect(Base.connection).toBe(connection);
        return connection;
      });
      expect(Base.connectionPool().activeConnection).toBe(conn);
    } finally {
      Base.releaseConnection();
      setPermanentConnectionCheckout(was);
    }
  });
});

describe("Arel toSql through Table.engine", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
    const leased = pool.withConnectionSync((conn) => {
      void pool.leaseConnection();
      return conn;
    });
    try {
      expect(pool.activeConnection).toBe(leased);
    } finally {
      Base.releaseConnection();
    }
  });

  it("restores the lease when the checkout itself raises", () => {
    Base.releaseConnection();
    const pool = Base.connectionPool();
    vi.spyOn(pool, "acquireConnectionSync").mockImplementation(() => {
      throw new Error("checkout failed");
    });
    expect(() => pool.withConnectionSync((conn) => conn)).toThrow("checkout failed");
    expect(pool.activeConnection).toBeNull();
    expect(pool.isPermanentLease()).toBe(true);
  });
});
