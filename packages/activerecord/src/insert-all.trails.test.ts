/**
 * Trails-specific InsertAll tests — no like-named test exists in
 * vendor/rails/activerecord/test/cases/insert_all_test.rb.
 */
import { describe, it, expect } from "vitest";
import { fixtures } from "./test-fixtures.js";
import "./support/canonical-model-index.js";
import { Ship } from "./test-helpers/models/ship.js";
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
