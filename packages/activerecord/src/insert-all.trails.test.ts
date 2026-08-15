/**
 * Trails-specific InsertAll tests — no like-named test exists in
 * vendor/rails/activerecord/test/cases/insert_all_test.rb.
 */
import { describe, it, expect } from "vitest";
import { fixtures } from "./test-fixtures.js";
import "./support/canonical-model-index.js";
import { Ship } from "./test-helpers/models/ship.js";
import { adapterType } from "./test-adapter.js";
import { assertQueriesMatch } from "./testing/query-assertions.js";
import type { Base } from "./base.js";

async function withRecordTimestamps(
  model: typeof Base,
  value: boolean,
  fn: () => Promise<void>,
): Promise<void> {
  const original = model.recordTimestamps;
  model.recordTimestamps = value;
  try {
    await fn();
  } finally {
    model.recordTimestamps = original;
  }
}

describe("InsertAll verify_attributes", () => {
  fixtures([]);

  // Rails' verify_attributes (insert_all.rb:206-210) compares against
  // `keys_including_timestamps`, and map_key_with_value reverse_merges
  // `timestamps_for_create` into every row BEFORE calling it. So a batch whose
  // rows disagree only about whether they spell out a magic timestamp column
  // is accepted: both sides of the comparison carry created_at/updated_at.
  // Comparing raw row keys against `@keys` instead raises a spurious
  // ArgumentError here.
  it("accepts rows that differ only in explicitly-given timestamp columns", async () => {
    await withRecordTimestamps(Ship as unknown as typeof Base, true, async () => {
      const now = new Date();
      await expect(
        Ship.insertAll([
          { name: "RSS Boaty McBoatface", created_at: now, updated_at: now },
          { name: "RSS Sir David Attenborough" },
        ]),
      ).resolves.toBeDefined();

      const names = (await Ship.order("name")).map((s) => s.name);
      expect(names).toEqual(["RSS Boaty McBoatface", "RSS Sir David Attenborough"]);
    });
  });

  it("still rejects rows that differ in a non-timestamp column", async () => {
    await withRecordTimestamps(Ship as unknown as typeof Base, true, async () => {
      await expect(
        Ship.insertAll([{ name: "RSS Boaty McBoatface" }, { treasures_count: 3 }]),
      ).rejects.toThrow(/All objects being inserted must have the same keys/);
    });
  });
});

describe("InsertAll build_insert_sql raw alias syntax", () => {
  fixtures([]);

  // abstract_mysql_adapter.rb:638-682 has two arms: MySQL >= 8.0.19 emits the
  // row-alias form (`... AS ships_values` + `ships.col<=>ships_values.col`),
  // everything older — and MariaDB, which `supports_insert_raw_alias_syntax?`
  // excludes outright (rb:892-894) — keeps the `VALUES(<expr>)` form MySQL
  // 8.0.20 deprecates.
  it.skipIf(adapterType !== "mysql")("selects the alias arm on MySQL >= 8.0.19", async () => {
    const connection = Ship.connection as unknown as {
      supportsInsertRawAliasSyntax(): Promise<boolean>;
    };
    const rawAlias = await connection.supportsInsertRawAliasSyntax();
    const expected = rawAlias
      ? /INSERT INTO .* AS `ships_values` ON DUPLICATE KEY UPDATE updated_at=\(CASE WHEN \(`ships`\.`name`<=>`ships_values`\.`name`\) THEN `ships`\.updated_at .*`name`=`ships_values`\.`name`/
      : /ON DUPLICATE KEY UPDATE updated_at=\(CASE WHEN \(`name`<=>VALUES\(`name`\)\).*`name`=VALUES\(`name`\)/;

    await withRecordTimestamps(Ship as unknown as typeof Base, true, async () => {
      await assertQueriesMatch(expected, 1, false, async () => {
        await Ship.upsertAll([{ id: 1, name: "RSS Boaty McBoatface" }]);
      });
    });
  });
});
