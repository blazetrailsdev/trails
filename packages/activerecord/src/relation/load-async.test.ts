import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { Thread, setEnv } from "@blazetrails/ruby-compat";
import { Notifications, getEnv, type NotificationEvent } from "@blazetrails/activesupport";
import { asyncQueryExecutor, setAsyncQueryExecutor } from "../active-record.js";
import { Rollback } from "../errors.js";
import type { Relation } from "../relation.js";
import { CategoryPost, Post } from "../test-helpers/models/post.js";
import { Category } from "../test-helpers/models/category.js";
import { Comment } from "../test-helpers/models/comment.js";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-fixtures.js";
import { inMemoryDb } from "../support/adapter-helper.js";
import { cleanUpConnectionHandler, waitForAsyncQuery } from "../cases/helper.js";
import { Base } from "../base.js";
import { ARUnit2Model } from "../test-helpers/models/arunit2-model.js";
import { OtherDog } from "../test-helpers/models/other-dog.js";
import { assertQueriesCount } from "../testing/query-assertions.js";

type Status = { executed?: boolean; async?: unknown };

describe("LoadAsyncTest", () => {
  fixtures(["posts", "comments", "categories", "categoriesPosts"]);

  for (const model of [Category, CategoryPost, Comment]) registerModel(model);

  it("scheduled?", async () => {
    const deferredPosts = Post.where({ author_id: 1 }).loadAsync();
    if (inMemoryDb()) {
      expect(deferredPosts.isScheduled).toBeFalsy();
    } else {
      expect(deferredPosts.isScheduled).toBeTruthy();
    }
    expect(deferredPosts.isLoaded).toBeTruthy();
    await deferredPosts;
    expect(deferredPosts.isScheduled).toBeFalsy();
  });
  it("null scheduled?", async () => {
    const deferredNullPosts = Post.none().loadAsync();
    if (inMemoryDb()) {
      expect(deferredNullPosts.isScheduled).toBeFalsy();
    } else {
      expect(deferredNullPosts.isScheduled).toBeTruthy();
    }
    expect(deferredNullPosts.isLoaded).toBeTruthy();
    await deferredNullPosts;
    expect(deferredNullPosts.isScheduled).toBeFalsy();
  });
  it("reset", () => {
    const deferredPosts = Post.where({ author_id: 1 }).loadAsync();
    if (inMemoryDb()) {
      expect(deferredPosts.isScheduled).toBeFalsy();
    } else {
      expect(deferredPosts.isScheduled).toBeTruthy();
    }
    deferredPosts.reset();
    expect(deferredPosts.isScheduled).toBeFalsy();
  });
  it.skipIf(inMemoryDb())("load async has many association", async () => {
    const post = (await Post.first())!;

    const deferedComments = post.comments.loadAsync();
    expect(deferedComments.isScheduled).toBeTruthy();

    const events: NotificationEvent[] = [];
    const callback = (event: NotificationEvent) => {
      if (event.payload.name !== "SCHEMA") events.push(event);
    };

    await waitForAsyncQuery();
    await Notifications.subscribed(callback, "sql.active_record", async () => {
      await deferedComments;
    });

    expect(events.map((e) => [e.payload.name, e.payload.async])).toEqual([["Comment Load", true]]);
    expect(post.comments.isLoaded).toBeFalsy();
  });
  it.skipIf(inMemoryDb())("load async has many through association", async () => {
    const post = (await Post.first())!;

    const deferedCategories = post.scategories.loadAsync();
    expect(deferedCategories.isScheduled).toBeTruthy();

    const events: NotificationEvent[] = [];
    const callback = (event: NotificationEvent) => {
      if (event.payload.name !== "SCHEMA") events.push(event);
    };

    await waitForAsyncQuery();
    await Notifications.subscribed(callback, "sql.active_record", async () => {
      await deferedCategories;
    });

    expect(events.map((e) => [e.payload.name, e.payload.async])).toEqual([["Category Load", true]]);
    expect(post.scategories.isLoaded).toBeFalsy();
  });
  it("notification forwarding", async () => {
    const expectedRecords = await Post.where({ author_id: 1 });

    const status: {
      executed?: boolean;
      async?: unknown;
      thread_id?: unknown;
      lock_wait?: unknown;
    } = {};
    const subscriber = Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
      if (event.payload.name === "Post Load") {
        status.executed = true;
        status.async = event.payload.async;
        status.thread_id = Thread.current().id;
        status.lock_wait = event.payload.lock_wait;
      }
    });

    try {
      const deferredPosts = Post.where({ author_id: 1 }).loadAsync();
      await waitForAsyncQuery();

      expect(await deferredPosts).toEqual(expectedRecords);
      expect(status.async).toEqual((await Post.leaseConnection()).supportsConcurrentConnections());
      expect(status.thread_id).toEqual(Thread.current().id);
      if ((await Post.leaseConnection()).supportsConcurrentConnections()) {
        expect(Object(status.lock_wait)).toBeInstanceOf(Number);
      } else {
        expect(status.lock_wait).toBeUndefined();
      }
    } finally {
      Notifications.unsubscribe(subscriber);
    }
  });
  it("simple query", async () => {
    const expectedRecords = await Post.where({ author_id: 1 });

    const status: Status = {};

    const subscriber = Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
      if (event.payload.name === "Post Load") {
        status.executed = true;
        status.async = event.payload.async;
      }
    });

    try {
      const deferredPosts = Post.where({ author_id: 1 }).loadAsync();
      await waitForAsyncQuery();

      expect(await deferredPosts).toEqual(expectedRecords);
      const connection = await Post.leaseConnection();
      expect(status.async).toEqual(connection.supportsConcurrentConnections());
    } finally {
      if (subscriber) Notifications.unsubscribe(subscriber);
    }
  });
  it("load async from transaction", async () => {
    let posts = null as Relation<Post> | null;
    await Post.transaction(async () => {
      await Post.where({ author_id: 1 }).updateAll({ title: "In Transaction" });
      posts = Post.where({ author_id: 1 }).loadAsync();
      if (inMemoryDb()) {
        expect(posts.isScheduled).toBeFalsy();
      } else {
        expect(posts.isScheduled).toBeTruthy();
      }
      expect(posts.isLoaded).toBeTruthy();
      throw new Rollback();
    });

    expect(posts).not.toBeNull();
    expect([...new Set((await posts!).map((post) => post.title))]).toEqual(["In Transaction"]);
  });
  it.skip("load async instrumentation is thread safe", () => {});
  it("eager loading query", async () => {
    const expectedRecords = await Post.where({ author_id: 1 }).eagerLoad("comments");

    const status: Status = {};

    const subscriber = Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
      if (event.payload.name === "SQL") {
        status.executed = true;
        status.async = event.payload.async;
      }
    });

    try {
      const deferredPosts = Post.where({ author_id: 1 }).eagerLoad("comments").loadAsync();
      await waitForAsyncQuery();

      if (inMemoryDb()) {
        expect(deferredPosts.isScheduled).toBeFalsy();
      } else {
        expect(deferredPosts.isScheduled).toBeTruthy();
      }
      expect(await deferredPosts).toEqual(expectedRecords);
      await assertQueriesCount(0, false, async () => {
        for (const post of await deferredPosts) await post.comments;
      });
      const connection = await Post.leaseConnection();
      expect(status.async).toEqual(connection.supportsConcurrentConnections());
    } finally {
      if (subscriber) Notifications.unsubscribe(subscriber);
    }
  });
  it("contradiction", async () => {
    await assertQueriesCount(0, false, async () => {
      expect(await Post.where({ id: [] }).loadAsync()).toEqual([]);
    });

    Post.where({ id: [] }).loadAsync().reset();
  });
  it("pluck", async () => {
    const titles = await Post.where({ author_id: 1 }).pluck("title");
    expect(await Post.where({ author_id: 1 }).loadAsync().pluck("title")).toEqual(titles);
  });
  it("count", async () => {
    const count = await Post.where({ author_id: 1 }).count();
    expect(await Post.where({ author_id: 1 }).loadAsync().count()).toEqual(count);
  });
  it("size", async () => {
    const expectedSize = await Post.where({ author_id: 1 }).size();

    const deferredPosts = Post.where({ author_id: 1 }).loadAsync();

    expect(await deferredPosts.size()).toEqual(expectedSize);
    expect(deferredPosts.isLoaded).toBeTruthy();
  });
  it("empty?", async () => {
    const deferredPosts = Post.where({ author_id: 1 }).loadAsync();

    expect(await deferredPosts.isEmpty()).toEqual(false);
    expect(deferredPosts.isLoaded).toBeTruthy();
  });
  it("load async pluck with query cache", async () => {
    const titles = await Post.where({ author_id: 1 }).pluck("title");
    await Post.cache(async () => {
      expect(await Post.where({ author_id: 1 }).loadAsync().pluck("title")).toEqual(titles);
    });
  });
  it("load async count with query cache", async () => {
    const count = await Post.where({ author_id: 1 }).count();
    await Post.cache(async () => {
      expect(await Post.where({ author_id: 1 }).loadAsync().count()).toEqual(count);
    });
  });
});

