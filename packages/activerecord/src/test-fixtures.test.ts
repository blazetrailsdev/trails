import { describe, it, expect, expectTypeOf, vi, beforeAll, afterAll } from "vitest";
import { resolveFixtureNames } from "./test-fixtures.js";
import { fixtureRegistry, isJoinTableEntry } from "./test-helpers/fixtures-registry.js";
import { registerModel } from "./associations.js";
import { FixtureSet } from "./fixtures.js";
import { Base } from "./base.js";
import "./relation.js";
import { defineFixtures, defineJoinTableFixtures, isFixtureRef } from "./fixtures.js";
import { fixtures } from "./test-fixtures.js";
import { withTransactionalFixtures } from "./test-fixtures/with-transactional-fixtures.js";
import { withSecondPool } from "./support/setup-second-pool.js";
import { College } from "./test-helpers/models/college.js";
import { Author } from "./test-helpers/models/author.js";
import { Post } from "./test-helpers/models/post.js";
import { LiveParrot, DeadParrot } from "./test-helpers/models/parrot.js";
import { Cucumber, Cabbage, RedCabbage } from "./test-helpers/models/vegetables.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { NullPool } from "./connection-adapters/abstract/connection-pool.js";
import {
  leaseFixtureConnection,
  leaseFixtureConnectionFor,
} from "./test-fixtures/fixture-connection.js";

async function resolvePrimaryModel(entry: {
  model: () => Promise<typeof Base | readonly (typeof Base)[]>;
}): Promise<typeof Base> {
  const resolved = await entry.model();
  const models = (Array.isArray(resolved) ? resolved : [resolved]) as (typeof Base)[];
  registerModel(models);
  return models[0];
}

function makeAdapter(): DatabaseAdapter {
  return {
    typeRegistryKey: "sqlite3" as const,
    execute: vi.fn(async () => []),
    executeMutation: vi.fn(async () => 0),
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
    transaction: async <T>(fn: () => Promise<T> | T) => fn(),
    quote: (v: unknown) => (typeof v === "string" ? `'${v}'` : String(v)),
    quoteTableName: (n: string) => `"${n}"`,
    quoteColumnName: (n: string) => `"${n}"`,
    pool: new NullPool(),
  } as unknown as DatabaseAdapter;
}

function makeModel(tableName: string, rows: Map<unknown, Record<string, unknown>>, pk = "id") {
  return {
    tableName,
    primaryKey: pk,
    findBy: vi.fn(async (attrs: Record<string, unknown>) => rows.get(attrs[pk]) ?? null),
  } as any;
}

async function setupScopedEncryption(): Promise<() => void> {
  const { configureEncryption, snapshotEncryptionConfig, restoreEncryptionConfig } =
    await import("./encryption/test-helpers.js");
  const snapshot = snapshotEncryptionConfig();
  configureEncryption();
  return () => restoreEncryptionConfig(snapshot);
}

