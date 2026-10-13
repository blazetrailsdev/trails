import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { File as FixtureFile } from "./fixture-set/file.js";
import { Dir, FileUtils, File as RubyFile, include } from "@blazetrails/ruby-compat";
import { Minitest, Notifications, onLoad } from "@blazetrails/activesupport";
import { fixtureRegistry, isJoinTableEntry } from "./test-helpers/fixtures-registry.js";
import { registerModel } from "./associations.js";
import { Fixture, FixtureSet } from "./fixtures.js";
import { Base } from "./base.js";
import "./relation.js";
import { fixtures, TestFixtures } from "./test-fixtures.js";
import { withSecondPool } from "./support/setup-second-pool.js";
import { College } from "./test-helpers/models/college.js";
import { LiveParrot, DeadParrot } from "./test-helpers/models/parrot.js";
import { Cucumber, Cabbage, RedCabbage } from "./test-helpers/models/vegetables.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import {
  defaultInsertValue,
  insertFixturesSet,
} from "./connection-adapters/abstract/database-statements.js";
import { Visitors } from "@blazetrails/arel";
import { doubleColumnsHash } from "./test-helpers/double-columns.js";
import { NullPool } from "./connection-adapters/abstract/connection-pool.js";
import { ConnectionHandler } from "./connection-adapters/abstract/connection-handler.js";
import { cleanUpConnectionHandler } from "./cases/helper.js";
import { inMemoryDb } from "./support/adapter-helper.js";
import { Zine } from "./test-helpers/models/zine.js";

registerModel(Zine);

async function resolvePrimaryModel(entry: {
  model: () => Promise<typeof Base | readonly (typeof Base)[]>;
}): Promise<typeof Base> {
  const resolved = await entry.model();
  const models = (Array.isArray(resolved) ? resolved : [resolved]) as (typeof Base)[];
  registerModel(models);
  return models[0];
}

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
  } as any;
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
      expect((encryptedBookThatIgnoresCases("rfr") as any).name).toBe("Ruby for Rails");
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

describe("TestFixturesTest", () => {
  const { self } = fixtures([], { useTransactionalTests: false });

  let klass: new () => object;

  beforeEach(() => {
    klass = class {};
    include(klass, TestFixtures);
  });

  it("use transactional tests defaults to true", () => {
    expect(true).toEqual((klass as { useTransactionalTests?: unknown }).useTransactionalTests);
  });

  it("use transactional tests can be overridden", () => {
    (klass as { useTransactionalTests?: unknown }).useTransactionalTests = "foobar";

    expect("foobar").toEqual((klass as { useTransactionalTests?: unknown }).useTransactionalTests);
  });

  it("inclusion runs active record fixtures load hook", () => {
    onLoad("active_record_fixtures", function (base: { fixturePaths: string[] }) {
      base.fixturePaths.push("test/fixtures");
    });
    const klass = class {};

    include(klass, TestFixtures);

    expect((klass as unknown as { fixturePaths: string[] }).fixturePaths).toContain(
      "test/fixtures",
    );
  });

  it.skipIf(inMemoryDb())("doesnt rely on active support test case specific methods", async () => {
    const tmpDir = Dir.mktmpdir();
    let oldHandler: ConnectionHandler | undefined;
    try {
      RubyFile.write(RubyFile.join(tmpDir, "zines.yml"), "going_out:\n  title: Hello\n");

      const klass = class extends Minitest.Test {
        declare static fixturePaths: string[];
        declare static useTransactionalTests: boolean;
        declare static fixtures: (...fixtureSetNames: unknown[]) => void;
        declare zines: (name: string) => Promise<Zine>;

        static {
          include(this, TestFixtures);

          this.fixturePaths = [tmpDir];
          this.useTransactionalTests = true;

          this.fixtures(":all");
        }

        async testRunSuccessfully() {
          expect(((await Zine.first()) as Zine).title).toBe("Hello");
          expect((await this.zines("going_out")).title).toBe("Hello");
        }
      };

      Notifications.unsubscribe(self()._connectionSubscriber);
      self()._connectionSubscriber = null;

      oldHandler = Base.connectionHandler;
      Base.connectionHandler = new ConnectionHandler();
      await Base.establishConnection(":arunit");

      const testResult = await new klass("testRunSuccessfully").run();
      expect(testResult.isPassed()).toBeTruthy();
    } finally {
      Base.connectionHandler = oldHandler!;
      cleanUpConnectionHandler();
      FileUtils.rmR(tmpDir);
    }
  });
});
