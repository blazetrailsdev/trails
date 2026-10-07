import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { fixtures } from "./test-fixtures.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Reply } from "./test-helpers/models/reply.js";
import { Base } from "./index.js";
import { DatabaseConfigurations } from "./database-configurations.js";
import { BetterSQLite3Adapter } from "./connection-adapters/better-sqlite3-adapter.js";
import { BooleanType, IntegerType, StringType } from "@blazetrails/activemodel";
import { establishConnectionTo } from "./test-helpers/adapter-double.js";
import { rbHash, rbObjAlloc, uniq } from "@blazetrails/ruby-compat";
import { equals as coreEquals, hash as coreHash } from "./core.js";

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

function ownState(klass: object): Array<[PropertyKey, unknown]> {
  return Reflect.ownKeys(klass).map((key) => [
    key,
    Object.getOwnPropertyDescriptor(klass, key)?.value,
  ]);
}

describe("instantiating a loaded record (core.rb init_with_attributes)", () => {
  fixtures(["topics"]);

  it("loads records without copying the default attribute set", async () => {
    await Topic.create({ title: "Alice" });
    const defaults = (
      Topic as unknown as { _defaultAttributes(): { deepDup(): unknown } }
    )._defaultAttributes();
    const proto = Object.getPrototypeOf(defaults) as { deepDup(): unknown };
    const deepDup = proto.deepDup;
    let copies = 0;
    proto.deepDup = function (this: unknown) {
      if (this === defaults) copies++;
      return deepDup.call(this);
    };
    try {
      const loaded = await Topic.all();
      expect(loaded.length).toBeGreaterThan(0);
      expect(loaded[0].isNewRecord()).toBe(false);
      expect(copies).toBe(0);

      const fresh = new Topic({ title: "Bob" });
      expect(fresh.isNewRecord()).toBe(true);
      expect(copies).toBeGreaterThan(0);
    } finally {
      proto.deepDup = deepDup;
    }
  });

  it("loads STI subclass rows through the base class without building either default set", async () => {
    type DefaultsHost = { _defaultAttributes(): { deepDup(): unknown } };
    const topicDefaults = (Topic as unknown as DefaultsHost)._defaultAttributes();
    const replyDefaults = (Reply as unknown as DefaultsHost)._defaultAttributes();
    const proto = Object.getPrototypeOf(topicDefaults) as { deepDup(): unknown };
    const deepDup = proto.deepDup;
    const copies = { topic: 0, reply: 0 };
    proto.deepDup = function (this: unknown) {
      if (this === topicDefaults) copies.topic++;
      if (this === replyDefaults) copies.reply++;
      return deepDup.call(this);
    };
    const columnDefaults = Object.getOwnPropertyDescriptor(Base, "columnDefaults")!;
    let columnDefaultsReads = 0;
    Object.defineProperty(Base, "columnDefaults", {
      ...columnDefaults,
      get(this: typeof Base) {
        columnDefaultsReads++;
        return columnDefaults.get!.call(this);
      },
    });
    try {
      const loaded = await Topic.all();
      expect(loaded.some((record) => record instanceof Reply)).toBe(true);
      expect(copies).toEqual({ topic: 0, reply: 0 });
      expect(columnDefaultsReads).toBe(0);
    } finally {
      proto.deepDup = deepDup;
      Object.defineProperty(Base, "columnDefaults", columnDefaults);
    }
  });

  it("initWithAttributes keeps the attributes and new_record it is handed", async () => {
    const source = await Topic.create({ title: "Carol" });
    const record = rbObjAlloc(Topic) as Topic & {
      initWithAttributes(attributes: unknown, newRecord?: boolean): Topic;
      _attributes: unknown;
    };
    const handed = (
      source as unknown as { _attributes: { deepDup(): unknown } }
    )._attributes.deepDup();
    record.initWithAttributes(handed, true);
    expect(record._attributes).toBe(handed);
    expect(record.title).toBe("Carol");
    expect(record.isNewRecord()).toBe(true);

    const loaded = rbObjAlloc(Topic) as typeof record;
    loaded.initWithAttributes(handed);
    expect(loaded.title).toBe("Carol");
    expect(loaded.isNewRecord()).toBe(false);
  });

  it("init_internals is rooted at Core, beneath ActiveModel::Dirty's", () => {
    const record = new Topic() as unknown as Record<string, unknown>;
    expect(record._readonly).toBe(false);
    expect(record._mutationsBeforeLastSave).toBeNull();
  });

  it("a new record holds the state Validations#init_internals leaves", () => {
    const record = new Topic() as unknown as {
      _errors?: unknown;
      _contextForValidation?: unknown;
      validationContext: unknown;
      errors: { isEmpty(): boolean };
    };
    expect(record._errors ?? null).toBeNull();
    expect(record._contextForValidation ?? null).toBeNull();
    expect(record.validationContext).toBeNull();
    expect(record.errors.isEmpty()).toBe(true);
  });

  it("allocate runs no constructor and leaves the class untouched", () => {
    const before = [ownState(Reply), ownState(Topic)];
    const initInternals = vi.spyOn(
      Reply.prototype as unknown as { initInternals(): void },
      "initInternals",
    );
    const requireConcreteClass = vi.spyOn(Reply, "_requireConcreteClass");
    let record: Reply;
    try {
      record = rbObjAlloc(Reply);
      expect(initInternals).not.toHaveBeenCalled();
      expect(requireConcreteClass).not.toHaveBeenCalled();
    } finally {
      initInternals.mockRestore();
      requireConcreteClass.mockRestore();
    }
    expect(record).toBeInstanceOf(Reply);
    expect(Object.keys(record)).toEqual([]);
    expect([ownState(Reply), ownState(Topic)]).toEqual(before);
  });
});