describe.skipIf(inMemoryDb())("LoadAsyncNullExecutorTest", () => {
  fixtures(["posts", "comments"]);

  let oldConfig: ReturnType<typeof asyncQueryExecutor>;

  beforeEach(() => {
    oldConfig = asyncQueryExecutor();
    setAsyncQueryExecutor(null);
  });

  afterEach(() => {
    setAsyncQueryExecutor(oldConfig);
  });

  it("scheduled?", async () => {
    const deferredPosts = Post.where({ author_id: 1 }).loadAsync();
    expect(deferredPosts.isScheduled).toBeFalsy();
    expect(deferredPosts.isLoaded).toBeTruthy();
    await deferredPosts;
    expect(deferredPosts.isScheduled).toBeFalsy();
  });
  it("reset", () => {
    const deferredPosts = Post.where({ author_id: 1 }).loadAsync();
    expect(deferredPosts.isScheduled).toBeFalsy();
    deferredPosts.reset();
    expect(deferredPosts.isScheduled).toBeFalsy();
  });
  it("simple query", async () => {
    const expectedRecords = await Post.where({ author_id: 1 });

    const status: Status = {};

    const subscriber = Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
      if (event.payload.name === "Post Load") {
        status.executed = true;
        status.async = event.payload.async;
      }
    });

    try {
      const deferredPosts = Post.where({ author_id: 1 }).loadAsync();

      expect(await deferredPosts).toEqual(expectedRecords);
      const connection = await Post.leaseConnection();
      expect(status.async).not.toEqual(connection.supportsConcurrentConnections());
    } finally {
      if (subscriber) Notifications.unsubscribe(subscriber);
    }
  });
  it("load async from transaction", async () => {
    let posts = null as Relation<Post> | null;
    await Post.transaction(async () => {
      await Post.where({ author_id: 1 }).updateAll({ title: "In Transaction" });
      posts = Post.where({ author_id: 1 }).loadAsync();
      expect(posts.isScheduled).toBeFalsy();
      expect(posts.isLoaded).toBeTruthy();
      throw new Rollback();
    });

    expect(posts).not.toBeNull();
    expect([...new Set((await posts!).map((post) => post.title))]).toEqual(["In Transaction"]);
  });
  it("eager loading query", async () => {
    const expectedRecords = await Post.where({ author_id: 1 }).eagerLoad("comments");

    const status: Status = {};

    const subscriber = Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
      if (event.payload.name === "SQL") {
        status.executed = true;
        status.async = event.payload.async;
      }
    });

    try {
      const deferredPosts = Post.where({ author_id: 1 }).eagerLoad("comments").loadAsync();

      expect(deferredPosts.isScheduled).toBeFalsy();
      expect(await deferredPosts).toEqual(expectedRecords);
      await assertQueriesCount(0, false, async () => {
        for (const post of await deferredPosts) await post.comments;
      });

      const connection = await Post.leaseConnection();
      expect(connection.supportsConcurrentConnections()).toBeTruthy();
      expect(status.async, "Expected status[:async] to be false with NullExecutor").toBeFalsy();
    } finally {
      if (subscriber) Notifications.unsubscribe(subscriber);
    }
  });
  it("contradiction", async () => {
    await assertQueriesCount(0, false, async () => {
      expect(await Post.where({ id: [] }).loadAsync()).toEqual([]);
    });

    Post.where({ id: [] }).loadAsync().reset();
  });
  it("pluck", async () => {
    const titles = await Post.where({ author_id: 1 }).pluck("title");
    expect(await Post.where({ author_id: 1 }).loadAsync().pluck("title")).toEqual(titles);
  });
  it("size", async () => {
    const expectedSize = await Post.where({ author_id: 1 }).size();

    const deferredPosts = Post.where({ author_id: 1 }).loadAsync();

    expect(await deferredPosts.size()).toEqual(expectedSize);
    expect(deferredPosts.isLoaded).toBeTruthy();
  });
  it("empty?", async () => {
    const deferredPosts = Post.where({ author_id: 1 }).loadAsync();

    expect(await deferredPosts.isEmpty()).toEqual(false);
    expect(deferredPosts.isLoaded).toBeTruthy();
  });
});

