import { describe, it, expect, expectTypeOf, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NoMethodError, include } from "@blazetrails/ruby-compat";
import { Minitest } from "@blazetrails/activesupport";
import "./relation.js";
import { TestCase } from "./cases/test-case.js";
import { FIXTURES_ROOT } from "./config.js";
import { fixtures, TestFixtures } from "./test-fixtures.js";
import {
  configureEncryption,
  snapshotEncryptionConfig,
  restoreEncryptionConfig,
} from "./encryption/test-helpers.js";
import { File as FixtureFile } from "./fixture-set/file.js";
import { Visitors } from "@blazetrails/arel";
import { Base } from "./base.js";
import { registerModel } from "./associations.js";
import { Fixture, FixtureSet } from "./fixtures.js";
import { fixtureRegistry, isJoinTableEntry } from "./test-helpers/fixtures-registry.js";
import { withSecondPool } from "./support/setup-second-pool.js";
import { College } from "./test-helpers/models/college.js";
import { LiveParrot, DeadParrot } from "./test-helpers/models/parrot.js";
import { Cucumber, Cabbage, RedCabbage } from "./test-helpers/models/vegetables.js";
import { Author } from "./test-helpers/models/author.js";
import { Post } from "./test-helpers/models/post.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import {
  defaultInsertValue,
  insertFixturesSet,
} from "./connection-adapters/abstract/database-statements.js";
import { doubleColumnsHash } from "./test-helpers/double-columns.js";
import { NullPool } from "./connection-adapters/abstract/connection-pool.js";

type Host = {
  name: string;
  fixturePaths: string[];
  fixtureTableNames: string[];
  fixtureClassNames: Record<string, unknown>;
  fixtureSets: Record<string, string>;
  setFixtureClass(classNames?: Record<string, unknown>): void;
  fixtures(...names: unknown[]): void;
  setupFixtureAccessors(names?: string | string[] | null): void;
  usesTransaction(...methods: unknown[]): void;
  isUsesTransaction(method: unknown): boolean;
};

describe("TestFixtures::ClassMethods", () => {
  let klass: Host;

  beforeEach(() => {
    const k = class extends Minitest.Test {};
    include(k, TestFixtures);
    klass = k as unknown as Host;
  });

  it("setup_fixture_accessors keys a Symbol set name by its String", () => {
    klass.setupFixtureAccessors([":posts", ":admin/users", "accounts"]);
    expect(klass.fixtureSets).toEqual({
      posts: "posts",
      admin_users: "admin/users",
      accounts: "accounts",
    });
  });

  it("set_fixture_class merges stringified class names", () => {
    const model = class {};
    klass.setFixtureClass({ some_fixture: model });
    klass.setFixtureClass({ "namespaced/fixture": String });
    expect(klass.fixtureClassNames).toEqual({
      some_fixture: model,
      "namespaced/fixture": String,
    });
  });

  it("fixtures :all globs every .yml under the fixture paths", () => {
    klass.fixturePaths = [new URL("./fixture-set/test-data", import.meta.url).pathname];
    klass.fixtures(":all");
    expect(klass.fixtureTableNames).toEqual([
      "accounts",
      "developers",
      "naked/yml/accounts",
      "naked/yml/companies",
      "other_posts",
      "parrots",
    ]);
  });

  it("fixtures :all enumerates registered TS fixture modules under the fixture paths", () => {
    FixtureFile.registerModule("all-ts-root/topics.ts", {});
    FixtureFile.registerModule("all-ts-root/admin/users.ts", {});
    klass.fixturePaths = ["all-ts-root"];
    klass.fixtures(":all");
    expect(klass.fixtureTableNames).toEqual(["admin/users", "topics"]);
  });

  it("fixtures unions and sorts table names and sets up accessors", () => {
    klass.fixtures("topics", ["accounts", ["admin/users"]]);
    klass.fixtures("topics");
    expect(klass.fixtureTableNames).toEqual(["accounts", "admin/users", "topics"]);
    expect(klass.fixtureSets).toEqual({
      topics: "topics",
      accounts: "accounts",
      admin_users: "admin/users",
    });
  });

  it("fixtures :all raises without fixture_paths", () => {
    expect(() => klass.fixtures(":all")).toThrow(/No fixture path found/);
  });

  it("setup_fixture_accessors dups fixture_sets so subclasses do not leak", () => {
    const sub = class extends (klass as unknown as new () => object) {} as unknown as Host;
    sub.fixtures("topics");
    expect(klass.fixtureSets).toEqual({});
    expect(sub.fixtureSets).toEqual({ topics: "topics" });
  });

  it("uses_transaction records method names", () => {
    klass.usesTransaction("test_a", "test_b");
    expect(klass.isUsesTransaction("test_a")).toBe(true);
    expect(klass.isUsesTransaction("test_c")).toBe(false);
  });
});

