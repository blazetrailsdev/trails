import { it, expect, beforeEach, afterEach } from "vitest";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { DateTime as OidDateTime } from "../../connection-adapters/postgresql/oid/date-time.js";

describeIfPg("PostgreSQLAdapter OID::DateTime", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.disconnectBang();
  });

  for (const [name, literal, year] of [
    ["a BC timestamp literal", "0002-12-25 00:00:00 BC", -1],
    ["a BC leap-year timestamp literal", "0005-02-29 00:00:00 BC", -4],
    ["a BC year-zero timestamp literal", "0001-04-07 00:00:00 BC", 0],
  ] as const) {
    it(`casts and re-quotes ${name}`, async () => {
      const oidType = new OidDateTime();
      const instant = oidType.castValue(literal) as RubyTime;
      expect(instant.year).toBe(year);

      const serialized = adapter.quotedDate(instant);
      expect(serialized).toBe(literal);

      const rows = await adapter.execute(`SELECT '${serialized}'::timestamp AS val`);
      const roundTripped = rows[0].val as Temporal.Instant;
      expect(roundTripped).toBeInstanceOf(Temporal.Instant);
      expect(roundTripped.epochMilliseconds).toBe(instant.toI() * 1000);
    });
  }
});