describe.skipIf(inMemoryDb())("LoadAsyncMultiThreadPoolExecutorTest", () => {
  fixtures(["posts", "comments"]);

  let oldConfig: ReturnType<typeof asyncQueryExecutor>;

  beforeEach(async () => {
    oldConfig = asyncQueryExecutor();
    setAsyncQueryExecutor("multi_thread_pool");

    const configHash1 = {
      ...Base.connectionPool().dbConfig.configurationHash,
      minThreads: 0,
      maxThreads: 10,
    };
    const configHash2 = {
      ...ARUnit2Model.connectionPool().dbConfig.configurationHash,
      minThreads: 0,
      maxThreads: 10,
    };

    await Base.establishConnection(configHash1);
    await ARUnit2Model.establishConnection(configHash2);
  });

  afterEach(async () => {
    setAsyncQueryExecutor(oldConfig);
    cleanUpConnectionHandler();
    await Base.establishConnection(":arunit");
    await ARUnit2Model.establishConnection(":arunit2");
  });

  it("async query executor and configuration", () => {
    expect(asyncQueryExecutor()).toEqual("multi_thread_pool");

    expect(Base.connectionPool().dbConfig.configurationHash.minThreads).toEqual(0);
    expect(ARUnit2Model.connectionPool().dbConfig.configurationHash.minThreads).toEqual(0);

    expect(Base.connectionPool().dbConfig.configurationHash.maxThreads).toEqual(10);
    expect(ARUnit2Model.connectionPool().dbConfig.configurationHash.maxThreads).toEqual(10);
  });
  it("scheduled?", async () => {
    const deferredPosts = Post.where({ author_id: 1 }).loadAsync();
    expect(deferredPosts.isScheduled).toBeTruthy();
    expect(deferredPosts.isLoaded).toBeTruthy();
    await deferredPosts;
    expect(deferredPosts.isScheduled).toBeFalsy();
  });
  it("reset", () => {
    const deferredPosts = Post.where({ author_id: 1 }).loadAsync();
    expect(deferredPosts.isScheduled).toBeTruthy();
    deferredPosts.reset();
    expect(deferredPosts.isScheduled).toBeFalsy();
  });
  it("simple query", async () => {
    const expectedRecords = await Post.where({ author_id: 1 });

    const status: Status = {};
    const subscriber = Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
      if (event.payload.name === "Post Load") {
        status.executed = true;
        status.async = event.payload.async;
      }
    });

    try {
      const deferredPosts = Post.where({ author_id: 1 }).loadAsync();
      await waitForAsyncQuery();

      expect(await deferredPosts).toEqual(expectedRecords);
      const connection = await Post.leaseConnection();
      expect(status.async).toEqual(connection.supportsConcurrentConnections());
    } finally {
      if (subscriber) Notifications.unsubscribe(subscriber);
    }
  });
  it("load async from transaction", async () => {
    let posts = null as Relation<Post> | null;
    await Post.transaction(async () => {
      await Post.where({ author_id: 1 }).updateAll({ title: "In Transaction" });
      posts = Post.where({ author_id: 1 }).loadAsync();
      expect(posts.isScheduled).toBeTruthy();
      expect(posts.isLoaded).toBeTruthy();
      throw new Rollback();
    });

    expect(posts).not.toBeNull();
    expect([...new Set((await posts!).map((post) => post.title))]).toEqual(["In Transaction"]);
  });
  it("eager loading query", async () => {
    const expectedRecords = await Post.where({ author_id: 1 }).eagerLoad("comments");

    const status: Status = {};
    const subscriber = Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
      if (event.payload.name === "SQL") {
        status.executed = true;
        status.async = event.payload.async;
      }
    });

    try {
      const deferredPosts = Post.where({ author_id: 1 }).eagerLoad("comments").loadAsync();
      await waitForAsyncQuery();

      expect(deferredPosts.isScheduled).toBeTruthy();

      expect(await deferredPosts).toEqual(expectedRecords);
      await assertQueriesCount(0, false, async () => {
        for (const post of await deferredPosts) await post.comments;
      });
      const connection = await Post.leaseConnection();
      expect(status.async).toEqual(connection.supportsConcurrentConnections());
    } finally {
      if (subscriber) Notifications.unsubscribe(subscriber);
    }
  });
  it("contradiction", async () => {
    await assertQueriesCount(0, false, async () => {
      expect(await Post.where({ id: [] }).loadAsync()).toEqual([]);
    });

    Post.where({ id: [] }).loadAsync().reset();
  });
  it("pluck", async () => {
    const titles = await Post.where({ author_id: 1 }).pluck("title");
    expect(await Post.where({ author_id: 1 }).loadAsync().pluck("title")).toEqual(titles);
  });
  it("size", async () => {
    const expectedSize = await Post.where({ author_id: 1 }).size();

    const deferredPosts = Post.where({ author_id: 1 }).loadAsync();

    expect(await deferredPosts.size()).toEqual(expectedSize);
    expect(deferredPosts.isLoaded).toBeTruthy();
  });
  it("empty?", async () => {
    const deferredPosts = Post.where({ author_id: 1 }).loadAsync();

    expect(await deferredPosts.isEmpty()).toEqual(false);
    expect(deferredPosts.isLoaded).toBeTruthy();
  });
});