describe("DatabaseConfigurations.new given a DatabaseConfigurations", () => {
  it("takes the other instance's configurations (database_configurations.rb:201)", () => {
    const configs = new DatabaseConfigurations({
      test: { adapter: "sqlite3", database: ":memory:" },
    });

    expect(new DatabaseConfigurations(configs).configurations).toEqual(configs.configurations);
  });
});

describe("eql (core.rb:637 alias :eql? :==)", () => {
  fixtures(["topics"]);

  it("eql answers what equals answers, so ruby-compat uniq deduplicates loaded copies", async () => {
    const a = await Topic.find(1);
    const b = await Topic.find(1);
    expect(a.eql(b)).toBe(a.equals(b));
    expect(a.eql(b)).toBe(true);
    expect(new Topic().eql(new Topic())).toBe(false);
    expect(uniq([a, b])).toEqual([a]);
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
    adapter = new BetterSQLite3Adapter({ database: ":memory:" });
    await adapter.execute(
      "CREATE TABLE direct_topics (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, approved INTEGER DEFAULT 0)",
    );
    const adp = adapter;
    class TopicWithDirectAdapter extends Base {
      static tableName = "direct_topics";
      static {
        this.connectionSpecificationName = "TopicWithDirectAdapter";
        this.attribute("id", new IntegerType());
        this.attribute("title", new StringType());
        this.attribute("approved", new BooleanType());
      }
    }
    await establishConnectionTo(TopicWithDirectAdapter, adp);
    DirectTopic = TopicWithDirectAdapter;
  });

  afterEach(async () => {
    await adapter.execute("DROP TABLE IF EXISTS direct_topics");
    await adapter.disconnectBang();
  });

  it("find resolves through the assigned adapter without a pool", async () => {
    await adapter.execute("INSERT INTO direct_topics (id, title) VALUES (42, 'Alice')");
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
      ":global_registry_env",
    );
    expect(resolved!.database).toBe("db/global.sqlite3");
  });
});

describe("inspection_filter", () => {
  it("a subclass assigning filter_attributes gets its own filter, reset on reassignment", () => {
    class FilteredTopic extends Topic {}
    expect(FilteredTopic.inspectionFilter()).toBe(Topic.inspectionFilter());

    FilteredTopic.filterAttributes = ["title"];
    const filter = FilteredTopic.inspectionFilter();
    expect(filter).not.toBe(Topic.inspectionFilter());
    expect(FilteredTopic.inspectionFilter()).toBe(filter);

    FilteredTopic.filterAttributes = ["content"];
    expect(FilteredTopic.inspectionFilter()).not.toBe(filter);
  });
});