describe("TestFixtures#method_missing", () => {
  type Instance = {
    _loadedFixtures: Record<string, { fixtures: Record<string, unknown> }>;
    _fixtureCache: Record<string, Record<string, unknown>>;
    topics(...names: unknown[]): unknown;
    developers?: unknown;
  };
  let instance: Instance;

  beforeEach(() => {
    const k = class extends Minitest.Test {};
    include(k, TestFixtures);
    (k as unknown as Host).fixtures("topics");
    instance = new k("a test") as unknown as Instance;
    instance._loadedFixtures = { topics: { fixtures: { first: { find: async () => "first" } } } };
    instance._fixtureCache = {};
  });

  it("dispatches a fixture set name to active_record_fixture", async () => {
    await expect(instance.topics("first")).resolves.toBe("first");
    expect((instance as unknown as Record<string, unknown>).topics).toBeTypeOf("function");
  });

  it("raises for a fixture the set does not have", () => {
    expect(() => instance.topics("missing")).toThrow(
      "No fixture named 'missing' found for fixture set 'topics'",
    );
  });

  it("leaves a name that is not a fixture set unanswered", () => {
    expect(instance.developers).toBeUndefined();
    const probes = instance as unknown as Record<string, unknown>;
    expect(probes.then).toBeUndefined();
    expect(probes.toJSON).toBeUndefined();
    expect(JSON.stringify(instance)).toContain("_fixtureCache");
  });

  it("answers a missed read on the prototype itself, where fixture_sets is the class's", () => {
    const proto = Object.getPrototypeOf(instance) as Record<string, unknown>;
    expect(proto.developers).toBeUndefined();
    expect(proto.topics).toBeTypeOf("function");
  });

  it("raises NoMethodError carrying the receiver, name and args, as the super arm does", () => {
    const methodMissing = (instance as unknown as { methodMissing(...a: unknown[]): unknown })
      .methodMissing;
    let error: NoMethodError | undefined;
    try {
      methodMissing.call(instance, "developers", "david");
    } catch (e) {
      error = e as NoMethodError;
    }
    expect(error).toBeInstanceOf(NoMethodError);
    expect(error!.message).toMatch(/^undefined method 'developers' for an instance of /);
    expect(error!.constantName).toBe("developers");
    expect(error!.args()).toEqual(["david"]);
    expect(error!.receiver()).toBe(instance);
  });

  it("keeps answering when the module is included a second time", async () => {
    const k = Object.getPrototypeOf(instance).constructor as new () => object;
    include(k, TestFixtures);
    (k as unknown as Host).fixtures("topics");
    await expect(instance.topics("first")).resolves.toBe("first");
    expect(instance.developers).toBeUndefined();
  });
});

describe("TestFixtures#before_setup / #after_teardown", () => {
  type Lifecycle = { beforeSetup(): Promise<void>; afterTeardown(): Promise<void> };
  let calls: string[];
  let testCase: Lifecycle;

  function build(superclass: new () => object): new () => Lifecycle {
    const k = class extends superclass {
      async setupFixtures() {
        calls.push("setup_fixtures");
      }
      async teardownFixtures() {
        calls.push("teardown_fixtures");
      }
    };
    include(k, TestFixtures);
    return k as unknown as new () => Lifecycle;
  }

  beforeEach(() => {
    calls = [];
    testCase = new (build(
      class {
        beforeSetup() {
          calls.push("super before_setup");
        }
        afterTeardown() {
          calls.push("super after_teardown");
        }
      },
    ))();
  });

  it("splices the module beneath the includer's prototype", () => {
    const proto = Object.getPrototypeOf(testCase) as object;
    expect(Object.prototype.hasOwnProperty.call(proto, "beforeSetup")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Object.getPrototypeOf(proto), "beforeSetup")).toBe(
      true,
    );
  });

  it("before_setup sets up fixtures, then calls super", async () => {
    await testCase.beforeSetup();
    expect(calls).toEqual(["setup_fixtures", "super before_setup"]);
  });

  it("after_teardown calls super, then tears down fixtures", async () => {
    await testCase.afterTeardown();
    expect(calls).toEqual(["super after_teardown", "teardown_fixtures"]);
  });

  it("after_teardown tears down fixtures when super raises", async () => {
    testCase = new (build(
      class {
        afterTeardown() {
          throw new Error("super raised");
        }
      },
    ))();
    await expect(testCase.afterTeardown()).rejects.toThrow("super raised");
    expect(calls).toEqual(["teardown_fixtures"]);
  });

  it("an includer's own before_setup outranks the module's and reaches it through super", async () => {
    class Parent {
      async beforeSetup(): Promise<void> {
        calls.push("super before_setup");
      }
    }
    const k = class extends Parent {
      async beforeSetup(): Promise<void> {
        calls.push("own before_setup");
        await super.beforeSetup();
      }
      async setupFixtures() {
        calls.push("setup_fixtures");
      }
    };
    include(k, TestFixtures);
    await new k().beforeSetup();
    expect(calls).toEqual(["own before_setup", "setup_fixtures", "super before_setup"]);
  });

  it("a subclass's before_setup reaches the module through the includer", async () => {
    const includer = build(
      class {
        beforeSetup() {
          calls.push("super before_setup");
        }
      },
    );
    const sub = class extends includer {
      async beforeSetup(): Promise<void> {
        calls.push("sub before_setup");
        await super.beforeSetup();
      }
    };
    await new sub().beforeSetup();
    expect(calls).toEqual(["sub before_setup", "setup_fixtures", "super before_setup"]);
  });

  it("keeps an instance an instance of the includer's superclass", () => {
    class Parent {}
    const k = class extends Parent {};
    include(k, TestFixtures);
    expect(new k()).toBeInstanceOf(Parent);
    expect(k.prototype).toBeInstanceOf(Parent);
  });

  it("including the module again into a subclass splices nothing and keeps the chain", async () => {
    const includer = build(
      class {
        beforeSetup() {
          calls.push("super before_setup");
        }
      },
    );
    const sub = class extends includer {};
    include(sub, TestFixtures);
    expect(Object.getPrototypeOf(sub.prototype)).toBe(includer.prototype);
    (sub as unknown as Host).fixtures("topics");
    const instance = new sub() as unknown as Lifecycle & { topics: unknown; developers: unknown };
    await instance.beforeSetup();
    expect(calls).toEqual(["setup_fixtures", "super before_setup"]);
    expect(instance.topics).toBeTypeOf("function");
    expect(instance.developers).toBeUndefined();
  });
});