describe.skipIf(inMemoryDb())("LoadAsyncMixedThreadPoolExecutorTest", () => {
  fixtures(["posts", "comments", "otherDogs"]);

  let previousEnv: string | undefined;
  let oldConfig: ReturnType<typeof asyncQueryExecutor>;
  let prevConfigs: ReturnType<typeof Base.configurations>;

  beforeEach(async () => {
    previousEnv = getEnv("TRAILS_ENV");
    setEnv("TRAILS_ENV", "default_env");
    oldConfig = asyncQueryExecutor();
    setAsyncQueryExecutor("multi_thread_pool");
    const configHash1 = Base.configurations().configsFor({
      envName: "arunit",
      name: "primary",
    })!.configurationHash;
    const configHash2 = Base.configurations().configsFor({
      envName: "arunit2",
      name: "primary",
    })!.configurationHash;
    const config = {
      default_env: {
        animals: { ...configHash2, minThreads: 0, maxThreads: 0 },
        primary: { ...configHash1, minThreads: 0, maxThreads: 10 },
      },
    };
    prevConfigs = Base.configurations();
    Base.configurations(config);

    await Base.establishConnection(":primary");
    await ARUnit2Model.establishConnection(":animals");
  });

  afterEach(() => {
    setEnv("TRAILS_ENV", previousEnv);
    Base.configurations(prevConfigs);
    setAsyncQueryExecutor(oldConfig);
    cleanUpConnectionHandler();
  });

  it.skip("scheduled?", () => {});
  it("simple query", async () => {
    const expectedRecords = await Post.where({ author_id: 1 });
    const expectedDogs = await OtherDog.where({ id: 1 });

    const status: Status = {};
    const dogStatus: Status = {};

    const subscriber = Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
      if (event.payload.name === "Post Load") {
        status.executed = true;
        status.async = event.payload.async;
      }

      if (event.payload.name === "OtherDog Load") {
        dogStatus.executed = true;
        dogStatus.async = event.payload.async;
      }
    });

    try {
      const deferredPosts = Post.where({ author_id: 1 }).loadAsync();
      const deferredDogs = OtherDog.where({ id: 1 }).loadAsync();

      await waitForAsyncQuery();
      await waitForAsyncQuery();

      expect(await deferredPosts).toEqual(expectedRecords);
      expect(await deferredDogs).toEqual(expectedDogs);

      expect(status.async).toEqual((await Post.leaseConnection()).isAsyncEnabled());
      expect(dogStatus.async).toEqual((await OtherDog.leaseConnection()).isAsyncEnabled());
    } finally {
      if (subscriber) Notifications.unsubscribe(subscriber);
    }
  });
});
