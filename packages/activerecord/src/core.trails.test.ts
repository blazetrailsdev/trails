/**
 * trails-specific invariants relocated from core.test.ts (RFC 0043).
 * These guard documented trails implementation behavior that has no
 * Rails counterpart test, so they live in a `.trails.test.ts` sibling.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { fixtures } from "./test-fixtures.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Base } from "./index.js";
import { DatabaseConfigurations } from "./database-configurations.js";
import { BetterSQLite3Adapter } from "./connection-adapters/better-sqlite3-adapter.js";

describe("frozen / isFrozen", () => {
  fixtures(["topics"]);

  it("deleting an unpersisted record still marks it destroyed and frozen", async () => {
    // Matches Rails' `delete` which only issues the DELETE when persisted?
    // is true, but always ends with `@destroyed = true; freeze`.
    const topic = new Topic({ title: "Alice" });
    await topic.delete();
    expect(topic.isDestroyed()).toBe(true);
    expect(topic.isFrozen()).toBe(true);
  });

  // Rails: ActiveRecord::Core#freeze aliases @attributes = @attributes.clone.freeze.
  // Verifies our implementation backs isFrozen() by freezing the AttributeSet,
  // and that the pre-freeze reference is left untouched so records sharing
  // an attribute map (e.g. via clone/becomes) aren't frozen together.
  it("freeze clones the attribute set so prior references stay mutable", async () => {
    const topic = await Topic.create({ title: "Alice" });
    const attrsOf = (record: Topic) =>
      (record as unknown as { _attributes: { isFrozen(): boolean } })._attributes;
    const preFreezeAttrs = attrsOf(topic);
    topic.freeze();
    expect(topic.isFrozen()).toBe(true);
    expect(attrsOf(topic)).not.toBe(preFreezeAttrs);
    expect(preFreezeAttrs.isFrozen()).toBe(false);
    // The frozen clone is what the record now exposes.
    expect(attrsOf(topic).isFrozen()).toBe(true);
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
        // No handler-registered pool for this name, so `connectionPool()`
        // throws — the shape `adapters/postgresql/datatype.test.ts` hits under
        // AR_NO_AUTO_SCHEMA, where only the assigned adapter can serve queries.
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
    // Seeded through the assigned adapter only, so a lookup that leased from
    // the ambient Base pool (whose canonical `topics` table lacks this row)
    // would come back empty instead of quietly reading the wrong database.
    await adapter.exec("INSERT INTO topics (id, title) VALUES (42, 'Alice')");
    expect((await DirectTopic.find(42)).readAttribute("title")).toBe("Alice");
    expect((await DirectTopic.findBy({ title: "Alice" }))!.id).toBe(42);
  });

  it("insertAll resolves through the assigned adapter without a pool", async () => {
    await DirectTopic.insertAll([{ title: "Bob" }]);
    expect(await DirectTopic.count()).toBe(1);
  });
});

// Rails stores the registry in the class variable `@@configurations`
// (core.rb:71-79), so there is one registry per process. JS statics would
// instead shadow per class, which has no Rails counterpart test — hence
// this trails-side guard.
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

  // Rails names the `Base` constant literally in
  // `resolve_config_for_connection` (connection_handling.rb:385-391), so a
  // model-local `configurations` is never consulted. JS would otherwise
  // dispatch the read through the receiver.
  it("resolveConfigForConnection ignores a model-local configurations override", async () => {
    const { resolveConfigForConnection } = await import("./connection-handling.js");

    Base.configurations({
      global_registry_env: { primary: { adapter: "sqlite3", database: "db/global.sqlite3" } },
    });

    class OverridingModel extends Base {
      static configurations(): DatabaseConfigurations {
        return DatabaseConfigurations.fromEnv({
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
