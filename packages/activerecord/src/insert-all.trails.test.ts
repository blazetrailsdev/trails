import { describe, it, expect } from "vitest";
import { fixtures } from "./test-fixtures.js";
import "./support/canonical-model-index.js";
import { Book } from "./test-helpers/models/book.js";
import { Ship } from "./test-helpers/models/ship.js";
import { adapterType } from "./test-adapter.js";
import { assertQueriesMatch } from "./testing/query-assertions.js";
import { itIfSupports } from "./support/supports.js";
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

describe("InsertAll configure_on_duplicate_update_logic", () => {
  fixtures([]);

  itIfSupports(
    "insert_on_duplicate_update",
    "upsert all with an empty update only still updates the auto-generated columns",
    async () => {
      await Book.upsertAll([{ id: 101, name: "Perelandra", author_id: 7, isbn: "1974522598" }]);
      await Book.upsertAll([{ id: 101, name: "Perelandra 2", author_id: 7, isbn: "111111" }], {
        updateOnly: [],
      });
      const book = (await Book.find(101)) as unknown as { name: string; isbn: string };
      expect(book.name).toBe("Perelandra 2");
      expect(book.isbn).toBe("111111");
    },
  );
});
