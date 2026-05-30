import { describe, it, expect, expectTypeOf, vi, beforeAll } from "vitest";
import { useFixtures, resolveFixtureNames } from "./use-fixtures.js";
import { fixtureRegistry } from "./fixtures-registry.js";
import { FixtureSet } from "./fixture-set.js";
import { Base } from "../base.js";
import "../relation.js"; // registers the Relation ctor so Model.findBy/.all/.count work
import { fixtureId, defineFixtures, isFixtureRef } from "./define-fixtures.js";
import { defineSchema } from "./define-schema.js";
import { createTestAdapter } from "../test-adapter.js";
import { setupHandlerSuite } from "./setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./use-handler-transactional-fixtures.js";
import { TEST_SCHEMA } from "./test-schema.js";
import { Author } from "./models/author.js";
import { Post } from "./models/post.js";
import type { DatabaseAdapter } from "../adapter.js";

const TYPE_CONTRACT_SCHEMA = {
  topics: { title: "string" },
  posts: { body: "string" },
} as const;

// The type-contract describe below declares `Topic extends Base` and
// `Post extends Base` with stubbed `findBy`, so test bodies never hit the
// DB. The Phase 5 audit (scripts/audit-define-schema.ts) nevertheless
// flags any file with `extends Base` that doesn't call `defineSchema`,
// so prime a real adapter once at module load. The schema isn't actually
// consumed by the current tests but documents the table shape these
// stub-backed models would map to under AR_NO_AUTO_SCHEMA=1.
beforeAll(async () => {
  const adapter = createTestAdapter();
  await defineSchema(adapter, TYPE_CONTRACT_SCHEMA);
});

function makeAdapter(): DatabaseAdapter {
  return {
    adapterName: "sqlite" as const,
    execute: vi.fn(async () => []),
    executeMutation: vi.fn(async () => 0),
    beginTransaction: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    createSavepoint: vi.fn(async () => {}),
    releaseSavepoint: vi.fn(async () => {}),
    rollbackToSavepoint: vi.fn(async () => {}),
    isNoDatabaseError: () => false,
    quote: (v: unknown) => (typeof v === "string" ? `'${v}'` : String(v)),
    quoteTableName: (n: string) => `"${n}"`,
    quoteColumnName: (n: string) => `"${n}"`,
  } as unknown as DatabaseAdapter;
}

function makeModel(tableName: string, rows: Map<unknown, Record<string, unknown>>, pk = "id") {
  return {
    tableName,
    primaryKey: pk,
    findBy: vi.fn(async (attrs: Record<string, unknown>) => rows.get(attrs[pk]) ?? null),
  } as any;
}

// --- useFixtures ---

describe("useFixtures", () => {
  const adapter = makeAdapter();
  const topicId = fixtureId("rails");
  const rows = new Map([[topicId, { id: topicId, title: "Rails" }]]);
  const Topic = makeModel("topics", rows);

  const { topics } = useFixtures({ topics: [Topic, { rails: { title: "Rails" } }] }, () => adapter);

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
  const topicId = fixtureId("rails");
  const postId = fixtureId("hello");
  const topicRows = new Map([[topicId, { id: topicId, title: "Rails" }]]);
  const postRows = new Map([[postId, { id: postId, title: "Hello" }]]);
  const Topic = makeModel("topics", topicRows);
  const Post = makeModel("posts", postRows);

  const { topics, posts } = useFixtures(
    {
      topics: [Topic, { rails: { title: "Rails" } }],
      posts: [Post, { hello: { title: "Hello" } }],
    },
    () => adapter,
  );

  it("both sets are accessible", () => {
    expect(topics("rails")).toMatchObject({ id: topicId });
    expect(posts("hello")).toMatchObject({ id: postId });
  });
});

// --- useFixtures type contract ---

