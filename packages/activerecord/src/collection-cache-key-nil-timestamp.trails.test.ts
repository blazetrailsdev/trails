import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { fixtures } from "./test-fixtures.js";
import { registerModel } from "./associations.js";
import { Developer } from "./test-helpers/models/developer.js";

registerModel(Developer);

function withCollectionCacheVersioning(fn: () => Promise<void>): Promise<void> {
  const original = Base.collectionCacheVersioning;
  Base.collectionCacheVersioning = true;
  return fn().finally(() => {
    Base.collectionCacheVersioning = original;
  });
}

describe("CollectionCacheKeyNilTimestampTest", () => {
  fixtures(["developers"]);

  it("cache_version for loaded relation raises when a timestamp is nil", async () => {
    await withCollectionCacheVersioning(async () => {
      const developers = await Developer.where({ salary: 100000 }).load();
      const records = await developers.records();
      expect(records.length).toBeGreaterThan(1);
      records[0].writeAttribute("updated_at", null);
      await expect(developers.computeCacheVersion()).rejects.toThrow(ArgumentError);
      await expect(developers.computeCacheVersion()).rejects.toThrow(
        "comparison of Time with nil failed",
      );

      const later = await Developer.where({ salary: 100000 }).load();
      const laterRecords = await later.records();
      laterRecords[laterRecords.length - 1].writeAttribute("updated_at", null);
      await expect(later.computeCacheVersion()).rejects.toThrow(
        "comparison of NilClass with Time failed",
      );
    });
  });
});