describe("fixtures() leaves ActiveRecord::TestCase as test_case.rb sets it", () => {
  fixtures([]);

  it("keeps fixture_paths at FIXTURES_ROOT and declares no sets on the root", () => {
    expect(TestCase.fixturePaths).toEqual([FIXTURES_ROOT]);
    expect(TestCase.fixtureTableNames).toEqual([]);
  });
});

async function resolvePrimaryModel(entry: {
  model: () => Promise<typeof Base | readonly (typeof Base)[]>;
}): Promise<typeof Base> {
  const resolved = await entry.model();
  const models = (Array.isArray(resolved) ? resolved : [resolved]) as (typeof Base)[];
  registerModel(models);
  return models[0];
}

async function setupScopedEncryption(): Promise<() => void> {
  const { configureEncryption, snapshotEncryptionConfig, restoreEncryptionConfig } =
    await import("./encryption/test-helpers.js");
  const snapshot = snapshotEncryptionConfig();
  configureEncryption();
  return () => restoreEncryptionConfig(snapshot);
}

describe("useFixtures seeds composite-primary-key tables", () => {
  const { cpkOrders, cpkOrderTags, cpkBooks } = fixtures(["cpkOrders", "cpkOrderTags", "cpkBooks"]);

  it("seeds a composite-model-PK order against the schema's single id", () => {
    const order = cpkOrders("cpk_groceries_order_1");
    expect(order.readAttribute("status")).toBe("paid");
    expect(order.readAttribute("id")).not.toBeNull();
    expect(order.readAttribute("id")).not.toBeUndefined();
  });

  it("seeds a composite-schema-PK row from its ref()'d key columns", () => {
    const tag = cpkOrderTags("cpk_first_order_loyal_customer");
    expect(Number(tag.readAttribute("order_id"))).toBe(
      Number(cpkOrders("cpk_groceries_order_1").readAttribute("id")),
    );
    expect(tag.readAttribute("tag_id")).not.toBeNull();
    expect(tag.readAttribute("tag_id")).not.toBeUndefined();
  });

  it("round-trips every composite-PK row by its full key tuple", () => {
    expect(cpkOrderTags.all().length).toBe(3);
  });

  it("Fixture#find locates a composite-primary-key row by its full key tuple", async () => {
    const book = cpkBooks("cpk_book_with_generated_pk");
    const modelClass = book.constructor as typeof Base;
    expect(modelClass.primaryKey).toEqual(["author_id", "id"]);
    const fixture = new Fixture(
      {
        author_id: book.readAttribute("author_id"),
        id: book.readAttribute("id"),
        title: "ignored by the primary-key slice",
      },
      modelClass,
    );
    const found = await fixture.find();
    expect(found.readAttribute("author_id")).toEqual(book.readAttribute("author_id"));
    expect(found.readAttribute("id")).toEqual(book.readAttribute("id"));
    expect(found.readAttribute("title")).toBe("Generated author's book");
  });

  it("generates both key columns for a composite-PK row that supplies neither", () => {
    const book = cpkBooks("cpk_book_with_generated_pk");
    expect(book.readAttribute("author_id")).not.toBeNull();
    expect(book.readAttribute("author_id")).not.toBeUndefined();
    expect(book.readAttribute("id")).not.toBeNull();
    expect(book.readAttribute("title")).toBe("Generated author's book");
  });
});

describe("useFixtures resolves STI subclasses on standalone load", () => {
  const { parrots, vegetables } = fixtures(["parrots", "vegetables"]);

  it("hydrates a LiveParrot-typed row as a LiveParrot instance", () => {
    expect(parrots("george")).toBeInstanceOf(LiveParrot);
    expect(parrots("george").readAttribute("parrot_sti_class")).toBe("LiveParrot");
  });

  it("hydrates a DeadParrot-typed row as a DeadParrot instance", () => {
    expect(parrots("polly")).toBeInstanceOf(DeadParrot);
    expect(parrots("polly").readAttribute("parrot_sti_class")).toBe("DeadParrot");
  });

  it("resolves the subclass-only `breed` enum via the row's STI class", async () => {
    const [row] = (
      await (
        await Base.leaseConnection()
      ).selectAll(
        `SELECT breed FROM ${(await Base.leaseConnection()).quoteTableName("parrots")} WHERE name = 'Curious George'`,
      )
    ).toArray() as { breed: number }[];
    expect(row.breed).toBe(1);
    expect(parrots("george").readAttribute("breed")).toBe("australian");
    expect(parrots("louis").readAttribute("breed")).toBe("african");
  });

  it("hydrates a Cucumber-typed row as a Cucumber instance", () => {
    expect(vegetables("first_cucumber")).toBeInstanceOf(Cucumber);
    expect(vegetables("first_cucumber").readAttribute("custom_type")).toBe("Cucumber");
  });

  it("hydrates RedCabbage and plain Cabbage rows as their subclasses", () => {
    expect(vegetables("red_cabbage")).toBeInstanceOf(RedCabbage);
    expect(vegetables("first_cabbage")).toBeInstanceOf(Cabbage);
  });
});

