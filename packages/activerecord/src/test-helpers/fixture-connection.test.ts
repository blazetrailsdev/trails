/**
 * Regression coverage for the fixture machinery's connection source.
 *
 * Rails bans the soft-deprecated `Base.connection` getter suite-wide
 * (`test/cases/helper.rb:27`, `permanent_connection_checkout = :disallowed`) and
 * its fixture setup leases from the pool instead (`test_fixtures.rb:179/194`).
 * These tests pin that the trails fixture default does the same: they fail
 * against the previous `() => Base.connection` default, which raises under
 * `"disallowed"`.
 *
 * Run this file only (not the whole suite):
 *   pnpm vitest run packages/activerecord/src/test-helpers/fixture-connection.test.ts
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { Base } from "../base.js";
import { setPermanentConnectionCheckout } from "../ar-config.js";
import { establishFromTestConfig } from "../support/connection.js";
import { leaseFixtureConnection } from "./fixture-connection.js";

describe("fixture connection source", () => {
  beforeAll(async () => {
    await establishFromTestConfig();
  });

  afterEach(() => {
    setPermanentConnectionCheckout(true);
  });

  it("leases without tripping permanentConnectionCheckout = disallowed", () => {
    setPermanentConnectionCheckout("disallowed");

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
      setPermanentConnectionCheckout("disallowed");

      expect(leaseFixtureConnection()).toBe(sentinel);
    } finally {
      Base._adapter = previous;
    }
  });
});
