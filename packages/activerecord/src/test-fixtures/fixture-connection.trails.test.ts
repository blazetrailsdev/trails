import { describe, it, expect, afterEach } from "vitest";
import { Base } from "../base.js";
import { leaseFixtureConnection } from "./fixture-connection.js";
import { setPermanentConnectionCheckout } from "../active-record.js";

describe("fixture connection source", () => {
  afterEach(() => {
    setPermanentConnectionCheckout(true);
  });

  it("leases without tripping permanentConnectionCheckout = disallowed", async () => {
    setPermanentConnectionCheckout("disallowed");

    await expect(leaseFixtureConnection()).resolves.toBeDefined();
  });

  it("resolves the same connection the pool holds", async () => {
    const leased = await leaseFixtureConnection();

    expect(leased).toBe(Base.connectionPool().activeConnection);
  });
});