describe("fixtureRegistry conformance", () => {
  it("every entry resolves to a Base subclass with a table name and non-empty data", async () => {
    for (const [name, entry] of Object.entries(fixtureRegistry)) {
      if (isJoinTableEntry(entry)) {
        expect(typeof entry.joinTable, `${name}: join-table entry must declare a joinTable`).toBe(
          "string",
        );
        expect(entry.joinTable.length, `${name}: joinTable must be non-empty`).toBeGreaterThan(0);
      } else {
        if ("addOn" in entry) await entry.addOn?.();
        const ModelClass = await resolvePrimaryModel(entry);
        expect(typeof ModelClass, `${name}: model thunk must resolve to a class`).toBe("function");
        expect(
          ModelClass.prototype instanceof Base,
          `${name}: resolved model must extend Base`,
        ).toBe(true);
        expect(typeof ModelClass.tableName, `${name}: model must declare a tableName`).toBe(
          "string",
        );
        expect(
          ModelClass.tableName!.length,
          `${name}: tableName must be non-empty`,
        ).toBeGreaterThan(0);
      }

      const data = (entry as { data: Record<string, unknown> }).data;
      const labels = Object.keys(data);
      expect(
        labels.length,
        `${name}: fixture data must declare at least one label`,
      ).toBeGreaterThan(0);
      for (const label of labels) {
        expect(
          typeof data[label],
          `${name}.${label}: each fixture row must be an attributes object`,
        ).toBe("object");
      }
    }
  });
});

describe("fixtures() loads multiple same-table fixture sets in one call", () => {
  const { deadParrots, liveParrots } = fixtures(["deadParrots", "liveParrots"]);

  it("resolves a DeadParrot-typed row from the deadParrots accessor", () => {
    expect(deadParrots("deadbird")).toBeInstanceOf(DeadParrot);
    expect(deadParrots("deadbird").readAttribute("name")).toBe("Dusty DeadBird");
  });

  it("resolves a LiveParrot-typed row from the liveParrots accessor", () => {
    expect(liveParrots("dusty")).toBeInstanceOf(LiveParrot);
    expect(liveParrots("dusty").readAttribute("name")).toBe("Dusty Bluebird");
  });

  it("inserts both sets' rows into the shared table", async () => {
    const rows = (
      await (
        await Base.leaseConnection()
      ).selectAll(
        `SELECT name FROM ${(await Base.leaseConnection()).quoteTableName("parrots")} ORDER BY name`,
      )
    ).toArray() as { name: string }[];
    const names = rows.map((r) => r.name);
    expect(names).toContain("Dusty DeadBird");
    expect(names).toContain("Dusty Bluebird");
  });
});

describe("fixtureRegistry seeds against TEST_SCHEMA", () => {
  fixtures([]);
  let restoreEncryption: (() => void) | undefined;
  beforeAll(async () => {
    restoreEncryption = await setupScopedEncryption();
  });
  afterAll(() => {
    restoreEncryption?.();
    FixtureSet.resetCache();
  });

  it("every registered entry seeds without error", async () => {
    const failures: string[] = [];
    for (const [name, entry] of Object.entries(fixtureRegistry)) {
      try {
        const data = (entry as { data: Record<string, Record<string, unknown>> }).data;
        FixtureSet.resetCache();
        if (isJoinTableEntry(entry)) {
          FixtureFile.registerModule(`fixtures-trails/${entry.joinTable}.ts`, data);
          await FixtureSet.createFixtures("fixtures-trails", [entry.joinTable]);
        } else {
          if ("addOn" in entry) await entry.addOn?.();
          const ModelClass = await resolvePrimaryModel(entry);
          FixtureFile.registerModule(`fixtures-trails/${name}.ts`, data);
          await FixtureSet.createFixtures("fixtures-trails", [name], { [name]: ModelClass });
        }
      } catch (e) {
        failures.push(`${name}: ${(e as Error).message.split("\n")[0]}`);
      }
    }
    expect(failures, `unseedable registry entries:\n${failures.join("\n")}`).toEqual([]);
  }, 300000);
});

describe("useFixtures bootstraps the encryption add-on for encrypted fixtures", () => {
  // global encryption config doesn't leak into later suites in the worker.
  let restoreEncryption: (() => void) | undefined;
  beforeAll(async () => {
    restoreEncryption = await setupScopedEncryption();
  });
  afterAll(() => {
    restoreEncryption?.();
  });

  describe("encryptedBooks set", () => {
    type SpyableEntry = { addOn?: () => Promise<void>; model: () => Promise<typeof Base> };
    const entry = fixtureRegistry.encryptedBooks as unknown as SpyableEntry;
    const originalAddOn = entry.addOn;
    const originalModel = entry.model;
    const order: string[] = [];
    beforeAll(() => {
      entry.addOn = vi.fn(async () => {
        order.push("addOn");
        await originalAddOn?.call(entry);
      });
      entry.model = vi.fn(async () => {
        order.push("model");
        return originalModel.call(entry);
      });
    });
    afterAll(() => {
      entry.addOn = originalAddOn;
      entry.model = originalModel;
    });
    const { encryptedBooks } = fixtures(["encryptedBooks"]);

    it("awaits an entry's addOn before invoking its model thunk", () => {
      expect(order).toEqual(["addOn", "model"]);
    });

    it("reads the encrypted name attribute back as its expected plaintext", () => {
      expect(encryptedBooks("awdr").readAttribute("name")).toBe("Agile Web Development with Rails");
    });

    it("stores ciphertext in the DB column, not cleartext", async () => {
      const book = encryptedBooks("awdr");
      const rawDbValue = book.readAttributeBeforeTypeCast?.("name");
      expect(rawDbValue).not.toBe("Agile Web Development with Rails");
      expect(typeof rawDbValue).toBe("string");
      const { isEncryptedAttribute } = await import("./encryption/encryptable-record.js");
      expect(isEncryptedAttribute.call(book, "name")).toBe(true);
    });
  });

  describe("encryptedBookThatIgnoresCases set", () => {
    const { encryptedBookThatIgnoresCases } = fixtures(["encryptedBookThatIgnoresCases"]);

    it("reads an ignore-case encrypted fixture back as plaintext", () => {
      expect((encryptedBookThatIgnoresCases("rfr") as unknown as { name: string }).name).toBe(
        "Ruby for Rails",
      );
    });

    it("stores ciphertext for name and original_name columns", async () => {
      const book = encryptedBookThatIgnoresCases("rfr");
      const rawName = book.readAttributeBeforeTypeCast?.("name");
      expect(rawName).not.toBe("Ruby for Rails");
      expect(typeof rawName).toBe("string");
      const rawOriginal = book.readAttributeBeforeTypeCast?.("original_name");
      expect(rawOriginal).not.toBe("Ruby for Rails");
      expect(typeof rawOriginal).toBe("string");
      const { isEncryptedAttribute } = await import("./encryption/encryptable-record.js");
      expect(isEncryptedAttribute.call(book, "name")).toBe(true);
    });
  });
});

