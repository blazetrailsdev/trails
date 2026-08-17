/**
 * trails-only coverage for BatchEnumerator's Rails constructor kwargs.
 * Mirrors: activerecord/lib/active_record/relation/batches/batch_enumerator.rb
 */
import { describe, it, expect } from "vitest";
import { fixtures } from "./test-fixtures.js";
import { Post } from "./test-helpers/models/post.js";

describe("BatchEnumerator (trails)", () => {
  fixtures(["posts"] as const);

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
});
