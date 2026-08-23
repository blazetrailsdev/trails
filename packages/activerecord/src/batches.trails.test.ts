/**
 * trails-only coverage for BatchEnumerator's Rails constructor kwargs.
 * Mirrors: activerecord/lib/active_record/relation/batches/batch_enumerator.rb
 */
import { describe, it, expect } from "vitest";
import { fixtures } from "./test-fixtures.js";
import { recordCursorValues } from "./relation/batches.js";
import { Post } from "./test-helpers/models/post.js";
import { Book } from "./test-helpers/models/book.js";

describe("BatchEnumerator (trails)", () => {
  fixtures(["posts", "books"] as const);

  it("re-enumerating honours the order it was built with", async () => {
    const enumerator = Post.inBatches({ of: 1, order: "desc" });
    const idsOf = async () => {
      const ids: number[] = [];
      for await (const relation of enumerator) {
        const records = await relation.toArray();
        ids.push(...records.map((p) => Number(p.id)));
      }
      return ids;
    };
    const first = await idsOf();
    const descending = [...first].sort((a, b) => b - a);
    expect(first).toEqual(descending);
    expect(await idsOf()).toEqual(first);
  });

  it("eachRecord honours the cursor it was built with", async () => {
    const records: Post[] = [];
    await Post.inBatches({ of: 1, cursor: "id", order: "desc" }).eachRecord((post: Post) => {
      records.push(post);
    });
    const expected = (await Post.order({ id: "desc" })).map((p) => Number(p.id));
    expect(records.map((p) => Number(p.id))).toEqual(expected);
  });

  it("an invalid order raises the ArgumentError batches.rb:324 raises", async () => {
    await expect(
      Post.inBatches({ of: 1, order: "invalid" as "asc" }).eachRecord(() => {}),
    ).rejects.toThrow(
      ":order must be :asc or :desc or an array consisting of :asc or :desc, got :invalid",
    );
  });

  it("an invalid order inside an array raises with the array inspected", async () => {
    await expect(
      Post.inBatches({ of: 1, cursor: ["id"], order: ["asc", "sideways"] as "asc"[] }).eachRecord(
        () => {},
      ),
    ).rejects.toThrow(
      ":order must be :asc or :desc or an array consisting of :asc or :desc, got [:asc, :sideways]",
    );
  });

  it("recordCursorValues reads the attribute even when it is null", async () => {
    const post = (await Post.first())!;
    post.writeAttribute("type", null);
    // A record carries same-named properties beside its attributes; Rails'
    // `record.attributes.slice(*cursor).values` (batches.rb:408-409) never
    // consults them, so a null attribute stays null.
    Object.defineProperty(post, "unrelated", { value: "from the property" });
    expect(recordCursorValues(post, ["type"])).toEqual([null]);
    expect(recordCursorValues(post, ["unrelated"])).toEqual([]);
  });
  // batches.rb:456-459. Rails has no test for this raise; the guard fires when a
  // cursor column is nil on a batched row — Ruby reads it out of
  // `values.flatten`, trails off each record's attributes. The relation is
  // scoped to the nil-author book: NULLs sort first on SQLite and last on
  // PostgreSQL, so an unscoped batch reaches the row on one adapter only.
  it("raises when a cursor column is nil", async () => {
    const name = "Bourdain: The Definitive Oral Biography";
    await Book.create({ name });

    await expect(
      (async () => {
        for await (const _ of Book.where({ name }).inBatches({
          of: 1,
          cursor: ["author_id", "name"],
        })) {
          // no-op: the guard raises on the batch carrying the nil author_id
        }
      })(),
    ).rejects.toThrow(
      "Not all of the batch cursor columns were included in the custom select clause " +
        "or some columns contain nil.",
    );
  });
});