describe("useFixtures encryption add-on is opt-in", () => {
  it("only encrypted fixture entries declare an addOn hook", () => {
    expect(typeof (fixtureRegistry.encryptedBooks as { addOn?: unknown }).addOn).toBe("function");
    expect(
      typeof (fixtureRegistry.encryptedBookThatIgnoresCases as { addOn?: unknown }).addOn,
    ).toBe("function");
    expect((fixtureRegistry.authors as { addOn?: unknown }).addOn).toBeUndefined();
  });
});

describe("FixtureSet.createFixtures", () => {
  beforeEach(() => FixtureSet.resetCache());

  it("returns keyed instances for all declared labels", async () => {
    const adapter = makeAdapter();
    const id1 = FixtureSet.identify("first");
    const id2 = FixtureSet.identify("second");
    const rows = new Map([
      [id1, { id: id1, title: "First" }],
      [id2, { id: id2, title: "Second" }],
    ]);
    const Topic = makeModel(adapter, "topics", rows);

    FixtureFile.registerModule("fixtures-trails/topics.ts", {
      first: { title: "First" },
      second: { title: "Second" },
    });
    const [result] = await FixtureSet.createFixtures("fixtures-trails", "topics", {
      topics: Topic,
    });

    expect(await result.get("first")!.find()).toMatchObject({ id: id1 });
    expect(await result.get("second")!.find()).toMatchObject({ id: id2 });
  });

  it("emits DELETE before INSERT so rows are replaced (cross-test isolation)", async () => {
    const adapter = makeAdapter();
    const id = FixtureSet.identify("rails");
    const rows = new Map([[id, { id, title: "Rails" }]]);
    const Topic = makeModel(adapter, "topics", rows);

    FixtureFile.registerModule("fixtures-trails/topics.ts", { rails: { title: "Rails" } });
    await FixtureSet.createFixtures("fixtures-trails", "topics", {
      topics: Topic,
    });

    const sqls = (
      (adapter as unknown as { executeBatch: ReturnType<typeof vi.fn> }).executeBatch.mock
        .calls as unknown[][]
    ).flatMap((c) => c[0] as string[]);
    const deleteIdx = sqls.findIndex((s) => s.includes("DELETE FROM"));
    const insertIdx = sqls.findIndex((s) => s.includes("INSERT INTO"));
    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    expect(insertIdx).toBeGreaterThanOrEqual(0);
    expect(deleteIdx).toBeLessThan(insertIdx);
  });
});

describe("fixtures() pins every pool its sets seed through", () => {
  withSecondPool();
  const { colleges } = fixtures(["colleges"]);

  it("wraps the secondary pool's connection in the fixture transaction", async () => {
    expect(colleges("FIU").name).toBe("Florida International University");
    const secondary = await College.leaseConnection();
    expect(secondary).not.toBe(await Base.leaseConnection());
    expect(secondary.openTransactions()).toBeGreaterThan(0);
  });
});

describe("fixtures() naming one set in two sibling describes", () => {
  describe("a plain set, first describe", () => {
    const { deadParrots } = fixtures(["deadParrots"]);

    it("reads a row", () => {
      expect(deadParrots("deadbird").readAttribute("name")).toBe("Dusty DeadBird");
    });
  });

  describe("a plain set, second describe", () => {
    const { deadParrots } = fixtures(["deadParrots"]);

    it("reads a row", () => {
      expect(deadParrots("deadbird").readAttribute("name")).toBe("Dusty DeadBird");
    });
  });

  describe("an encrypted set", () => {
    let snapshot: ReturnType<typeof snapshotEncryptionConfig>;
    beforeAll(() => {
      snapshot = snapshotEncryptionConfig();
      configureEncryption();
    });
    afterAll(() => {
      restoreEncryptionConfig(snapshot);
    });

    describe("first describe", () => {
      const { encryptedBooks } = fixtures(["encryptedBooks"]);

      it("reads a row", () => {
        expect(encryptedBooks("awdr").readAttribute("name")).toBe(
          "Agile Web Development with Rails",
        );
      });
    });

    describe("second describe", () => {
      const { encryptedBooks } = fixtures(["encryptedBooks"]);

      it("reads a row", () => {
        expect(encryptedBooks("awdr").readAttribute("name")).toBe(
          "Agile Web Development with Rails",
        );
      });
    });
  });
});

