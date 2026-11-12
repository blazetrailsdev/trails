import { describe, it, expect } from "vitest";
import { fixtures } from "../../lib/test-helpers/use-fixtures.js";
import { Comment } from "../models/comment.js";
import { rbClearMethodCache, rbObjSingletonClass } from "@blazetrails/ruby-compat";
import { _virtualAttributePrototypeCache } from "../../lib/persistence.js";

describe("select alias dynamic reader (trails)", () => {
  fixtures(["posts", "comments"]);

  it("exposes a non-column aggregate select alias via property access", async () => {
    const record = (
      await Comment.group("type").select("COUNT(post_id) AS post_count, type")
    )[0] as Comment & { post_count: unknown };
    expect(record.post_count).toEqual(record.readAttribute("post_count"));
    expect(record.post_count).not.toBeUndefined();
  });

  it("drops the alias reader on reload once the fresh row lacks it", async () => {
    const record = (
      await Comment.select("comments.*, (id + 1000) AS bumped_id").order("id")
    )[0] as Comment & { bumped_id: unknown };
    expect(record.bumped_id).toEqual(record.readAttribute("bumped_id"));
    expect(record.bumped_id).not.toBeUndefined();
    await record.reload();
    expect(record.bumped_id).toBeUndefined();
    expect(record.id).toEqual(record.readAttribute("id"));
  });

  it("keeps the alias reader on reload when the fresh row still carries it", async () => {
    const aliased = Comment.select("comments.*, (id + 1000) AS bumped_id").order("id");
    const record = (await aliased)[0] as Comment & { bumped_id: unknown };
    await aliased.scoping({ allQueries: true }, async () => {
      await record.reload();
    });
    expect(record.bumped_id).toEqual(record.readAttribute("bumped_id"));
    expect(record.bumped_id).not.toBeUndefined();
  });

  it("records loaded with the same alias share one reader instead of a singleton each", async () => {
    const [a, b] = (await Comment.select("comments.*, (id + 1000) AS bumped_id").order(
      "id",
    )) as (Comment & { bumped_id: unknown })[];
    const [c] = await Comment.select("comments.*, (id + 1000) AS bumped_id").order("id");
    expect(Object.getPrototypeOf(a)).toBe(Object.getPrototypeOf(b));
    expect(Object.getPrototypeOf(a)).toBe(Object.getPrototypeOf(c));
    expect(Object.getPrototypeOf(Object.getPrototypeOf(a))).toBe(Comment.prototype);
    expect(a).toBeInstanceOf(Comment);
    expect(a.bumped_id).not.toEqual(b.bumped_id);
  });

  it("does not leak an alias reader onto records loaded without it", async () => {
    await Comment.select("comments.*, (id + 1000) AS bumped_id").order("id");
    const [plain] = (await Comment.order("id")) as (Comment & { bumped_id: unknown })[];
    const [other] = (await Comment.select("comments.*, (id + 2000) AS other_id").order(
      "id",
    )) as (Comment & { bumped_id: unknown; other_id: unknown })[];
    expect(Object.getPrototypeOf(plain)).toBe(Comment.prototype);
    expect(plain.bumped_id).toBeUndefined();
    expect(other.bumped_id).toBeUndefined();
    expect(other.other_id).toEqual(other.readAttribute("other_id"));
  });

  it("a clone of a record carrying the shared alias reader keeps it", async () => {
    const [record] = (await Comment.select("comments.*, (id + 1000) AS bumped_id").order(
      "id",
    )) as (Comment & { bumped_id: unknown })[];
    const copy = record.clone() as Comment & { bumped_id: unknown };
    expect(copy.bumped_id).toEqual(record.bumped_id);
    expect(copy).toBeInstanceOf(Comment);
  });

  it("rebuilds the shared alias reader after the class undefines its attribute methods", async () => {
    const [a] = await Comment.select("comments.*, (id + 1000) AS bumped_id").order("id");
    Comment.undefineAttributeMethods();
    const [b] = (await Comment.select("comments.*, (id + 1000) AS bumped_id").order(
      "id",
    )) as (Comment & { bumped_id: unknown })[];
    expect(Object.getPrototypeOf(b) === Object.getPrototypeOf(a)).toBe(false);
    expect(b.bumped_id).toEqual(b.readAttribute("bumped_id"));
  });

  it("caches at most 64 alias sets and 64 alias readers per class", async () => {
    Comment.undefineAttributeMethods();
    for (let i = 0; i < 65; i++) {
      const [record] = (await Comment.select(`comments.*, (id + ${i}) AS alias_${i}`).order(
        "id",
      )) as (Comment & Record<string, unknown>)[];
      expect(record[`alias_${i}`]).toEqual(record.readAttribute(`alias_${i}`));
    }
    const cache = _virtualAttributePrototypeCache.get(Comment)!;
    expect(cache.prototypes.size).toBe(64);
    expect(cache.methods.size).toBe(64);
    const [first] = await Comment.select("comments.*, (id + 64) AS alias_64").order("id");
    const [second] = await Comment.select("comments.*, (id + 64) AS alias_64").order("id");
    expect(Object.getPrototypeOf(first) === Object.getPrototypeOf(second)).toBe(false);
  });

  it("stops treating an alias as virtual once the class defines a method by that name", async () => {
    const sql = "comments.*, (id + 1000) AS bumped_id";
    const [before] = await Comment.select(sql).order("id");
    expect(Object.getPrototypeOf(before) === Comment.prototype).toBe(false);
    Object.defineProperty(Comment.prototype, "bumped_id", {
      configurable: true,
      get: () => "defined",
    });
    rbClearMethodCache();
    try {
      const [after] = (await Comment.select(sql).order("id")) as (Comment & {
        bumped_id: unknown;
      })[];
      expect(Object.getPrototypeOf(after) === Comment.prototype).toBe(true);
      expect(after.bumped_id).toBe("defined");
    } finally {
      delete (Comment.prototype as unknown as Record<string, unknown>).bumped_id;
      rbClearMethodCache();
    }
  });

  it("loads a record without materializing its attribute set", async () => {
    const record = (await Comment.select("comments.*, (id + 1000) AS bumped_id").order("id"))[0];
    const attributes = (record as unknown as { _attributes: { _attributes: object } })._attributes;
    expect(Object.keys(attributes._attributes)).toEqual([]);
    expect((record as Comment & { bumped_id: unknown }).bumped_id).not.toBeUndefined();
  });

  it("reloads a record without materializing its attribute set", async () => {
    const aliased = Comment.select("comments.*, (id + 1000) AS bumped_id").order("id");
    const record = (await aliased)[0] as Comment & { bumped_id: unknown };
    await aliased.scoping({ allQueries: true }, async () => {
      await record.reload();
    });
    const attributes = (record as unknown as { _attributes: { _attributes: object } })._attributes;
    expect(Object.keys(attributes._attributes)).toEqual([]);
    expect(record.bumped_id).not.toBeUndefined();
  });

  it("keeps the alias reader on a record loaded through marshal_load", async () => {
    const record = (await Comment.select("comments.*, (id + 1000) AS bumped_id").order("id"))[0];
    const loaded = Comment.allocate() as Comment & { bumped_id: unknown };
    const state = (record as unknown as { _marshalDump71(): unknown[] })._marshalDump71();
    expect(state).toHaveLength(2);
    loaded.marshalLoad(state);
    expect(loaded.bumped_id).toEqual(record.readAttribute("bumped_id"));
    expect(loaded.bumped_id).not.toBeUndefined();
  });

  it("reloads a record with its own singleton class onto the fresh record's readers", async () => {
    const aliased = Comment.select("comments.*, (id + 1000) AS bumped_id").order("id");
    const record = (await Comment.order("id"))[0] as Comment & { bumped_id: unknown };
    rbObjSingletonClass(record);
    Comment.resetColumnInformation();
    await aliased.scoping({ allQueries: true }, async () => {
      await record.reload();
    });
    expect(record.bumped_id).toEqual(record.readAttribute("bumped_id"));
    expect(record.bumped_id).not.toBeUndefined();
    expect(record.body).toEqual(record.readAttribute("body"));
    expect(record.constructor).toBe(Comment);
  });
});
