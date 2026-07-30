import { describe, it, expect } from "vitest";
import {
  STALE_DB_AGE_MS,
  mysqlAdvisoryLockName,
  newRunToken,
  ownRunDatabases,
  pgAdvisoryLockKey,
  runTokenOfDatabase,
  runTokenStartedAt,
  slotDatabaseName,
  staleRunDatabases,
} from "./run-token.js";

const BASE = "activerecord_unittest";

describe("run token", () => {
  it("carries the run start time so a name alone can be aged out", () => {
    // Regression: an earlier spelling split the two halves on a literal "x",
    // which `Date.now().toString(36)` itself contains for most of any given
    // day — the parsed start time was then garbage, and the stale sweep would
    // happily drop a concurrent run's live databases.
    const before = Date.now();
    const startedAt = runTokenStartedAt(newRunToken());
    expect(startedAt).not.toBeNull();
    expect(startedAt!).toBeGreaterThanOrEqual(before - 1000);
    expect(startedAt!).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("mints a distinct token per call", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => newRunToken()));
    expect(tokens.size).toBe(50);
  });
});

describe("slot database names", () => {
  it("stamps the run token into every slot, slot 1 included", () => {
    expect(slotDatabaseName(BASE, "rabc000001", 1)).toBe("activerecord_unittest_rabc000001_1");
    expect(slotDatabaseName(BASE, "rabc000001", 4)).toBe("activerecord_unittest_rabc000001_4");
  });

  it("two runs never name the same slot database", () => {
    const [a, b] = [newRunToken(), newRunToken()];
    for (let slot = 1; slot <= 8; slot++) {
      expect(slotDatabaseName(BASE, a, slot)).not.toBe(slotDatabaseName(BASE, b, slot));
    }
  });

  it("reads the run token back off a stamped name", () => {
    expect(runTokenOfDatabase(BASE, "activerecord_unittest_rabc000001_2")).toBe("rabc000001");
    expect(runTokenOfDatabase(BASE, "activerecord_unittest_rabc000001_2_arunit2")).toBe(
      "rabc000001",
    );
    expect(runTokenOfDatabase(BASE, "activerecord_unittest_rabc000001_template")).toBe(
      "rabc000001",
    );
    expect(runTokenOfDatabase(BASE, BASE)).toBeNull();
    expect(runTokenOfDatabase(BASE, "activerecord_unittest_2")).toBeNull();
  });
});

describe("drop targets", () => {
  // The regression this whole story exists to prevent: globalSetup used to
  // DROP `activerecord_unittest_2..N` unconditionally, so a second run wiped
  // the first run's databases out from under its live workers.
  it("never targets a database belonging to a different run token", () => {
    const mine = "raaa000001";
    const theirs = "rbbb000002";
    const names = [
      BASE,
      "activerecord_unittest_2",
      slotDatabaseName(BASE, mine, 1),
      slotDatabaseName(BASE, mine, 2),
      `${slotDatabaseName(BASE, mine, 2)}_arunit2`,
      slotDatabaseName(BASE, theirs, 1),
      slotDatabaseName(BASE, theirs, 2),
      "postgres",
      "template1",
    ];

    expect(ownRunDatabases(BASE, mine, names)).toEqual([
      "activerecord_unittest_raaa000001_1",
      "activerecord_unittest_raaa000001_2",
      "activerecord_unittest_raaa000001_2_arunit2",
    ]);
  });
});

describe("stale sweep", () => {
  const now = Date.now();
  const tokenAt = (millis: number): string => `r${millis.toString(36)}zzzzzz`;

  it("reclaims databases orphaned by a killed run", () => {
    const orphan = slotDatabaseName(BASE, tokenAt(now - STALE_DB_AGE_MS - 1), 3);
    expect(staleRunDatabases(BASE, "raaa000001", [orphan], now)).toEqual([orphan]);
  });

  it("leaves a concurrent run's live databases alone", () => {
    const live = slotDatabaseName(BASE, tokenAt(now - 60_000), 3);
    const mine = slotDatabaseName(BASE, "raaa000001", 1);
    expect(staleRunDatabases(BASE, "raaa000001", [live, mine, BASE], now)).toEqual([]);
  });
});

describe("advisory lock keys", () => {
  it("gives two runs disjoint key spaces on PG", () => {
    const [a, b] = [newRunToken(), newRunToken()];
    expect(pgAdvisoryLockKey(a, 1)).not.toEqual(pgAdvisoryLockKey(b, 1));
    expect(pgAdvisoryLockKey(a, 1)).toEqual(pgAdvisoryLockKey(a, 1));
  });

  it("keeps PG keys inside the signed 32-bit range PostgreSQL accepts", () => {
    for (let i = 0; i < 200; i++) {
      const [classId, objId] = pgAdvisoryLockKey(newRunToken(), 3);
      expect(Number.isInteger(classId)).toBe(true);
      expect(classId).toBeGreaterThanOrEqual(-(2 ** 31));
      expect(classId).toBeLessThanOrEqual(2 ** 31 - 1);
      expect(objId).toBe(3);
    }
  });

  it("gives two runs disjoint GET_LOCK names on MySQL", () => {
    expect(mysqlAdvisoryLockName("raaa000001", 2)).toBe("ar_test_slot_raaa000001_2");
    expect(mysqlAdvisoryLockName("rbbb000002", 2)).not.toBe(mysqlAdvisoryLockName("raaa000001", 2));
  });

  it("stays inside MySQL's 64-character lock-name limit", () => {
    expect(mysqlAdvisoryLockName(newRunToken(), 99).length).toBeLessThanOrEqual(64);
  });
});