describe("compare", () => {
  fixtures(["topics"]);

  it("find_by with an empty hash takes the cached path", async () => {
    expect(await Topic.findBy({})).toBeInstanceOf(Topic);
  });

  it("orders same-class records by primary key and reports nil as undefined", async () => {
    const first = await Topic.find(1);
    const second = await Topic.find(3);

    expect(first.compare(second)).toBe(-1);
    expect(second.compare(first)).toBe(1);
    expect(first.compare(first)).toBe(0);

    expect(new Topic({ title: "a" }).compare(new Topic({ title: "b" }))).toBe(0);
    expect(first.compare(new Topic({ title: "a" }))).toBeNull();
    expect(first.compare("not a topic")).toBeNull();

    const reply = await Reply.find(2);
    expect(first.compare(reply)).toBe(-1);
    expect(reply.compare(first)).toBeNull();
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
    expect((topic._associationCache as Map<string, unknown>).size).toBe(0);
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
    expect(duped.errors.isEmpty()).toBe(true);
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

describe("hash agrees with ==", () => {
  class Keyed {}
  const record = (id: unknown) =>
    Object.assign(new Keyed(), { id, isPrimaryKeyValuesPresent: () => true }) as never;
  const hashOf = (id: unknown) => coreHash.call(record(id));

  it("gives == ids one hash", () => {
    const id = Symbol("x");
    expect(coreEquals.call(record(id), record(id))).toBe(true);
    expect(hashOf(id)).toEqual(hashOf(id));
    expect(hashOf([1, "a"])).toEqual(hashOf([1, "a"]));
    expect(coreEquals.call(record([[1]]), record([[1]]))).toBe(true);
    expect(hashOf([[1]])).toEqual(hashOf([[1]]));
    expect(hashOf(Symbol.for("x"))).toEqual(hashOf(Symbol.for("x")));
    expect(coreEquals.call(record(Array(1)), record([undefined]))).toBe(true);
    expect(hashOf(Array(1))).toEqual(hashOf([undefined]));
  });

  it("is an Integer, and an Array of records folds it into its own hash", () => {
    expect(Number.isInteger(new Topic().hash())).toBe(true);
    expect(Number.isInteger(hashOf(1))).toBe(true);
    expect(() => rbHash([new Topic()])).not.toThrow();
    expect(rbHash([new Topic({ id: 1 })])).toEqual(rbHash([new Topic({ id: 1 })]));
    expect(rbHash([new Topic({ id: 1 })])).not.toEqual(rbHash([new Topic({ id: 2 })]));
  });
});

describe("underscore class_attribute slots", () => {
  it("_destroy_association_async_job defaults to Rails' job name and is written per class", () => {
    class Job {}
    class Parent extends Topic {}
    class Child extends Parent {}

    expect(Base._destroyAssociationAsyncJob).toBe("ActiveRecord::DestroyAssociationAsyncJob");
    expect(Base.is_destroyAssociationAsyncJob).toBe(true);
    expect(() => Parent.destroyAssociationAsyncJob).toThrow(
      /Unable to load destroy_association_async_job: /,
    );

    Parent.destroyAssociationAsyncJob = Job;
    expect(Child.destroyAssociationAsyncJob).toBe(Job);
    expect(new Child().destroyAssociationAsyncJob).toBe(Job);
    expect(Base._destroyAssociationAsyncJob).toBe("ActiveRecord::DestroyAssociationAsyncJob");
    expect(Topic._destroyAssociationAsyncJob).toBe("ActiveRecord::DestroyAssociationAsyncJob");
    expect("_destroyAssociationAsyncJob" in Parent.prototype).toBe(false);
  });

  it("destroy_association_async_job= is the slot's own writer, local to the class assigned", () => {
    class Job {}
    class Sub extends Topic {}
    class Sibling extends Topic {}

    Sub.destroyAssociationAsyncJob = Job;

    expect(Object.getOwnPropertyDescriptor(Base, "destroyAssociationAsyncJob")?.set).toBe(
      Object.getOwnPropertyDescriptor(Base, "_destroyAssociationAsyncJob")?.set,
    );
    expect(Sub._destroyAssociationAsyncJob).toBe(Job);
    expect(Sibling._destroyAssociationAsyncJob).toBe("ActiveRecord::DestroyAssociationAsyncJob");
    expect(Topic._destroyAssociationAsyncJob).toBe("ActiveRecord::DestroyAssociationAsyncJob");
    expect(Base._destroyAssociationAsyncJob).toBe("ActiveRecord::DestroyAssociationAsyncJob");
  });

  it("_attr_readonly and _counter_cache_columns stay local to the subclass that writes them", () => {
    class Parent extends Topic {}
    class Child extends Parent {}

    Child.attrReadonly("title");
    Child._counterCacheColumns = [...Child._counterCacheColumns, "written_on_count"];

    expect(Child.readonlyAttributes).toContain("title");
    expect(Parent._attrReadonly).not.toContain("title");
    expect(Parent._counterCacheColumns).toEqual(Topic._counterCacheColumns);
    expect(Child.isCounterCacheColumn("written_on_count")).toBe(true);
    expect(Parent.isCounterCacheColumn("written_on_count")).toBe(false);
    expect(Child.is_attrReadonly).toBe(true);
    expect(Child.is_counterCacheColumns).toBe(true);
    expect("_attrReadonly" in Child.prototype).toBe(false);
    expect("_counterCacheColumns" in Child.prototype).toBe(false);
  });

  it("_reflections keeps its instance reader and predicate, and no instance writer", () => {
    expect(Reply.is_reflections).toBe(true);
    const reply = new Reply() as unknown as { _reflections: object; is_reflections: boolean };
    expect(reply._reflections).toBe(Reply._reflections);
    expect(reply.is_reflections).toBe(true);
    expect(Object.getOwnPropertyDescriptor(Base.prototype, "_reflections")?.set).toBeUndefined();
  });
});

describe("Core's included class attributes", () => {
  it("leaves belongs_to_required_by_default unset, as core.rb:89 declares no default", () => {
    class Unconfigured extends Base {}
    expect(Unconfigured.belongsToRequiredByDefault ?? null).toBeNull();
  });

  it("keeps a subclass write local to that subclass", () => {
    class Parent extends Base {}
    class Child extends Parent {}
    Child.strictLoadingByDefault = true;
    Child.hasManyInversing = true;
    expect(Child.strictLoadingByDefault).toBe(true);
    expect(Parent.strictLoadingByDefault).toBe(false);
    expect(Base.strictLoadingByDefault).toBe(false);
    expect(Parent.hasManyInversing).toBe(false);
  });

  it("answers connection_class from the class's own ivar", () => {
    class Parent extends Base {}
    class Child extends Parent {}
    Parent.connectionClass = true;
    expect(Parent.isConnectionClass()).toBe(true);
    expect(Child.connectionClass).toBe(false);
  });

  it("reads filter_attributes from the superclass until the class sets its own", () => {
    class Parent extends Base {}
    class Child extends Parent {}
    Parent.filterAttributes = ["secret"];
    expect(Child.filterAttributes).toEqual(["secret"]);
    Child.filterAttributes = ["token"];
    expect(Parent.filterAttributes).toEqual(["secret"]);
    expect(Base.filterAttributes).toEqual([]);
  });
});

describe("arelTable memo", () => {
  it("answers one table until the table name or the schema cache changes", () => {
    class Memoized extends Base {
      static {
        this.tableName = "topics";
      }
    }
    const table = Memoized.arelTable;
    expect(Memoized.arelTable).toBe(table);
    expect(Memoized.predicateBuilder.table.arelTable).toBe(table);

    Memoized.tableName = "posts";
    const renamed = Memoized.arelTable;
    expect(renamed).not.toBe(table);
    expect(renamed.name).toBe("posts");

    (Memoized as unknown as { reloadSchemaFromCache(): void }).reloadSchemaFromCache();
    expect(Memoized.arelTable).not.toBe(renamed);
  });

  it("does not hand a subclass its parent's table", () => {
    expect(Reply.arelTable).toBe(Reply.arelTable);
    expect(Reply.arelTable).not.toBe(Topic.arelTable);
  });
});
