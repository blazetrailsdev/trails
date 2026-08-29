import { describe, it, expect, afterEach } from "vitest";
import { Base } from "../base.js";
import { ActiveRecord } from "../ar-config.js";
import { leaseFixtureConnection, leaseFixtureConnectionFor } from "./fixture-connection.js";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import { NullPool } from "../connection-adapters/abstract/connection-pool.js";

describe("fixture connection source", () => {
  afterEach(() => {
    ActiveRecord.permanentConnectionCheckout = true;
  });

  it("leases without tripping permanentConnectionCheckout = disallowed", () => {
    ActiveRecord.permanentConnectionCheckout = "disallowed";

    expect(() => leaseFixtureConnection()).not.toThrow();
  });

  it("resolves the same connection the pool holds", () => {
    const leased = leaseFixtureConnection();

    expect(leased).toBe(Base.connectionPool().activeConnection);
  });

  it("returns a directly-assigned adapter without consulting the pool", () => {
    const sentinel = { marker: "direct-adapter" } as never;
    const previous = Base._adapter;
    Base._adapter = sentinel;
    try {
      ActiveRecord.permanentConnectionCheckout = "disallowed";

      expect(leaseFixtureConnection()).toBe(sentinel);
    } finally {
      Base._adapter = previous;
    }
  });
});

describe("per-set fixture connection", () => {
  const fixtureConnection = {
    marker: "pinned-fixture-connection",
    pool: new NullPool(),
  } as unknown as DatabaseAdapter;

  it("seeds a model-less (join-table) set through the fixture connection", async () => {
    expect(await leaseFixtureConnectionFor(null, fixtureConnection)).toBe(fixtureConnection);
  });

  it("seeds a primary-database model through the pinned fixture connection", async () => {
    const pinned = leaseFixtureConnection();

    expect(await leaseFixtureConnectionFor(Base, pinned)).toBe(pinned);
  });

  it("seeds a model whose pool differs through that model's own pool", async () => {
    const secondary = { marker: "arunit2-connection" } as unknown as DatabaseAdapter;
    const pool = { leaseConnection: async () => secondary };
    const model = { connectionPool: () => pool };
    const primary = leaseFixtureConnection();

    expect(await leaseFixtureConnectionFor(model, primary)).toBe(secondary);
  });

  it("keeps a caller-supplied pool-less adapter for every set", async () => {
    const pool = { leaseConnection: async () => ({}) as DatabaseAdapter };
    const model = { connectionPool: () => pool };

    expect(await leaseFixtureConnectionFor(model, fixtureConnection)).toBe(fixtureConnection);
  });
});