describe("useFixtures type contract", () => {
  class Topic extends Base {
    declare title: string;
    static {
      this.tableName = "topics";
      // Stub findBy so the beforeEach registered by useFixtures doesn't require
      // the full Relation infrastructure during type-assertion tests.
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

  const { topics, posts } = useFixtures(
    {
      topics: [Topic, { first: { title: "First" }, second: { title: "Second" } }],
      posts: [Post, { welcome: { body: "Hi" } }],
    },
    () => makeAdapter() as any,
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

// --- useFixtures by registry name (string[] overload, real seeding) ---

describe("useFixtures by registry name", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(TEST_SCHEMA);
  });

  // author_addresses listed first: authors.author_address_id ref() resolves to its
  // declared ids, so the target set must load before its dependent.
  const { authors, posts } = useFixtures(
    ["authorAddresses", "authors", "posts"],
    () => Base.adapter,
  );

  it("loads authors by label with the expected attributes", async () => {
    const david = authors("david");
    expect(david.id).toBe(1);
    const [row] = await Base.adapter.execute(
      `SELECT name FROM ${Base.adapter.quoteTableName(Author.tableName)} WHERE id = 1`,
    );
    expect((row as { name: string }).name).toBe("David");
  });

  it("all() returns every seeded author", () => {
    expect(authors.all().length).toBe(3);
  });

  it("resolves cross-fixture ref() to the target fixture's declared id", async () => {
    // authors.david.author_address_id = ref("author_addresses", "david_address"),
    // and author_addresses.david_address declares id: 1. Read the persisted FK
    // straight from the row so the assertion doesn't depend on a reflected getter.
    const [a] = await Base.adapter.execute(
      `SELECT author_address_id FROM ${Base.adapter.quoteTableName(Author.tableName)} WHERE id = 1`,
    );
    expect((a as { author_address_id: number }).author_address_id).toBe(1);
    // posts.welcome.author_id = ref("authors", "david"), authors.david declares id: 1.
    const [p] = await Base.adapter.execute(
      `SELECT author_id FROM ${Base.adapter.quoteTableName(Post.tableName)} WHERE id = 1`,
    );
    expect((p as { author_id: number }).author_id).toBe(1);
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

// --- timestamp auto-stamp (Rails' fill_timestamps) ---

describe("useFixtures auto-stamps NOT NULL timestamps", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(TEST_SCHEMA);
  });

  // people.michael declares neither created_at nor updated_at, but both columns
  // are NOT NULL — defineFixtures must fill them with the current time, mirroring
  // Rails' FixtureSet::TableRow#fill_timestamps. Without it the INSERT fails.
  const { people } = useFixtures(["people"], () => Base.adapter);

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

// --- string / non-integer declared primary keys ---

describe("useFixtures with a string primary key", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(TEST_SCHEMA);
  });

  // Subscriber sets `self.primary_key = "nick"` (a string column). The fixture
  // row declares `nick: "alterself"`; resolveDeclaredPk must use that string
  // verbatim instead of coercing/rejecting it. Without string-PK support the
  // seeder threw on the non-integer declared id.
  const { subscribers } = useFixtures(["subscribers"], () => Base.adapter);

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

// --- fixture registry conformance ---

describe("fixtureRegistry conformance", () => {
  it("every entry resolves to a Base subclass with a table name and non-empty data", async () => {
    for (const [name, entry] of Object.entries(fixtureRegistry)) {
      const ModelClass = await (entry as { model: () => Promise<typeof Base> }).model();
      expect(typeof ModelClass, `${name}: model thunk must resolve to a class`).toBe("function");
      expect(ModelClass.prototype instanceof Base, `${name}: resolved model must extend Base`).toBe(
        true,
      );
      expect(typeof ModelClass.tableName, `${name}: model must declare a tableName`).toBe("string");
      expect(ModelClass.tableName.length, `${name}: tableName must be non-empty`).toBeGreaterThan(
        0,
      );
      // defineFixtures() throws on composite primary keys, so a registered entry
      // with one is a name-based API that always fails at seed time — reject it.
      expect(
        Array.isArray((ModelClass as { primaryKey: unknown }).primaryKey),
        `${name}: composite primary key is not seedable by defineFixtures — move to the gap list`,
      ).toBe(false);

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
    // A registered set whose data ref()s a non-registered table would seed FK
    // values from the CRC32 fallback (≠ the target's declared id), since the
    // target can't be loaded by name to populate the declared-id registry.
    const loadable = new Set<string>();
    for (const entry of Object.values(fixtureRegistry)) {
      const M = await (entry as { model: () => Promise<typeof Base> }).model();
      loadable.add(M.tableName);
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
  it("rejects two requested sets that resolve to the same table", async () => {
    // deadParrots + liveParrots are both STI subclasses on the `parrots` table.
    await expect(resolveFixtureNames(["deadParrots", "liveParrots"])).rejects.toThrow(
      /both map to table "parrots"/,
    );
  });

  it("resolves distinct-table sets without error", async () => {
    const map = await resolveFixtureNames(["authors", "posts"]);
    expect(Object.keys(map)).toEqual(["authors", "posts"]);
  });
});

// Seed-level conformance: the structural checks above can't see whether the
// model's primary key matches the *schema* table (id-less tables, custom-PK
// columns like `ID`/`monkeyID`, NOT NULL timestamps, composite schema PKs), nor
// strict-engine type mismatches that SQLite's dynamic typing hides (int→bool,
// integer overflow, STI string into an integer column, tz datetime literals).
// The only authoritative check is to actually seed each entry against the
// canonical TEST_SCHEMA — exactly what the name-based API does at runtime. This
// runs on every CI engine (SQLite/PostgreSQL/MariaDB), so "seedable" means
// seedable on the strictest engine. An entry that can't seed must move to the
// registry's gap list, not stay exposed.
describe("fixtureRegistry seeds against TEST_SCHEMA", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(TEST_SCHEMA);
  });

  it("every registered entry seeds without error", async () => {
    const failures: string[] = [];
    for (const [name, entry] of Object.entries(fixtureRegistry)) {
      try {
        const ModelClass = await (entry as { model: () => Promise<typeof Base> }).model();
        await defineFixtures(
          Base.adapter,
          ModelClass,
          (entry as { data: Record<string, Record<string, unknown>> }).data,
        );
      } catch (e) {
        failures.push(`${name}: ${(e as Error).message.split("\n")[0]}`);
      }
    }
    expect(failures, `unseedable registry entries:\n${failures.join("\n")}`).toEqual([]);
  }, 120000);
});

// --- FixtureSet.createFixtures ---

describe("FixtureSet.createFixtures", () => {
  it("returns keyed instances for all declared labels", async () => {
    const adapter = makeAdapter();
    const id1 = fixtureId("first");
    const id2 = fixtureId("second");
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
    const id = fixtureId("rails");
    const rows = new Map([[id, { id, title: "Rails" }]]);
    const Topic = makeModel("topics", rows);

    await FixtureSet.createFixtures(adapter, Topic, { rails: { title: "Rails" } });

    const sqls = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0] as string,
    );
    const deleteIdx = sqls.findIndex((s) => s.includes("DELETE FROM"));
    const insertIdx = sqls.findIndex((s) => s.includes("INSERT INTO"));
    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    expect(insertIdx).toBeGreaterThanOrEqual(0);
    expect(deleteIdx).toBeLessThan(insertIdx);
  });
});
