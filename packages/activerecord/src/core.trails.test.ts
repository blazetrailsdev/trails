import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { fixtures } from "./test-fixtures.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Reply } from "./test-helpers/models/reply.js";
import { Base } from "./index.js";
import { DatabaseConfigurations } from "./database-configurations.js";
import { BetterSQLite3Adapter } from "./connection-adapters/better-sqlite3-adapter.js";

describe("frozen / isFrozen", () => {
  fixtures(["topics"]);

  it("deleting an unpersisted record still marks it destroyed and frozen", async () => {
    const topic = new Topic({ title: "Alice" });
    await topic.delete();
    expect(topic.isDestroyed()).toBe(true);
    expect(topic.isFrozen()).toBe(true);
  });

  it("freeze clones the attribute set so prior references stay mutable", async () => {
    const topic = await Topic.create({ title: "Alice" });
    const attrsOf = (record: Topic) => (record as unknown as { _attributes: object })._attributes;
    const preFreezeAttrs = attrsOf(topic);
    topic.freeze();
    expect(topic.isFrozen()).toBe(true);
    expect(attrsOf(topic)).not.toBe(preFreezeAttrs);
    expect(Object.isFrozen(preFreezeAttrs)).toBe(false);
    expect(Object.isFrozen(attrsOf(topic))).toBe(true);
  });
});

describe("connection checkout in cached find paths", () => {
  fixtures(["topics"]);

  const banConnectionGetter = (klass: object) => {
    Object.defineProperty(klass, "connection", {
      configurable: true,
      get() {
        throw new Error("Base.connection is banned: use withConnection");
      },
    });
    return () => {
      delete (klass as Record<string, unknown>)["connection"];
    };
  };

  it("find(id) does not read the deprecated connection getter", async () => {
    const topic = await Topic.first();
    const restore = banConnectionGetter(Topic);
    try {
      expect((await Topic.find(topic!.id)).id).toBe(topic!.id);
    } finally {
      restore();
    }
  });

  it("findBy does not read the deprecated connection getter", async () => {
    const topic = await Topic.first();
    const restore = banConnectionGetter(Topic);
    try {
      expect((await Topic.findBy({ id: topic!.id }))!.id).toBe(topic!.id);
    } finally {
      restore();
    }
  });
});

describe("connection checkout for directly-assigned adapters", () => {
  let adapter: BetterSQLite3Adapter;
  let DirectTopic: typeof Base;

  beforeEach(async () => {
    adapter = new BetterSQLite3Adapter(":memory:");
    await adapter.exec(
      "CREATE TABLE topics (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, approved INTEGER DEFAULT 0)",
    );
    const adp = adapter;
    class TopicWithDirectAdapter extends Base {
      static tableName = "topics";
      static {
        this.connectionSpecificationName = "TopicWithDirectAdapter";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("approved", "boolean");
        this.adapter = adp;
      }
    }
    DirectTopic = TopicWithDirectAdapter;
  });

  afterEach(async () => {
    await adapter.exec("DROP TABLE IF EXISTS topics");
    await adapter.close();
  });

  it("find resolves through the assigned adapter without a pool", async () => {
    await adapter.exec("INSERT INTO topics (id, title) VALUES (42, 'Alice')");
    expect((await DirectTopic.find(42)).readAttribute("title")).toBe("Alice");
    expect((await DirectTopic.findBy({ title: "Alice" }))!.id).toBe(42);
  });

  it("insertAll resolves through the assigned adapter without a pool", async () => {
    await DirectTopic.insertAll([{ title: "Bob" }]);
    expect(await DirectTopic.count()).toBe(1);
  });
});

