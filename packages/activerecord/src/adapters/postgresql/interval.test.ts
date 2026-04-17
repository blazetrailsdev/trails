/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/interval_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Duration } from "@blazetrails/activesupport";
import { Interval } from "../../connection-adapters/postgresql/oid/interval.js";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgresqlIntervalTest", () => {
    it.skip("column", async () => {});
    it.skip("default", async () => {});
    it.skip("type cast interval", async () => {});
    it.skip("interval write", async () => {});
    it.skip("interval iso 8601", async () => {});
    it.skip("interval schema dump", async () => {});
    it.skip("interval where", async () => {});
    it.skip("interval type", () => {});
    it.skip("interval type cast from invalid string", () => {});
    it.skip("interval type cast from numeric", () => {});
    it.skip("interval type cast string and numeric from user", () => {});
    it.skip("average interval type", () => {});
    it.skip("schema dump with default value", () => {});
  });
});

// Unit-level tests against the Interval type directly — no DB required.
// Rails test names so api:compare matches.
describe("PostgresqlIntervalTest", () => {
  it("interval type", () => {
    expect(new Interval().type()).toBe("interval");
  });

  it("interval type cast from invalid string", () => {
    // Rails: invalid ISO8601 returns nil.
    expect(new Interval().cast("not a duration")).toBeNull();
  });

  it("interval type cast from numeric", () => {
    // Rails: numeric seconds round-trip through Duration.build and iso8601.
    // Verify both cast (FromUser path) and serialize (direct-to-DB path)
    // handle the numeric case consistently.
    const type = new Interval();
    const cast = type.cast(3600);
    expect(cast).toBeInstanceOf(Duration);
    expect(type.serialize(cast)).toBe(Duration.build(3600).iso8601());
    expect(type.serialize(3600)).toBe(Duration.build(3600).iso8601());
  });
});