const DOUBLE_ONLY_COLUMNS: Record<string, string[]> = {
  accounts: ["name"],
  posts: ["body"],
};

function makeAdapter(): DatabaseAdapter {
  return {
    execute: vi.fn(async () => []),
    beginTransaction: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    createSavepoint: vi.fn(async () => {}),
    releaseSavepoint: vi.fn(async () => {}),
    rollbackToSavepoint: vi.fn(async () => {}),
    disableReferentialIntegrity: async (fn: () => Promise<void>) => {
      await fn();
    },
    executeBatch: vi.fn(async () => {}),
    insertFixturesSet,
    schemaCache: {
      dataSourceExists: async () => true,
      columnsHash: async (table: string) => doubleColumnsHash(table, DOUBLE_ONLY_COLUMNS),
      primaryKeys: async () => "id",
    },
    lookupCastTypeFromColumn: () => ({ serialize: (v: unknown) => v }),
    supportsVirtualColumns: async () => false,
    defaultInsertValue,
    get visitor() {
      return new Visitors.ToSql(this as unknown as Visitors.ArelConnection);
    },
    quoteString: (v: string) => v.replace(/'/g, "''"),
    transaction: async <T>(fn: () => Promise<T> | T) => fn(),
    quote: (v: unknown) => (typeof v === "string" ? `'${v}'` : String(v)),
    quoteTableName: (n: string) => `"${n}"`,
    quoteColumnName: (n: string) => `"${n}"`,
    pool: new NullPool(),
  } as unknown as DatabaseAdapter;
}

function mockPool(adapter: DatabaseAdapter) {
  return {
    activeConnection: adapter,
    schemaReflection: adapter.pool.schemaReflection,
    withConnection: <T>(fn: (conn: DatabaseAdapter) => T) => fn(adapter),
    withConnectionSync: <T>(fn: (conn: DatabaseAdapter) => T) => fn(adapter),
  };
}

function makeModel(
  adapter: DatabaseAdapter,
  tableName: string,
  rows: Map<unknown, Record<string, unknown>>,
  pk = "id",
) {
  return {
    tableName,
    primaryKey: pk,
    isCompositePrimaryKey: () => false,
    connectionPool: () => mockPool(adapter),
    unscoped: (block: () => unknown) => block(),
    loadSchema: async () => {},
    definedEnums: {},
    _reflections: {},
    columns: () => Object.values(doubleColumnsHash(tableName, { [tableName]: [pk] })),
    typeForAttribute: () => ({ type: () => "integer" }),
    findByBang: vi.fn(async (attrs: Record<string, unknown>) => rows.get(attrs[pk]) ?? null),
  } as unknown as typeof Base;
}

describe("useFixtures", () => {
  const adapter = makeAdapter();
  const topicId = FixtureSet.identify("rails");
  const rows = new Map([[topicId, { id: topicId, title: "Rails" }]]);
  const Topic = makeModel(adapter, "topics", rows);

  const { topics } = fixtures(
    { topics: [Topic, { rails: { title: "Rails" } }] },
    { useTransactionalTests: false },
  );

  it("accessor returns the instance by label after beforeEach runs", () => {
    const t = topics("rails");
    expect(t).toMatchObject({ id: topicId });
  });

  it(".all() returns all instances in the set", () => {
    const all = topics.all();
    expect(all.length).toBe(1);
    expect(all[0]).toMatchObject({ id: topicId });
  });
});

describe("useFixtures multi-set", () => {
  const adapter = makeAdapter();
  const topicId = FixtureSet.identify("rails");
  const postId = FixtureSet.identify("hello");
  const topicRows = new Map([[topicId, { id: topicId, title: "Rails" }]]);
  const postRows = new Map([[postId, { id: postId, title: "Hello" }]]);
  const Topic = makeModel(adapter, "topics", topicRows);
  const Post = makeModel(adapter, "posts", postRows);

  const { topics, posts } = fixtures(
    {
      topics: [Topic, { rails: { title: "Rails" } }],
      posts: [Post, { hello: { title: "Hello" } }],
    },
    { useTransactionalTests: false },
  );

  it("both sets are accessible", () => {
    expect(topics("rails")).toMatchObject({ id: topicId });
    expect(posts("hello")).toMatchObject({ id: postId });
  });
});

describe("useFixtures slash-keyed fixture sets", () => {
  const adapter = makeAdapter();
  const rowId = FixtureSet.identify("david");
  const rows = new Map([[rowId, { id: rowId, name: "David" }]]);
  const AccountModel = makeModel(adapter, "accounts", rows);

  const result = fixtures(
    { "admin/accounts": [AccountModel, { david: { name: "David" } }] },
    { useTransactionalTests: false },
  );

  it("result property is accessible via bracket notation", () => {
    expect(typeof result["admin/accounts"]).toBe("function");
  });

  it("accessor returns the instance by label after beforeEach runs", () => {
    const acct = result["admin/accounts"]("david");
    expect(acct).toMatchObject({ id: rowId });
  });
});

describe("all/ fixture sets — explicit enumeration", () => {
  const adapter = makeAdapter();
  const rowId = FixtureSet.identify("signals37");
  const rows = new Map([[rowId, { id: rowId, name: "37signals" }]]);
  const AccountModel = makeModel(adapter, "accounts", rows);
  const DevModel = makeModel(adapter, "developers", new Map());
  const PersonModel = makeModel(adapter, "people", new Map());
  const TaskModel = makeModel(adapter, "tasks", new Map());

  const result = fixtures(
    {
      "all/developers": [DevModel, {}],
      "all/people": [PersonModel, {}],
      "all/tasks": [TaskModel, {}],
      "all/namespaced/accounts": [AccountModel, { signals37: { name: "37signals" } }],
    },
    { useTransactionalTests: false },
  );

  it("all four fixture sets are accessible via bracket notation", () => {
    expect(typeof result["all/developers"]).toBe("function");
    expect(typeof result["all/people"]).toBe("function");
    expect(typeof result["all/tasks"]).toBe("function");
    expect(typeof result["all/namespaced/accounts"]).toBe("function");
  });

  it("namespaced/accounts returns signals37 instance", () => {
    const acct = result["all/namespaced/accounts"]("signals37");
    expect(acct).toMatchObject({ id: rowId });
  });
});

describe("useFixtures type contract", () => {
  class Topic extends Base {
    declare title: string;
    static {
      this.tableName = "topics";
      this.findByBang = vi.fn(async () => new Topic()) as unknown as typeof Base.findByBang;
      this.connectionPool = (() =>
        mockPool(makeAdapter())) as unknown as typeof Base.connectionPool;
    }
  }
  class Post extends Base {
    declare body: string;
    static {
      this.tableName = "posts";
      this.findByBang = vi.fn(async () => new Post()) as unknown as typeof Base.findByBang;
      this.connectionPool = (() =>
        mockPool(makeAdapter())) as unknown as typeof Base.connectionPool;
    }
  }

  const { topics, posts } = fixtures(
    {
      topics: [Topic, { first: { title: "First" }, second: { title: "Second" } }],
      posts: [Post, { welcome: { body: "Hi" } }],
    },
    { useTransactionalTests: false },
  );

  it("accessor return type is narrowed to the model instance type", () => {
    expectTypeOf<ReturnType<typeof topics>>().toEqualTypeOf<Topic>();
    expectTypeOf<ReturnType<typeof posts>>().toEqualTypeOf<Post>();
  });

  it(".all() return type is an array of the model instance type", () => {
    expectTypeOf<ReturnType<typeof topics.all>>().toEqualTypeOf<Topic[]>();
    expectTypeOf<ReturnType<typeof posts.all>>().toEqualTypeOf<Post[]>();
  });

  it("label arg is narrowed to declared fixture names only", () => {
    expectTypeOf<Parameters<typeof topics>[0]>().toEqualTypeOf<"first" | "second">();
    expectTypeOf<Parameters<typeof posts>[0]>().toEqualTypeOf<"welcome">();
  });
});

describe("useFixtures by registry name", () => {
  const { authors, posts } = fixtures(["authorAddresses", "authors", "posts"]);

  it("loads authors by label with the expected attributes", async () => {
    const david = authors("david");
    expect(Number(david.id)).toBe(1);
    const [row] = (
      await (
        await Base.leaseConnection()
      ).selectAll(
        `SELECT name FROM ${(await Base.leaseConnection()).quoteTableName(Author.tableName)} WHERE id = 1`,
      )
    ).toArray();
    expect((row as { name: string }).name).toBe("David");
  });

  it("all() returns every seeded author", () => {
    expect(authors.all().length).toBe(3);
  });

  it("resolves cross-fixture ref() to the target fixture's declared id", async () => {
    const [a] = (
      await (
        await Base.leaseConnection()
      ).selectAll(
        `SELECT author_address_id FROM ${(await Base.leaseConnection()).quoteTableName(Author.tableName)} WHERE id = 1`,
      )
    ).toArray();
    expect(Number((a as { author_address_id: unknown }).author_address_id)).toBe(1);
    const [p] = (
      await (
        await Base.leaseConnection()
      ).selectAll(
        `SELECT author_id FROM ${(await Base.leaseConnection()).quoteTableName(Post.tableName)} WHERE id = 1`,
      )
    ).toArray();
    expect(Number((p as { author_id: unknown }).author_id)).toBe(1);
  });

  it("isolation part 1 — a delete lands within the test", async () => {
    expect(await Author.count()).toBe(3);
    await (
      await Base.leaseConnection()
    ).execute(`DELETE FROM ${(await Base.leaseConnection()).quoteTableName(Author.tableName)}`);
    expect(await Author.count()).toBe(0);
  });

  it("isolation part 2 — cleanup reseeded the fixture rows for the next test", async () => {
    expect(await Author.count()).toBe(3);
  });

  it("label arg is narrowed to declared fixture names only", () => {
    expectTypeOf<Parameters<typeof authors>[0]>().toEqualTypeOf<"david" | "mary" | "bob">();
    expectTypeOf<ReturnType<typeof authors>>().toEqualTypeOf<Author>();
    expectTypeOf<ReturnType<typeof posts.all>>().toEqualTypeOf<Post[]>();
  });
});

describe("useFixtures seeds HABTM join tables (no model class)", () => {
  const { categories, posts, categoriesPosts } = fixtures([
    "categories",
    "posts",
    "categoriesPosts",
  ]);

  it("resolves each join row's FK pair to the referenced rows' ids", () => {
    const row = categoriesPosts("general_welcome");
    expect(Number(row.category_id)).toBe(Number(categories("general").readAttribute("id")));
    expect(Number(row.post_id)).toBe(Number(posts("welcome").readAttribute("id")));
  });

  it("seeds every label-less join row (HABTM rows carry no id/label column)", async () => {
    expect(categoriesPosts.all().length).toBe(8);
    const [{ n }] = (
      await (
        await Base.leaseConnection()
      ).selectAll(
        `SELECT COUNT(*) AS n FROM ${(await Base.leaseConnection()).quoteTableName("categories_posts")}`,
      )
    ).toArray() as [{ n: number }];
    expect(Number(n)).toBe(8);
  });

  it("persists FK pairs that match a real Category and Post", async () => {
    for (const row of categoriesPosts.all()) {
      const r = row as { category_id: number; post_id: number };
      const [cat] = (
        await (
          await Base.leaseConnection()
        ).selectAll(
          `SELECT id FROM ${(await Base.leaseConnection()).quoteTableName("categories")} WHERE id = ${r.category_id}`,
        )
      ).toArray();
      const [post] = (
        await (
          await Base.leaseConnection()
        ).selectAll(
          `SELECT id FROM ${(await Base.leaseConnection()).quoteTableName("posts")} WHERE id = ${r.post_id}`,
        )
      ).toArray();
      expect(cat, `category_id ${r.category_id} must reference a real Category`).toBeDefined();
      expect(post, `post_id ${r.post_id} must reference a real Post`).toBeDefined();
    }
  });
});

describe("useFixtures seeds a single-row HABTM join table", () => {
  const { people, treasures, peoplesTreasures } = fixtures([
    "people",
    "treasures",
    "peoplesTreasures",
  ]);

  it("resolves rich_person_id/treasure_id to the referenced rows", () => {
    const row = peoplesTreasures("michael_diamond");
    expect(Number(row.rich_person_id)).toBe(Number(FixtureSet.identify("michael")));
    expect(Number(row.treasure_id)).toBe(Number(treasures("diamond").readAttribute("id")));
    expect(Number(people("michael").readAttribute("id"))).toBe(1);
  });
});

describe("useFixtures vertices and edges", () => {
  const { vertices, edges } = fixtures(["vertices", "edges"]);

  it("loads all 5 vertices and 4 edges", () => {
    expect(vertices.all().length).toBe(5);
    expect(edges.all().length).toBe(4);
  });

  it("resolves every edge ref() source_id and sink_id to a real vertex id", () => {
    const vertexIds = vertices.all().map((v) => Number(v.readAttribute("id")));
    for (const edge of edges.all()) {
      expect(vertexIds).toContain(Number(edge.readAttribute("source_id")));
      expect(vertexIds).toContain(Number(edge.readAttribute("sink_id")));
    }
  });
});

describe("useFixtures auto-stamps NOT NULL timestamps", () => {
  const { people } = fixtures(["people"]);

  it("fills created_at/updated_at for a row that omits them", async () => {
    const id = people("michael").id;
    const [row] = (
      await (
        await Base.leaseConnection()
      ).selectAll(
        `SELECT created_at, updated_at FROM ${(await Base.leaseConnection()).quoteTableName("people")} WHERE id = ${id}`,
      )
    ).toArray();
    const r = row as { created_at: unknown; updated_at: unknown };
    expect(r.created_at).not.toBeNull();
    expect(r.created_at).not.toBeUndefined();
    expect(r.updated_at).not.toBeNull();
  });
});

describe("useFixtures with a string primary key", () => {
  const { subscribers } = fixtures(["subscribers"]);

  it("loads a record keyed by its declared string primary key", async () => {
    const luke = subscribers("first");
    expect(luke.readAttribute("nick")).toBe("alterself");
    const [row] = (
      await (
        await Base.leaseConnection()
      ).selectAll(
        `SELECT name FROM ${(await Base.leaseConnection()).quoteTableName("subscribers")} WHERE nick = 'alterself'`,
      )
    ).toArray();
    expect((row as { name: string }).name).toBe("Luke Holden");
  });

  it("all() returns every seeded subscriber", () => {
    expect(subscribers.all().length).toBe(3);
  });
});

describe("useFixtures reconciles the PK column against the schema", () => {
  const { bulbs, mixedCaseMonkeys, mateys } = fixtures(["bulbs", "mixedCaseMonkeys", "mateys"]);

  it("populates the `ID` column for a custom-PK table", async () => {
    const special = bulbs("special");
    expect(special.readAttribute("ID")).not.toBeNull();
    expect(special.readAttribute("ID")).not.toBeUndefined();
    const [row] = (
      await (
        await Base.leaseConnection()
      ).selectAll(
        `SELECT name FROM ${(await Base.leaseConnection()).quoteTableName("bulbs")} WHERE ${(await Base.leaseConnection()).quoteColumnName("ID")} = ${special.readAttribute("ID")}`,
      )
    ).toArray();
    expect((row as { name: string }).name).toBe("special");
  });

  it("round-trips the `monkeyID` primary-key column", () => {
    expect(Number(mixedCaseMonkeys("first").readAttribute("monkeyID"))).toBe(1);
    expect(Number(mixedCaseMonkeys("second").readAttribute("monkeyID"))).toBe(2);
  });

  it("seeds an id-less table without a PK column", async () => {
    const m = mateys("blackbeard_to_redbeard");
    expect(m.readAttribute("weight")).toBe(10);
    const rows = (
      await (
        await Base.leaseConnection()
      ).selectAll(`SELECT weight FROM ${(await Base.leaseConnection()).quoteTableName("mateys")}`)
    ).toArray();
    expect(rows.length).toBe(1);
  });
});