describe("useFixtures", () => {
  const adapter = makeAdapter();
  const topicId = FixtureSet.identify("rails");
  const rows = new Map([[topicId, { id: topicId, title: "Rails" }]]);
  const Topic = makeModel("topics", rows);

  const { topics } = fixtures(
    { topics: [Topic, { rails: { title: "Rails" } }] },
    { connection: () => adapter, useTransactionalTests: false },
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
  const Topic = makeModel("topics", topicRows);
  const Post = makeModel("posts", postRows);

  const { topics, posts } = fixtures(
    {
      topics: [Topic, { rails: { title: "Rails" } }],
      posts: [Post, { hello: { title: "Hello" } }],
    },
    { connection: () => adapter, useTransactionalTests: false },
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
  const AccountModel = makeModel("accounts", rows);

  const result = fixtures(
    { "admin/accounts": [AccountModel, { david: { name: "David" } }] },
    { connection: () => adapter, useTransactionalTests: false },
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
  const AccountModel = makeModel("accounts", rows);
  const DevModel = makeModel("developers", new Map());
  const PersonModel = makeModel("people", new Map());
  const TaskModel = makeModel("tasks", new Map());

  const result = fixtures(
    {
      "all/developers": [DevModel, {}],
      "all/people": [PersonModel, {}],
      "all/tasks": [TaskModel, {}],
      "all/namespaced/accounts": [AccountModel, { signals37: { name: "37signals" } }],
    },
    { connection: () => adapter, useTransactionalTests: false },
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
      this.findBy = vi.fn(async () => new Topic()) as any;
    }
  }
  class Post extends Base {
    declare body: string;
    static {
      this.tableName = "posts";
      this.findBy = vi.fn(async () => new Post()) as any;
    }
  }

  const { topics, posts } = fixtures(
    {
      topics: [Topic, { first: { title: "First" }, second: { title: "Second" } }],
      posts: [Post, { welcome: { body: "Hi" } }],
    },
    { connection: () => makeAdapter() as any, useTransactionalTests: false },
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
  withTransactionalFixtures(leaseFixtureConnection);

  const { authors, posts } = fixtures(["authorAddresses", "authors", "posts"], {
    connection: () => Base.adapter,
    useTransactionalTests: false,
  });

  it("loads authors by label with the expected attributes", async () => {
    const david = authors("david");
    expect(Number(david.id)).toBe(1);
    const [row] = await Base.adapter.execute(
      `SELECT name FROM ${Base.adapter.quoteTableName(Author.tableName)} WHERE id = 1`,
    );
    expect((row as { name: string }).name).toBe("David");
  });

  it("all() returns every seeded author", () => {
    expect(authors.all().length).toBe(3);
  });

  it("resolves cross-fixture ref() to the target fixture's declared id", async () => {
    const [a] = await Base.adapter.execute(
      `SELECT author_address_id FROM ${Base.adapter.quoteTableName(Author.tableName)} WHERE id = 1`,
    );
    expect(Number((a as { author_address_id: unknown }).author_address_id)).toBe(1);
    const [p] = await Base.adapter.execute(
      `SELECT author_id FROM ${Base.adapter.quoteTableName(Post.tableName)} WHERE id = 1`,
    );
    expect(Number((p as { author_id: unknown }).author_id)).toBe(1);
  });

  it("isolation part 1 — a delete lands within the test", async () => {
    expect(await Author.count()).toBe(3);
    await Base.adapter.executeMutation(
      `DELETE FROM ${Base.adapter.quoteTableName(Author.tableName)}`,
    );
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
  withTransactionalFixtures(leaseFixtureConnection);

  const { categories, posts, categoriesPosts } = fixtures(
    ["categories", "posts", "categoriesPosts"],
    { connection: () => Base.adapter, useTransactionalTests: false },
  );

  it("resolves each join row's FK pair to the referenced rows' ids", () => {
    const row = categoriesPosts("general_welcome");
    expect(Number(row.category_id)).toBe(Number(categories("general").readAttribute("id")));
    expect(Number(row.post_id)).toBe(Number(posts("welcome").readAttribute("id")));
  });

  it("seeds every label-less join row (HABTM rows carry no id/label column)", async () => {
    expect(categoriesPosts.all().length).toBe(8);
    const [{ n }] = (await Base.adapter.execute(
      `SELECT COUNT(*) AS n FROM ${Base.adapter.quoteTableName("categories_posts")}`,
    )) as [{ n: number }];
    expect(Number(n)).toBe(8);
  });

  it("persists FK pairs that match a real Category and Post", async () => {
    for (const row of categoriesPosts.all()) {
      const r = row as { category_id: number; post_id: number };
      const [cat] = await Base.adapter.execute(
        `SELECT id FROM ${Base.adapter.quoteTableName("categories")} WHERE id = ${r.category_id}`,
      );
      const [post] = await Base.adapter.execute(
        `SELECT id FROM ${Base.adapter.quoteTableName("posts")} WHERE id = ${r.post_id}`,
      );
      expect(cat, `category_id ${r.category_id} must reference a real Category`).toBeDefined();
      expect(post, `post_id ${r.post_id} must reference a real Post`).toBeDefined();
    }
  });
});

describe("useFixtures seeds a single-row HABTM join table", () => {
  withTransactionalFixtures(leaseFixtureConnection);

  const { people, treasures, peoplesTreasures } = fixtures(
    ["people", "treasures", "peoplesTreasures"],
    { connection: () => Base.adapter, useTransactionalTests: false },
  );

  it("resolves rich_person_id/treasure_id to the referenced rows", () => {
    const row = peoplesTreasures("michael_diamond");
    expect(Number(row.rich_person_id)).toBe(Number(people("michael").readAttribute("id")));
    expect(Number(row.treasure_id)).toBe(Number(treasures("diamond").readAttribute("id")));
  });
});

describe("useFixtures vertices and edges", () => {
  withTransactionalFixtures(leaseFixtureConnection);

  const { vertices, edges } = fixtures(["vertices", "edges"], {
    connection: () => Base.adapter,
    useTransactionalTests: false,
  });

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
  withTransactionalFixtures(leaseFixtureConnection);

  const { people } = fixtures(["people"], {
    connection: () => Base.adapter,
    useTransactionalTests: false,
  });

  it("fills created_at/updated_at for a row that omits them", async () => {
    const id = people("michael").id;
    const [row] = await Base.adapter.execute(
      `SELECT created_at, updated_at FROM ${Base.adapter.quoteTableName("people")} WHERE id = ${id}`,
    );
    const r = row as { created_at: unknown; updated_at: unknown };
    expect(r.created_at).not.toBeNull();
    expect(r.created_at).not.toBeUndefined();
    expect(r.updated_at).not.toBeNull();
  });
});

describe("useFixtures with a string primary key", () => {
  withTransactionalFixtures(leaseFixtureConnection);

  const { subscribers } = fixtures(["subscribers"], {
    connection: () => Base.adapter,
    useTransactionalTests: false,
  });

  it("loads a record keyed by its declared string primary key", async () => {
    const luke = subscribers("first");
    expect(luke.readAttribute("nick")).toBe("alterself");
    const [row] = await Base.adapter.execute(
      `SELECT name FROM ${Base.adapter.quoteTableName("subscribers")} WHERE nick = 'alterself'`,
    );
    expect((row as { name: string }).name).toBe("Luke Holden");
  });

  it("all() returns every seeded subscriber", () => {
    expect(subscribers.all().length).toBe(3);
  });
});

describe("useFixtures reconciles the PK column against the schema", () => {
  withTransactionalFixtures(leaseFixtureConnection);

  const { bulbs } = fixtures(["bulbs"], {
    connection: () => Base.adapter,
    useTransactionalTests: false,
  });
  const { mixedCaseMonkeys } = fixtures(["mixedCaseMonkeys"], {
    connection: () => Base.adapter,
    useTransactionalTests: false,
  });
  const { mateys } = fixtures(["mateys"], {
    connection: () => Base.adapter,
    useTransactionalTests: false,
  });

  it("populates the `ID` column for a custom-PK table", async () => {
    const special = bulbs("special");
    expect(special.readAttribute("ID")).not.toBeNull();
    expect(special.readAttribute("ID")).not.toBeUndefined();
    const [row] = await Base.adapter.execute(
      `SELECT name FROM ${Base.adapter.quoteTableName("bulbs")} WHERE ${Base.adapter.quoteColumnName("ID")} = ${special.readAttribute("ID")}`,
    );
    expect((row as { name: string }).name).toBe("special");
  });

  it("round-trips the `monkeyID` primary-key column", () => {
    expect(Number(mixedCaseMonkeys("first").readAttribute("monkeyID"))).toBe(1);
    expect(Number(mixedCaseMonkeys("second").readAttribute("monkeyID"))).toBe(2);
  });

  it("seeds an id-less table without a PK column", async () => {
    const m = mateys("blackbeard_to_redbeard");
    expect(m.readAttribute("weight")).toBe(10);
    const rows = await Base.adapter.execute(
      `SELECT weight FROM ${Base.adapter.quoteTableName("mateys")}`,
    );
    expect(rows.length).toBe(1);
  });
});

describe("useFixtures seeds composite-primary-key tables", () => {
  withTransactionalFixtures(leaseFixtureConnection);

  const { cpkOrders, cpkOrderTags, cpkBooks } = fixtures(
    ["cpkOrders", "cpkOrderTags", "cpkBooks"],
    { connection: () => Base.adapter, useTransactionalTests: false },
  );

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

  it("generates both key columns for a composite-PK row that supplies neither", () => {
    const book = cpkBooks("cpk_book_with_generated_pk");
    expect(book.readAttribute("author_id")).not.toBeNull();
    expect(book.readAttribute("author_id")).not.toBeUndefined();
    expect(book.readAttribute("id")).not.toBeNull();
    expect(book.readAttribute("title")).toBe("Generated author's book");
  });
});

describe("useFixtures resolves STI subclasses on standalone load", () => {
  withTransactionalFixtures(leaseFixtureConnection);

  const { parrots } = fixtures(["parrots"], {
    connection: () => Base.adapter,
    useTransactionalTests: false,
  });
  const { vegetables } = fixtures(["vegetables"], {
    connection: () => Base.adapter,
    useTransactionalTests: false,
  });

  it("hydrates a LiveParrot-typed row as a LiveParrot instance", () => {
    expect(parrots("george")).toBeInstanceOf(LiveParrot);
    expect(parrots("george").readAttribute("parrot_sti_class")).toBe("LiveParrot");
  });

  it("hydrates a DeadParrot-typed row as a DeadParrot instance", () => {
    expect(parrots("polly")).toBeInstanceOf(DeadParrot);
    expect(parrots("polly").readAttribute("parrot_sti_class")).toBe("DeadParrot");
  });

  it("resolves the subclass-only `breed` enum via the row's STI class", async () => {
    const [row] = (await Base.adapter.execute(
      `SELECT breed FROM ${Base.adapter.quoteTableName("parrots")} WHERE name = 'Curious George'`,
    )) as { breed: number }[];
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
        expect(ModelClass.tableName.length, `${name}: tableName must be non-empty`).toBeGreaterThan(
          0,
        );
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

describe("fixtureRegistry ref targets", () => {
  it("every ref() points at a table that is itself loadable by name", async () => {
    const loadable = new Set<string>();
    for (const entry of Object.values(fixtureRegistry)) {
      if (isJoinTableEntry(entry)) {
        loadable.add(entry.joinTable);
      } else {
        if ("addOn" in entry) await entry.addOn?.();
        const M = await resolvePrimaryModel(entry);
        loadable.add(M.tableName);
      }
    }
    const offenders: string[] = [];
    for (const [name, entry] of Object.entries(fixtureRegistry)) {
      const data = (entry as { data: Record<string, Record<string, unknown>> }).data;
      const refTables = new Set<string>();
      for (const row of Object.values(data)) {
        for (const value of Object.values(row)) {
          if (isFixtureRef(value)) refTables.add(value.tableName);
        }
      }
      const unloadable = [...refTables].filter((t) => !loadable.has(t));
      if (unloadable.length)
        offenders.push(`${name} → refs unloadable table(s): ${unloadable.join(", ")}`);
    }
    expect(offenders, `registry entries with unsatisfiable refs:\n${offenders.join("\n")}`).toEqual(
      [],
    );
  }, 60000);
});

describe("resolveFixtureNames same-table guard", () => {
  it("resolves two requested sets that map to the same table", async () => {
    const map = await resolveFixtureNames(["deadParrots", "liveParrots"]);
    expect(Object.keys(map)).toEqual(["deadParrots", "liveParrots"]);
    expect(map.deadParrots.table).toBe("parrots");
    expect(map.liveParrots.table).toBe("parrots");
  });

  it("rejects two same-table sets whose rows collide on a primary key", async () => {
    await expect(resolveFixtureNames(["dogs", "otherDogs"])).rejects.toThrow(
      /both map to table "dogs" with a row that resolves to the same primary key/,
    );
  });

  it("resolves distinct-table sets without error", async () => {
    const map = await resolveFixtureNames(["authors", "posts"]);
    expect(Object.keys(map)).toEqual(["authors", "posts"]);
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
    const rows = (await Base.adapter.execute(
      `SELECT name FROM ${Base.adapter.quoteTableName("parrots")} ORDER BY name`,
    )) as { name: string }[];
    const names = rows.map((r) => r.name);
    expect(names).toContain("Dusty DeadBird");
    expect(names).toContain("Dusty Bluebird");
  });
});

describe("fixtureRegistry seeds against TEST_SCHEMA", () => {
  withTransactionalFixtures(leaseFixtureConnection);
  let restoreEncryption: (() => void) | undefined;
  beforeAll(async () => {
    restoreEncryption = await setupScopedEncryption();
  });
  afterAll(() => {
    restoreEncryption?.();
  });

  it("every registered entry seeds without error", async () => {
    const failures: string[] = [];
    for (const [name, entry] of Object.entries(fixtureRegistry)) {
      try {
        const data = (entry as { data: Record<string, Record<string, unknown>> }).data;
        if (isJoinTableEntry(entry)) {
          await defineJoinTableFixtures(Base.adapter, entry.joinTable, data);
        } else {
          if ("addOn" in entry) await entry.addOn?.();
          const ModelClass = await resolvePrimaryModel(entry);
          const seedAdapter = await leaseFixtureConnectionFor(ModelClass, Base.adapter);
          await defineFixtures(seedAdapter, ModelClass, data);
        }
      } catch (e) {
        failures.push(`${name}: ${(e as Error).message.split("\n")[0]}`);
      }
    }
    expect(failures, `unseedable registry entries:\n${failures.join("\n")}`).toEqual([]);
  }, 300000);
});

describe("useFixtures bootstraps the encryption add-on for encrypted fixtures", () => {
  withTransactionalFixtures(leaseFixtureConnection);

  // global encryption config doesn't leak into later suites in the worker.
  let restoreEncryption: (() => void) | undefined;
  beforeAll(async () => {
    restoreEncryption = await setupScopedEncryption();
  });
  afterAll(() => {
    restoreEncryption?.();
  });

  describe("encryptedBooks set", () => {
    const { encryptedBooks } = fixtures(["encryptedBooks"], {
      connection: () => Base.adapter,
      useTransactionalTests: false,
    });

    it("reads the encrypted name attribute back as its expected plaintext", () => {
      expect(encryptedBooks("awdr").readAttribute("name")).toBe("Agile Web Development with Rails");
    });

    it("stores ciphertext in the DB column, not cleartext", async () => {
      const book = encryptedBooks("awdr");
      const rawDbValue = book.readAttributeBeforeTypeCast?.("name");
      expect(rawDbValue).not.toBe("Agile Web Development with Rails");
      expect(typeof rawDbValue).toBe("string");
      const { encryptedAttribute } = await import("./encryption/encryptable-record.js");
      expect(encryptedAttribute.call(book, "name")).toBe(true);
    });
  });

  describe("encryptedBookThatIgnoresCases set", () => {
    const { encryptedBookThatIgnoresCases } = fixtures(["encryptedBookThatIgnoresCases"], {
      connection: () => Base.adapter,
      useTransactionalTests: false,
    });

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
      const { encryptedAttribute } = await import("./encryption/encryptable-record.js");
      expect(encryptedAttribute.call(book, "name")).toBe(true);
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

  it("awaits an entry's addOn before invoking its model thunk", async () => {
    type SpyableEntry = { addOn?: () => Promise<void>; model: () => Promise<typeof Base> };
    const entry = fixtureRegistry.encryptedBooks as unknown as SpyableEntry;
    const originalAddOn = entry.addOn;
    const originalModel = entry.model;
    const order: string[] = [];
    entry.addOn = vi.fn(async () => {
      order.push("addOn");
    });
    entry.model = vi.fn(async () => {
      order.push("model");
      return originalModel.call(entry);
    });
    try {
      await resolveFixtureNames(["encryptedBooks"]);
    } finally {
      entry.addOn = originalAddOn;
      entry.model = originalModel;
    }
    expect(order).toEqual(["addOn", "model"]);
  });
});

describe("FixtureSet.createFixtures", () => {
  it("returns keyed instances for all declared labels", async () => {
    const adapter = makeAdapter();
    const id1 = FixtureSet.identify("first");
    const id2 = FixtureSet.identify("second");
    const rows = new Map([
      [id1, { id: id1, title: "First" }],
      [id2, { id: id2, title: "Second" }],
    ]);
    const Topic = makeModel("topics", rows);

    const result = await FixtureSet.createFixtures(adapter, Topic, {
      first: { title: "First" },
      second: { title: "Second" },
    });

    expect(result.first).toMatchObject({ id: id1 });
    expect(result.second).toMatchObject({ id: id2 });
  });

  it("emits DELETE before INSERT so rows are replaced (cross-test isolation)", async () => {
    const adapter = makeAdapter();
    const id = FixtureSet.identify("rails");
    const rows = new Map([[id, { id, title: "Rails" }]]);
    const Topic = makeModel("topics", rows);

    await FixtureSet.createFixtures(adapter, Topic, { rails: { title: "Rails" } });

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
