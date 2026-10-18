import { afterEach, beforeEach, describe, it } from "vitest";
import "../test-helpers/abstract-unit.js";
import { ActiveRecordTestCase } from "../test-helpers/active-record-unit.js";
import { ActionController, RouteSet } from "@blazetrails/actionpack";
import {
  MemoryStore,
  assertEqual,
  assertIncludes,
  assertNotPredicate,
  type CacheStore,
} from "@blazetrails/activesupport";
import { include } from "@blazetrails/ruby-compat";
import { FixtureResolver } from "../testing/resolvers.js";
import { PartialRenderer } from "../renderer/partial-renderer.js";
import { Topic } from "../test-helpers/fixtures/topic.js";

type DrawCallback = Parameters<RouteSet["draw"]>[0];

function testRoutes(klass: typeof ActionController.Base, block: DrawCallback): RouteSet {
  const routes = new RouteSet();
  routes.draw(block);
  include(klass, routes.urlHelpers());
  return routes;
}

ActionController.Base.viewPaths([
  new FixtureResolver({
    "test/_multifetch.html.tse": "<%= topic.title %>, rendered: <%= topic.updated_at %>",
  }),
]);

class MultifetchController extends ActionController.Base {
  static ROUTES = testRoutes(this, function () {
    this.get("cachedTrue", { to: "multifetch#cachedTrue" });
    this.get("cachedProc", { to: "multifetch#cachedProc" });
  });

  declare topics: readonly unknown[];

  async cachedTrue() {
    this.loadAllTopics();
    await this.render({
      partial: "test/multifetch",
      collection: this.topics,
      as: "topic",
      cached: true,
    });
  }

  async cachedProc() {
    this.loadAllTopics();
    await this.render({
      partial: "test/multifetch",
      collection: this.topics,
      as: "topic",
      cached: (topic: unknown) => [topic],
    });
  }

  private loadAllTopics(): void {
    this.topics = Topic.preload("replies") as never;
  }
}

type Body = { response: { body: string } };

class MultifetchCacheTest extends ActiveRecordTestCase {
  declare cacheStoreWas: CacheStore;

  static {
    this.tests(MultifetchController);
    this.fixtures("topics", "replies");
  }
}

class InspectableStore extends MemoryStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  declare data: Map<string, any>;
}

describe("MultifetchCacheTest", () => {
  let tc: MultifetchCacheTest & Body;

  beforeEach(async ({ task }) => {
    tc = new MultifetchCacheTest(task.name) as MultifetchCacheTest & Body;
    await tc.beforeSetup();
    tc.setup();
    await Topic.updateAll({ updated_at: new Date() });
    tc.cacheStoreWas = PartialRenderer.collectionCache();
    PartialRenderer.setCollectionCache(new MemoryStore());
  });

  afterEach(() => {
    PartialRenderer.setCollectionCache(tc.cacheStoreWas);
    tc.teardown();
  });

  it("only preloading for records that miss the cache", async () => {
    await Topic.updateAll({ title: "title" });

    const firstReq = await tc.captureSql(() => tc.get("cachedTrue"));
    assertEqual(3, tc.response.body.match(/title/g)!.length);
    assertEqual(2, firstReq.length);
    assertIncludes(firstReq.at(-1), `WHERE "replies"."topic_id" IN (?, ?, ?)`);

    await (await Topic.first())!.update({ updated_at: new Date(Date.now() - 3600 * 1000) });

    const secondReq = await tc.captureSql(() => tc.get("cachedTrue"));
    assertEqual(3, tc.response.body.match(/title/g)!.length);
    assertEqual(2, secondReq.length);
    assertEqual(firstReq[0], secondReq[0]);
    assertIncludes(secondReq.at(-1), `WHERE "replies"."topic_id" = ?`);
  });

  it("preloads all records if using cached proc", async () => {
    await Topic.updateAll({ title: "title" });

    const firstReq = await tc.captureSql(() => tc.get("cachedProc"));
    assertEqual(3, tc.response.body.match(/title/g)!.length);
    assertEqual(2, firstReq.length);
    assertIncludes(firstReq.at(-1), `WHERE "replies"."topic_id" IN (?, ?, ?)`);

    await (await Topic.first())!.update({ updated_at: new Date(Date.now() - 3600 * 1000) });

    const secondReq = await tc.captureSql(() => tc.get("cachedProc"));
    assertEqual(3, tc.response.body.match(/title/g)!.length);
    assertEqual(2, secondReq.length);
    assertEqual(firstReq[0], secondReq[0]);
    assertIncludes(secondReq.at(-1), `WHERE "replies"."topic_id" IN (?, ?, ?)`);
  });

  it("fragments are stored as bare strings", async () => {
    const cache = new InspectableStore();
    PartialRenderer.setCollectionCache(cache);
    await Topic.updateAll({ title: "title" });
    await tc.get("cachedTrue");

    assertNotPredicate(cache.data, (data) => data.size === 0);
    for (const entry of cache.data.values()) {
      assertEqual("string", typeof entry.value);
    }
  });
});
