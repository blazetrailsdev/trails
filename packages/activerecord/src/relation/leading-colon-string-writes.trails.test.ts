/**
 * TS-only regression coverage: a string whose first character is a colon must
 * round-trip verbatim through every write path, before and after the model's
 * attribute types are loaded.
 *
 * `ActiveModel::Type::ImmutableString#serialize`
 * (activemodel/lib/active_model/type/immutable_string.rb:52-58) routes
 * `::Symbol` through `to_s`. A trails Symbol is a `":name"` string, so keying
 * that arm off a leading colon made it fire on ordinary String data too and
 * ate one colon per write — but only once `type_for_attribute` had a real
 * string type to serialize through, which is why the `find_by` below comes
 * first.
 */
import { describe, it, expect } from "vitest";
import { fixtures } from "../test-fixtures.js";
import { Topic } from "../test-helpers/models/topic.js";

const CASES: [string, string][] = [
  ["::Alpha", "::Alpha"],
  [":Alpha", ":Alpha"],
  [":::Alpha", ":::Alpha"],
  ["Alpha::Beta", "Alpha::Beta"],
];

describe("leading-colon string writes", () => {
  fixtures({ topics: [Topic, {}] });

  it("update_all stores a leading colon verbatim once the types are loaded", async () => {
    const topic = await Topic.create({ title: "seed" });
    await Topic.findBy({ id: topic.id });
    for (const [sent, stored] of CASES) {
      await Topic.where({ id: topic.id }).updateAll({ title: sent });
      expect((await Topic.find(topic.id)).title).toBe(stored);
    }
  });

  it("save stores a leading colon verbatim once the types are loaded", async () => {
    const seed = await Topic.create({ title: "seed" });
    await Topic.findBy({ id: seed.id });
    for (const [sent, stored] of CASES) {
      const topic = await Topic.find(seed.id);
      topic.title = sent;
      await topic.save();
      expect((await Topic.find(seed.id)).title).toBe(stored);
    }
  });

  it("create and insert_all store a leading colon verbatim", async () => {
    await Topic.create({ title: "seed" });
    for (const [sent, stored] of CASES) {
      const created = await Topic.create({ title: sent });
      expect((await Topic.find(created.id)).title).toBe(stored);

      await Topic.insertAll([{ title: sent, author_name: "colon" }]);
      const inserted = await Topic.where({ author_name: "colon" }).first();
      expect(inserted!.title).toBe(stored);
      await Topic.where({ author_name: "colon" }).deleteAll();
    }
  });
});
