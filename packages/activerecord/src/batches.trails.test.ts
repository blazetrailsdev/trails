import { describe, it, expect } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { fixtures } from "./test-fixtures.js";
import { recordCursorValues } from "./relation/batches.js";
import { Post } from "./test-helpers/models/post.js";
import { Book } from "./test-helpers/models/book.js";

describe("BatchEnumerator (trails)", () => {
  fixtures(["posts", "books"] as const);

  it("re-enumerating honours the order it was built with", async () => {
    const enumerator = Post.inBatches({ of: 1, order: ":desc" });
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

  it("toA collects every batch relation", async () => {
    const batches = await Post.inBatches({ of: 2 }).toA();
    const ids: number[] = [];
    for (const relation of batches) ids.push(...(await relation.pluck("id")).map(Number));
    expect(ids).toEqual((await Post.order("id").pluck("id")).map(Number));
  });

  it("sum settles one batch's block before the next batch is fetched", async () => {
    const events: string[] = [];
    const subscription = Notifications.subscribe(
      "sql.active_record",
      (event: { payload: Record<string, unknown> }) => {
        if (event.payload.name !== "SCHEMA") events.push("query");
      },
    );
    let total: number;
    try {
      total = await Post.inBatches({ of: 1 }).sum(async () => {
        events.push("enter");
        await new Promise((resolve) => setTimeout(resolve, 5));
        events.push("leave");
        return 1;
      });
    } finally {
      Notifications.unsubscribe(subscription);
    }
    expect(total).toBe(await Post.count());
    expect(total).toBeGreaterThan(2);
    expect(events.filter((event) => event !== "query").length).toBe(total * 2);
    events.forEach((event, i) => {
      if (event === "enter") expect(events[i + 1]).toBe("leave");
    });
    expect(events.indexOf("query")).toBeLessThan(events.indexOf("enter"));
    expect(events.lastIndexOf("query")).toBeGreaterThan(events.indexOf("leave"));
  });

  it("eachRecord honours the cursor it was built with", async () => {
    const records: Post[] = [];
    await Post.inBatches({ of: 1, cursor: "id", order: ":desc" }).eachRecord((post: Post) => {
      records.push(post);
    });
    const expected = (await Post.order({ id: "desc" })).map((p) => Number(p.id));
    expect(records.map((p) => Number(p.id))).toEqual(expected);
  });

  it("an invalid order raises the ArgumentError batches.rb:324 raises", async () => {
    await expect(
      Post.inBatches({ of: 1, order: ":invalid" as ":asc" }).eachRecord(() => {}),
    ).rejects.toThrow(
      ":order must be :asc or :desc or an array consisting of :asc or :desc, got :invalid",
    );
  });

  it("a String limit raises the ArgumentError Ruby's < raises at batches.rb:275", async () => {
    await expect(
      Post.limit("5")
        .inBatches({ of: 2 })
        .eachRecord(() => {}),
    ).rejects.toThrow("comparison of String with 2 failed");
  });

  it("an invalid order inside an array raises with the array inspected", async () => {
    await expect(
      Post.inBatches({
        of: 1,
        cursor: ["id"],
        order: [":asc", ":sideways"] as ":asc"[],
      }).eachRecord(() => {}),
    ).rejects.toThrow(
      ":order must be :asc or :desc or an array consisting of :asc or :desc, got [:asc, :sideways]",
    );
  });

  it("breaking out of a blockless enumeration stops the batch queries", async () => {
    const wanted = await Post.count();
    expect(wanted).toBeGreaterThan(2);
    const sqls: string[] = [];
    const subscription = Notifications.subscribe(
      "sql.active_record",
      (event: { payload: Record<string, unknown> }) => {
        if (event.payload.name !== "SCHEMA") sqls.push(String(event.payload.sql));
      },
    );
    try {
      for await (const relation of Post.inBatches({ of: 1 })) {
        await relation.toArray();
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    } finally {
      Notifications.unsubscribe(subscription);
    }
    expect(sqls.length).toBeLessThan(wanted);
  });

  it("an error raised while batching reaches the blockless consumer", async () => {
    await expect(
      (async () => {
        for await (const _ of Post.inBatches({ of: 1, order: "sideways" as ":asc" })) {
        }
      })(),
    ).rejects.toThrow(/:order must be :asc or :desc/);
  });

  it("recordCursorValues reads the attribute even when it is null", async () => {
    const post = (await Post.first())!;
    post.writeAttribute("type", null);
    Object.defineProperty(post, "unrelated", { value: "from the property" });
    expect(recordCursorValues(post, ["type"])).toEqual([null]);
    expect(recordCursorValues(post, ["unrelated"])).toEqual([]);
  });
  it("raises when a cursor column is nil", async () => {
    const name = "Bourdain: The Definitive Oral Biography";
    await Book.create({ name });

    await expect(
      (async () => {
        for await (const _ of Book.where({ name }).inBatches({
          of: 1,
          cursor: ["author_id", "name"],
        })) {
        }
      })(),
    ).rejects.toThrow(
      "Not all of the batch cursor columns were included in the custom select clause " +
        "or some columns contain nil.",
    );
  });
});
