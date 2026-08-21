/**
 * trails-specific invariants relocated from core.test.ts (RFC 0043).
 * These guard documented trails implementation behavior that has no
 * Rails counterpart test, so they live in a `.trails.test.ts` sibling.
 */
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

describe("compare", () => {
  fixtures(["topics"]);

  // Rails' `Core#<=>` is `to_key <=> other_object.to_key`; Ruby's nil result
  // (incomparable) has no TS equivalent, so trails returns `undefined`.
  it("orders same-class records by primary key and reports nil as undefined", async () => {
    const first = await Topic.find(1);
    const second = await Topic.find(3);

    expect(first.compare(second)).toBe(-1);
    expect(second.compare(first)).toBe(1);
    expect(first.compare(first)).toBe(0);

    // Two new records both have a nil to_key, which Ruby compares as 0.
    expect(new Topic({ title: "a" }).compare(new Topic({ title: "b" }))).toBe(0);
    // A persisted record against a new one is `nil <=> [1]` — incomparable.
    expect(first.compare(new Topic({ title: "a" }))).toBeUndefined();
    expect(first.compare("not a topic")).toBeUndefined();

    // `is_a?(self.class)` is subclass-permissive in one direction only: a Reply
    // is_a? Topic, but a Topic is not is_a? Reply.
    const reply = await Reply.find(2);
    expect(first.compare(reply)).toBe(-1);
    expect(reply.compare(first)).toBeUndefined();
  });
});

describe("init_internals / initialize_dup super chain", () => {
  fixtures(["topics"]);

  // core.rb:834 is the chain root and every other concern's `init_internals`
  // opens with `super` (persistence.rb:814, attribute_methods/dirty.rb:196,
  // timestamp.rb:102, associations.rb:75, autosave_association.rb:290,
  // transactions.rb:432, touch_later.rb:49). Each hook's fields are only ever
  // assigned by the chain, so an unwired link leaves its fields `undefined`.
  it("every concern's init_internals link runs on construction", () => {
    const topic = new Topic({ title: "Alice" }) as unknown as Record<string, unknown>;
    // Core (core.rb:834-849)
    expect(topic._readonly).toBe(false);
    expect(topic._destroyedByAssociation).toBe(null);
    // Persistence (persistence.rb:814-818)
    expect(topic._triggerUpdateCallback).toBe(null);
    expect(topic._triggerDestroyCallback).toBe(null);
    // AttributeMethods::Dirty (attribute_methods/dirty.rb:196-201)
    expect(topic._mutationsBeforeLastSave).toBe(null);
    expect(topic._mutationsFromDatabase).toBe(null);
    expect(topic._touchAttrNames).toBe(null);
    expect(topic._skipDirtyTracking).toBe(null);
    // Timestamp (timestamp.rb:102-105)
    expect(topic._touchRecord).toBe(null);
    // Associations (associations.rb:75-77)
    expect((topic._associationInstances as Map<string, unknown>).size).toBe(0);
    // AutosaveAssociation (autosave_association.rb:290-293)
    expect(topic._alreadyCalled).toBe(null);
    // Transactions (transactions.rb:432-437)
    expect(topic._startTransactionState).toBe(null);
    expect(topic._committedAlreadyCalled).toBe(null);
    expect(topic._newRecordBeforeLastCommit).toBe(null);
    // TouchLater (touch_later.rb:49-52)
    expect(topic._deferTouchAttrs).toBe(null);
    expect(topic._touchTime).toBe(null);
  });

  // Core#initialize_dup (core.rb:550-562) runs the initialize callbacks and only
  // then unwinds through Locking::Optimistic (optimistic.rb:72-75) and Timestamp
  // (timestamp.rb:50-53), so the hook still observes the source's lock_version
  // and timestamps; ActiveModel's links (validations.rb:310, dirty.rb:248) sit on
  // `Model.prototype` and are reached by the same chain rather than shadowed.
  it("dup runs the whole chain, clearing only after the callbacks", async () => {
    const topic = await Topic.create({ title: "Alice", content: "Hello" });
    topic.title = "Bob";
    const duped = topic.dup();

    expect(duped.errors).not.toBe(topic.errors);
    expect(duped.title).toBe("Bob");
    expect(duped.isNewRecord()).toBe(true);
    expect(duped.id).toBe(null);
  });
});
