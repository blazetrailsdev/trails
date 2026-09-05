import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { assertNotPredicate } from "@blazetrails/activesupport";
import { describe, it, expect } from "vitest";
import { Base, StatementInvalid, Relation } from "./index.js";
import { hexdigest } from "@blazetrails/activesupport";
import { assertQueriesCount, assertNoQueries } from "./testing/query-assertions.js";
import { fixtures } from "./test-fixtures.js";
import { registerModel } from "./associations.js";
import { Developer } from "./test-helpers/models/developer.js";
import { Comment } from "./test-helpers/models/comment.js";
import { Post } from "./test-helpers/models/post.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Project } from "./test-helpers/models/project.js";
import { Ship } from "./test-helpers/models/ship.js";
import "./associations/collection-proxy.js";
import "./association-relation.js";

registerModel(Developer);
registerModel(Comment);
registerModel(Post);
registerModel(Project);
registerModel(Ship);

function expectedUsec(ts: RubyTime | Temporal.Instant | Temporal.PlainDateTime): string {
  const dt =
    ts instanceof RubyTime
      ? ts.getutc().toTime()
      : ts instanceof Temporal.Instant
        ? ts.toZonedDateTimeISO("UTC")
        : ts.toZonedDateTime("UTC");
  const y = dt.year.toString().padStart(4, "0");
  const mo = dt.month.toString().padStart(2, "0");
  const day = dt.day.toString().padStart(2, "0");
  const h = dt.hour.toString().padStart(2, "0");
  const mi = dt.minute.toString().padStart(2, "0");
  const s = dt.second.toString().padStart(2, "0");
  const us = (dt.millisecond * 1000 + dt.microsecond).toString().padStart(6, "0");
  return `${y}${mo}${day}${h}${mi}${s}${us}`;
}

function withCollectionCacheVersioning(fn: () => Promise<void>): Promise<void> {
  const original = Base.collectionCacheVersioning;
  Base.collectionCacheVersioning = true;
  return fn().finally(() => {
    Base.collectionCacheVersioning = original;
  });
}