describe("configurations is a single process-global registry", () => {
  let priorConfigs: DatabaseConfigurations;

  beforeEach(() => {
    priorConfigs = Base.configurations();
  });

  afterEach(() => {
    Base.configurations(priorConfigs);
  });

  it("an assignment on a subclass replaces the registry for Base and its siblings", () => {
    class LeftModel extends Base {}
    class RightModel extends Base {}

    LeftModel.configurations({
      global_registry_env: { primary: { adapter: "sqlite3", database: "db/global.sqlite3" } },
    });

    for (const klass of [Base, LeftModel, RightModel]) {
      const config = klass.configurations().configsFor({ envName: "global_registry_env" })[0];
      expect(config.database).toBe("db/global.sqlite3");
    }
  });

  it("resolveConfigForConnection ignores a model-local configurations override", async () => {
    const { resolveConfigForConnection } = await import("./connection-handling.js");

    Base.configurations({
      global_registry_env: { primary: { adapter: "sqlite3", database: "db/global.sqlite3" } },
    });

    class OverridingModel extends Base {
      static configurations(): DatabaseConfigurations {
        return new DatabaseConfigurations({
          global_registry_env: { primary: { adapter: "sqlite3", database: "db/hijacked.sqlite3" } },
        });
      }
    }

    const resolved = resolveConfigForConnection.call(
      OverridingModel as unknown as typeof Base,
      "global_registry_env",
    );
    expect(resolved.database).toBe("db/global.sqlite3");
  });
});

describe("compare", () => {
  fixtures(["topics"]);

  it("orders same-class records by primary key and reports nil as undefined", async () => {
    const first = await Topic.find(1);
    const second = await Topic.find(3);

    expect(first.compare(second)).toBe(-1);
    expect(second.compare(first)).toBe(1);
    expect(first.compare(first)).toBe(0);

    expect(new Topic({ title: "a" }).compare(new Topic({ title: "b" }))).toBe(0);
    expect(first.compare(new Topic({ title: "a" }))).toBeUndefined();
    expect(first.compare("not a topic")).toBeUndefined();

    const reply = await Reply.find(2);
    expect(first.compare(reply)).toBe(-1);
    expect(reply.compare(first)).toBeUndefined();
  });
});

describe("init_internals / initialize_dup super chain", () => {
  fixtures(["topics"]);

  it("every concern's init_internals link runs on construction", () => {
    const topic = new Topic({ title: "Alice" }) as unknown as Record<string, unknown>;
    expect(topic._readonly).toBe(false);
    expect(topic._destroyedByAssociation).toBe(null);
    expect(topic._triggerUpdateCallback).toBe(null);
    expect(topic._triggerDestroyCallback).toBe(null);
    expect(topic._mutationsBeforeLastSave).toBe(null);
    expect(topic._touchAttrNames).toBe(null);
    expect(topic._skipDirtyTracking).toBe(null);
    expect(topic._touchRecord).toBe(null);
    expect((topic._associationInstances as Map<string, unknown>).size).toBe(0);
    expect(topic._alreadyCalled).toBe(null);
    expect(topic._startTransactionState).toBe(null);
    expect(topic._committedAlreadyCalled).toBe(null);
    expect(topic._newRecordBeforeLastCommit).toBe(null);
    expect(topic._deferTouchAttrs).toBe(null);
    expect(topic._touchTime).toBe(null);
  });

  it("dup runs the whole chain, including the ActiveModel links", async () => {
    const topic = await Topic.create({ title: "Alice", content: "Hello" });
    topic.title = "Bob";
    topic.errors.add("title", "is invalid");
    expect(topic.errors.size).toBe(1);

    const duped = topic.dup();

    expect(duped.errors).not.toBe(topic.errors);
    expect(duped.errors.empty).toBe(true);
    expect(topic.errors.size).toBe(1);

    expect(duped.title).toBe("Bob");
    expect(duped.isWillSaveChangeToAttribute("title")).toBe(true);
    duped.content = "Changed";
    expect(duped.isWillSaveChangeToAttribute("content")).toBe(true);
    expect(topic.isWillSaveChangeToAttribute("content")).toBe(false);
    expect(topic.content).toBe("Hello");

    expect(duped.isNewRecord()).toBe(true);
    expect(duped.id).toBe(null);
  });
});