describe("CollectionCacheKeyTest", () => {
  const { topics, projects } = fixtures([
    "developers",
    "developersProjects",
    "projects",
    "topics",
    "comments",
    "posts",
  ]);

  it("collection_cache_key on model", async () => {
    const key = await Developer.collectionCacheKey();
    expect(key).toMatch(/^developers\/query-[0-9a-f]+-\d+-\d+$/);
  });

  it("cache_key for relation", async () => {
    const developers = Developer.where({ salary: 100000 }).order({ updated_at: "desc" });
    const lastDeveloperTimestamp = ((await developers.first()) as Developer).updated_at as RubyTime;

    expect(await developers.cacheKey()).toMatch(/^developers\/query-[0-9a-f]+-\d+-\d+$/);

    const m = (await developers.cacheKey()).match(/^developers\/query-([0-9a-f]+)-(\d+)-(\d+)$/)!;
    expect(m[1]).toBe(hexdigest(developers.toSql()));
    expect(m[2]).toBe(String(await developers.count()));
    expect(m[3]).toBe(expectedUsec(lastDeveloperTimestamp));
  });

  it("cache_key for relation with limit", async () => {
    const developers = Developer.where({ salary: 100000 }).order({ updated_at: "desc" }).limit(5);
    const lastDeveloperTimestamp = ((await developers.first()) as Developer).updated_at as RubyTime;

    expect(await developers.cacheKey()).toMatch(/^developers\/query-[0-9a-f]+-\d+-\d+$/);

    const m = (await developers.cacheKey()).match(/^developers\/query-([0-9a-f]+)-(\d+)-(\d+)$/)!;
    expect(m[1]).toBe(hexdigest(developers.toSql()));
    expect(m[2]).toBe(String(await developers.count()));
    expect(m[3]).toBe(expectedUsec(lastDeveloperTimestamp));
  });

  it("cache_key for relation with custom select and limit", async () => {
    const developers = Developer.where({ salary: 100000 }).order({ updated_at: "desc" }).limit(5);
    const developersWithSelect = developers.select("developers.*");
    const lastDeveloperTimestamp = ((await developers.first()) as Developer).updated_at as RubyTime;

    expect(await developersWithSelect.cacheKey()).toMatch(/^developers\/query-[0-9a-f]+-\d+-\d+$/);

    const m = (await developersWithSelect.cacheKey()).match(
      /^developers\/query-([0-9a-f]+)-(\d+)-(\d+)$/,
    )!;
    expect(m[1]).toBe(hexdigest(developersWithSelect.toSql()));
    expect(m[2]).toBe(String(await developers.count()));
    expect(m[3]).toBe(expectedUsec(lastDeveloperTimestamp));
  });

  it("cache_key for loaded relation", async () => {
    const developers = await Developer.where({ salary: 100000 })
      .order({ updated_at: "desc" })
      .limit(5)
      .load();
    const lastDeveloperTimestamp = ((await developers.first()) as Developer).updated_at as RubyTime;

    expect(await developers.cacheKey()).toMatch(/^developers\/query-[0-9a-f]+-\d+-\d+$/);

    const m = (await developers.cacheKey()).match(/^developers\/query-([0-9a-f]+)-(\d+)-(\d+)$/)!;
    expect(m[1]).toBe(hexdigest(developers.toSql()));
    expect(m[2]).toBe(String(await developers.count()));
    expect(m[3]).toBe(expectedUsec(lastDeveloperTimestamp));
  });

  it("cache_key for relation with table alias", async () => {
    const tableAlias = Developer.arelTable.alias("omg_developers");

    let developers = new Relation(Developer, tableAlias);
    developers = developers.where({ salary: 100000 }).order({ updated_at: "desc" });
    const lastDeveloperTimestamp = ((await developers.first()) as Developer).updated_at as RubyTime;

    expect(await developers.cacheKey()).toMatch(/^developers\/query-[0-9a-f]+-\d+-\d+$/);

    const m = (await developers.cacheKey()).match(/^developers\/query-([0-9a-f]+)-(\d+)-(\d+)$/)!;
    expect(m[1]).toBe(hexdigest(developers.toSql()));
    expect(m[2]).toBe(String(await developers.count()));
    expect(m[3]).toBe(expectedUsec(lastDeveloperTimestamp));
  });

  it("cache_key for relation with includes", async () => {
    const comments = Comment.includes(":post").where({ "posts.type": "Post" });
    expect(await comments.cacheKey()).toMatch(/^comments\/query-[0-9a-f]+-\d+-\d+$/);
  });

  it("cache_key for loaded relation with includes", async () => {
    const comments = await Comment.includes(":post").where({ "posts.type": "Post" }).load();
    expect(await comments.cacheKey()).toMatch(/^comments\/query-[0-9a-f]+-\d+-\d+$/);
  });

  it("update_all will update cache_key", async () => {
    const developers = Developer.where({ name: "David" });
    const cacheKey = await developers.cacheKey();

    await developers.updateAll({ updated_at: Temporal.Now.instant() });

    expect(await developers.cacheKey()).not.toBe(cacheKey);
  });

  it("update_all with includes will update cache_key", async () => {
    const developers = Developer.includes(":projects").where({ "projects.name": "Active Record" });
    const cacheKey = await developers.cacheKey();

    await developers.updateAll({ updated_at: Temporal.Now.instant() });

    expect(await developers.cacheKey()).not.toBe(cacheKey);
  });

  it("delete_all will update cache_key", async () => {
    const developers = Developer.where({ name: "David" });
    const cacheKey = await developers.cacheKey();

    await developers.deleteAll();

    expect(await developers.cacheKey()).not.toBe(cacheKey);
  });

  it("delete_all with includes will update cache_key", async () => {
    const developers = Developer.includes(":projects").where({ "projects.name": "Active Record" });
    const cacheKey = await developers.cacheKey();

    await developers.deleteAll();

    expect(await developers.cacheKey()).not.toBe(cacheKey);
  });

  it("destroy_all will update cache_key", async () => {
    const developers = Developer.where({ name: "David" });
    const cacheKey = await developers.cacheKey();

    await developers.destroyAll();

    expect(await developers.cacheKey()).not.toBe(cacheKey);
  });

  it("it triggers at most one query", async () => {
    const developers = Developer.where({ name: "David" });

    await assertQueriesCount(1, false, async () => {
      await developers.cacheKey();
    });
    await assertNoQueries(false, async () => {
      await developers.cacheKey();
    });
  });

  it("it doesn't trigger any query if the relation is already loaded", async () => {
    const developers = await Developer.where({ name: "David" }).load();
    await assertNoQueries(false, async () => {
      await developers.cacheKey();
    });
  });

  it("it doesn't trigger any query if collection_cache_versioning is enabled", async () => {
    await withCollectionCacheVersioning(async () => {
      const developers = Developer.where({ name: "David" });
      await assertNoQueries(false, async () => {
        await developers.cacheKey();
      });
    });
  });

  it("relation cache_key changes when the sql query changes", async () => {
    const developers = Developer.where({ name: "David" });
    const otherRelation = Developer.where({ name: "David" }).where("1 = 1");

    expect(await developers.cacheKey()).not.toBe(await otherRelation.cacheKey());
  });

  it("cache_key for empty relation", async () => {
    const developers = Developer.where({ name: "Non Existent Developer" });
    expect(await developers.cacheKey()).toMatch(/^developers\/query-[0-9a-f]+-0$/);
  });

  it("cache_key with custom timestamp column", async () => {
    const topicsRel = Topic.where("title like ?", "%Topic%");
    const lastTopicTimestamp = expectedUsec(topics("fifth").written_on);
    expect(await topicsRel.cacheKey("written_on")).toMatch(lastTopicTimestamp);
  });

  it("cache_key with unknown timestamp column", async () => {
    const topicsRel = Topic.where("title like ?", "%Topic%");
    await expect(topicsRel.cacheKey("published_at")).rejects.toThrow(StatementInvalid);
  });

  it("collection proxy provides a cache_key", async () => {
    const developers = (projects("active_record") as unknown as { developers: Relation<Developer> })
      .developers;
    expect(await developers.cacheKey()).toMatch(/^developers\/query-[0-9a-f]+-\d+-\d+$/);
  });

  it("cache_key for loaded collection with zero size", async () => {
    await Comment.deleteAll();
    const posts = Post.includes(":comments");
    const emptyLoadedCollection = (
      (await posts.first()) as unknown as { comments: Relation<Comment> }
    ).comments;

    expect(await emptyLoadedCollection.cacheKey()).toMatch(/^comments\/query-[0-9a-f]+-0$/);
  });

  it("cache_key for queries with offset which return 0 rows", async () => {
    const developers = Developer.offset(20);
    expect(await developers.cacheKey()).toMatch(/^developers\/query-[0-9a-f]+-0$/);
  });

  it("cache_key with a relation having selected columns", async () => {
    const developers = Developer.select("salary");
    expect(await developers.cacheKey()).toMatch(/^developers\/query-[0-9a-f]+-\d+-\d+$/);
  });

  it("cache_key with a relation having distinct and order", async () => {
    const developers = Developer.distinct().order("salary").limit(5);

    expect(await developers.cacheKey()).toMatch(/^developers\/query-[0-9a-f]+-\d+-\d+$/);
    assertNotPredicate(developers, (d) => d.isLoaded);
  });

  it("cache_key with a relation having custom select and order", async () => {
    const developers = Developer.select("name AS dev_name").order("dev_name DESC").limit(5);

    expect(await developers.cacheKey()).toMatch(/^developers\/query-[0-9a-f]+-\d+-\d+$/);
  });

  it("cache_key should be stable when using collection_cache_versioning", async () => {
    await withCollectionCacheVersioning(async () => {
      const developers = Developer.where({ salary: 100000 });

      expect(await developers.cacheKey()).toMatch(/^developers\/query-[0-9a-f]+$/);

      const m = (await developers.cacheKey()).match(/^developers\/query-([0-9a-f]+)$/)!;
      expect(m[1]).toBe(hexdigest(developers.toSql()));
    });
  });

  it("cache_version for relation", async () => {
    await withCollectionCacheVersioning(async () => {
      const developers = Developer.where({ salary: 100000 }).order({ updated_at: "desc" });
      const lastDeveloperTimestamp = ((await developers.first()) as Developer)
        .updated_at as RubyTime;

      const version = await developers.cacheVersion();
      expect(version).toMatch(/(\d+)-(\d+)$/);

      const m = version!.match(/(\d+)-(\d+)$/)!;
      expect(m[1]).toBe(String(await developers.count()));
      expect(m[2]).toBe(expectedUsec(lastDeveloperTimestamp));
    });
  });

  it("reset will reset cache_version", async () => {
    await withCollectionCacheVersioning(async () => {
      const developers = Developer.all();

      expect(await developers.cacheVersion()).toBe(await Developer.all().cacheVersion());

      await Developer.updateAll({
        updated_at: Temporal.Now.instant().add({ seconds: 1 }),
      });
      developers.reset();

      expect(await developers.cacheVersion()).toBe(await Developer.all().cacheVersion());
    });
  });

  it("cache_key_with_version contains key and version regardless of collection_cache_versioning setting", async () => {
    const keyWithVersion1 = await Developer.all().cacheKeyWithVersion();
    expect(keyWithVersion1).toMatch(/^developers\/query-[0-9a-f]+-\d+-\d+$/);

    await withCollectionCacheVersioning(async () => {
      const keyWithVersion2 = await Developer.all().cacheKeyWithVersion();
      expect(keyWithVersion2).toBe(keyWithVersion1);
    });
  });
});
