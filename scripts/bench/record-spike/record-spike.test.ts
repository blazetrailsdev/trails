import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Base as ActiveRecordBase } from "@blazetrails/activerecord";
import { Notifications } from "../../../packages/activesupport/lib/index.js";
import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Base, RecordNotFound, UnknownAttributeError } from "./index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = [
  `CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT)`,
  `CREATE TABLE posts (id INTEGER PRIMARY KEY, author_id INTEGER, title TEXT, ` +
    `views INTEGER, published_at DATETIME)`,
];
const BELONGS_TO = { className: "Author", foreignKey: "author_id" };

type Statement = [sql: string, binds: unknown[]];
type Row = Record<string, unknown>;
interface SqlPayload {
  name: string;
  sql: string;
  type_casted_binds: unknown[] | (() => unknown[]);
}

/** The surface the two packages share, so one test body can run against either. */
interface Model extends Row {
  save(): Promise<boolean>;
  update(attributes: Row): Promise<boolean>;
  destroy(): Promise<unknown>;
  isNewRecord(): boolean;
  isPersisted(): boolean;
}
interface Query {
  where(conditions: Row): Query;
  order(ordering: Record<string, string>): Query;
  limit(value: number): Query;
  includes(...names: string[]): Query;
  toArray(): Promise<Model[]>;
  first(): Promise<Model | null>;
  count(): Promise<number>;
  toSql(): string;
}
interface ModelClass extends Omit<Query, "toSql" | "toArray"> {
  new (attributes?: Row): Model;
  all(): Query;
  loadSchema(): Promise<unknown>;
  find(id: unknown): Promise<Model>;
  findBy(conditions: Row): Promise<Model | null>;
  create(attributes?: Row): Promise<Model>;
  createBang(attributes?: Row): Promise<Model>;
}
interface Models {
  Author: ModelClass;
  Post: ModelClass;
}

const faithful = (() => {
  class Author extends ActiveRecordBase {
    static {
      this.tableName = "authors";
    }
  }
  class Post extends ActiveRecordBase {
    static {
      this.tableName = "posts";
      this.belongsTo("author", BELONGS_TO);
    }
  }
  // The bundler renames a class that shares a name with one in module scope.
  Object.defineProperty(Author, "name", { value: "Author" });
  Object.defineProperty(Post, "name", { value: "Post" });
  return { Author, Post } as unknown as Models;
})();

class Author extends Base {
  static {
    this.tableName = "authors";
  }
  declare name: string | null;
}
class Post extends Base {
  static {
    this.tableName = "posts";
    this.belongsTo("author", BELONGS_TO);
  }
  declare author_id: number | null;
  declare title: string | null;
  declare views: number | null;
  declare published_at: Temporal.Instant | null;
  declare author: Author | null | Promise<Author | null>;
}
const spike = { Author, Post } as unknown as Models;

const faithfulLog: Statement[] = [];
const spikeLog: Statement[] = [];

beforeAll(async () => {
  constSet(TopLevel, "Author", faithful.Author);
  constSet(TopLevel, "Post", faithful.Post);
  Notifications.subscribe("sql.active_record", (event: { payload: SqlPayload }) => {
    const { name, sql, type_casted_binds: binds } = event.payload;
    if (name === "TRANSACTION" || name === "SCHEMA") return;
    faithfulLog.push(literalLimit([sql, [...(typeof binds === "function" ? binds() : binds)]]));
  });
});

beforeEach(async () => {
  await ActiveRecordBase.establishConnection({ adapter: "sqlite3", database: ":memory:" });
  const connection = await ActiveRecordBase.leaseConnection();
  for (const sql of SCHEMA) await connection.execute(sql);
  await faithful.Author.loadSchema();
  await faithful.Post.loadSchema();

  await Base.establishConnection({ adapter: "sqlite3", database: ":memory:" });
  for (const sql of SCHEMA) Base.connection.raw.exec(sql);
  Base.connection.listener = (sql, binds) => spikeLog.push([sql, [...binds]]);
  faithfulLog.length = 0;
  spikeLog.length = 0;
});

/** The spike writes LIMIT as a literal where ActiveRecord binds it (README, "Known differences"). */
function literalLimit([sql, binds]: Statement): Statement {
  if (!sql.endsWith(" LIMIT ?")) return [sql, binds];
  return [sql.replace(/\?$/, String(binds.at(-1))), binds.slice(0, -1)];
}

/** Runs one body against both model sets and answers what each sent to the database. */
async function onBoth<T>(body: (models: Models) => Promise<T> | T): Promise<[T, T]> {
  faithfulLog.length = 0;
  spikeLog.length = 0;
  return [await body(faithful), await body(spike)];
}

async function expectSameStatements(body: (models: Models) => Promise<unknown>): Promise<void> {
  await onBoth(body);
  expect(spikeLog).toEqual(faithfulLog);
  expect(spikeLog.length).toBeGreaterThan(0);
}

async function seed({ Author, Post }: Models): Promise<Model> {
  const author = await Author.create({ name: "Ann" });
  await Post.create({ title: "one", views: 1, author_id: author.id });
  await Post.create({ title: "two", views: 2, author_id: author.id });
  return Post.create({ title: "three", views: 3 });
}

describe("record spike", () => {
  describe("toSql", () => {
    const queries: Record<string, (Post: ModelClass) => Query> = {
      all: (Post) => Post.all(),
      "where equality": (Post) => Post.where({ title: "a" }),
      "where with a quote": (Post) => Post.where({ title: "it's" }),
      "where null": (Post) => Post.where({ title: null }),
      "where list": (Post) => Post.where({ id: [1, 2] }),
      "where empty list": (Post) => Post.where({ id: [] }),
      "where chained": (Post) => Post.where({ title: "a" }).where({ views: 3 }),
      "where datetime": (Post) => Post.where({ published_at: "2026-10-12 12:00:00" }),
      order: (Post) => Post.order({ id: "asc" }),
      "order by two columns": (Post) => Post.order({ views: "desc", id: "asc" }),
      limit: (Post) => Post.limit(2),
      "where, order and limit": (Post) =>
        Post.where({ title: "a", views: 3 }).order({ views: "desc" }).limit(5),
    };
    for (const [name, query] of Object.entries(queries)) {
      it(`matches ActiveRecord for ${name}`, () => {
        expect(query(spike.Post).toSql()).toBe(query(faithful.Post).toSql());
      });
    }
  });

  describe("read statements", () => {
    const reads: Record<string, (models: Models) => Promise<unknown>> = {
      find: ({ Post }) => Post.find(1),
      "find with a string id": ({ Post }) => Post.find("2"),
      findBy: ({ Post }) => Post.findBy({ title: "two" }),
      first: ({ Post }) => Post.first(),
      "first on a relation": ({ Post }) => Post.where({ title: "two" }).first(),
      "first keeps an order": ({ Post }) => Post.order({ views: "desc" }).first(),
      count: ({ Post }) => Post.count(),
      "count on a relation": ({ Post }) => Post.where({ title: "two" }).count(),
      toArray: ({ Post }) =>
        Post.where({ views: [1, 2] })
          .order({ id: "desc" })
          .toArray(),
      "toArray with a limit": ({ Post }) => Post.limit(2).toArray(),
      "includes loads the association in one extra query": ({ Post }) =>
        Post.includes("author").toArray(),
      "an unloaded belongsTo reader": async ({ Post }) => (await Post.find(1)).author,
    };
    for (const [name, read] of Object.entries(reads)) {
      it(`matches ActiveRecord for ${name}`, async () => {
        await onBoth(seed);
        await expectSameStatements(read);
      });
    }

    it("answers the same values", async () => {
      await onBoth(seed);
      const [theirs, ours] = await onBoth(async ({ Post }) => {
        const posts = await Post.order({ id: "asc" }).toArray();
        return posts.map((post) => [post.id, post.author_id, post.title, post.views]);
      });
      expect(ours).toEqual(theirs);
      expect(ours).toHaveLength(3);
    });

    it("raises RecordNotFound with ActiveRecord's message", async () => {
      const [theirs, ours] = await onBoth(({ Post }) => Post.find(999).catch((e: Error) => e));
      expect(ours).toBeInstanceOf(RecordNotFound);
      expect(ours.message).toBe(theirs.message);
    });
  });

  describe("write statements", () => {
    const writes: Record<string, (models: Models) => Promise<unknown>> = {
      create: ({ Post }) => Post.create({ title: "hi", views: 1 }),
      createBang: ({ Post }) => Post.createBang({ title: "hi" }),
      "create with a datetime": ({ Post }) =>
        Post.create({ title: "hi", published_at: "2026-10-12 12:00:00" }),
      "create with no attributes": ({ Post }) => Post.create(),
      "new then save": ({ Post }) => new Post({ title: "n" }).save(),
      "create through the association writer": async ({ Author, Post }) => {
        const author = await Author.create({ name: "Ann" });
        await Post.create({ title: "hi", author });
      },
      update: async ({ Post }) =>
        (await Post.create({ title: "a", views: 1 })).update({ views: 2 }),
      "update writes only changed columns": async ({ Post }) => {
        const post = await Post.create({ title: "a", views: 1 });
        await post.update({ title: "a", views: 2 });
      },
      "assignment then save": async ({ Post }) => {
        const post = await Post.create({ title: "a" });
        post.title = "b";
        post.views = 7;
        await post.save();
      },
      "save with nothing changed sends nothing": async ({ Post }) => {
        const post = await Post.create({ title: "a" });
        await post.save();
        await (await Post.find(post.id)).update({ title: "a" });
      },
      destroy: async ({ Post }) => (await Post.create({ title: "a" })).destroy(),
    };
    for (const [name, write] of Object.entries(writes)) {
      it(`matches ActiveRecord for ${name}`, async () => {
        await expectSameStatements(write);
      });
    }

    it("tracks persistence state as ActiveRecord does", async () => {
      const [theirs, ours] = await onBoth(async ({ Post }) => {
        const post = new Post({ title: "a" });
        const states = [[post.isNewRecord(), post.isPersisted(), post.isChanged]];
        await post.save();
        states.push([post.isNewRecord(), post.isPersisted(), post.isChanged, post.id]);
        post.title = "b";
        const changes = post.changes;
        states.push([
          post.isChanged,
          changes instanceof Map ? Object.fromEntries(changes) : changes,
        ]);
        await post.destroy();
        states.push([post.isNewRecord(), post.isPersisted()]);
        return states;
      });
      expect(ours).toEqual(theirs);
    });
  });

  describe("the model layer", () => {
    it("defines one accessor pair per column on the prototype, from the database", async () => {
      const post = await Post.create({ title: "a" });
      for (const column of ["id", "author_id", "title", "views", "published_at"]) {
        expect(Object.hasOwn(Post.prototype, column)).toBe(true);
        expect(Object.hasOwn(post, column)).toBe(false);
      }
      const before = Object.getOwnPropertyDescriptor(Post.prototype, "title");
      await Post.loadSchema();
      expect(Object.getOwnPropertyDescriptor(Post.prototype, "title")).toEqual(before);
    });

    it("casts integer, text and datetime columns", async () => {
      const created = await Post.create({
        title: 5,
        views: "12",
        published_at: "2026-10-12 12:00:00",
      });
      expect([created.title, created.views]).toEqual(["5", 12]);
      const post = await Post.find(created.id);
      expect(post.published_at).toBeInstanceOf(Temporal.Instant);
      expect(String(post.published_at)).toBe("2026-10-12T12:00:00Z");
      expect(post.published_at).toBe(post.published_at);
    });

    it("assigns by name through the model's table and rejects an unknown name", () => {
      expect(() => new Post({ nope: 1 })).toThrow(UnknownAttributeError);
      const post = new Post();
      post.assignAttributes({ title: "a", views: 1 });
      expect(post.changes).toEqual({ title: [null, "a"], views: [null, 1] });
    });

    it("answers a loaded belongsTo without a promise and an unloaded one with a promise", async () => {
      const author = await Author.create({ name: "Ann" });
      const created = await Post.create({ title: "a", author });
      expect(created.author).toBe(author);
      expect((await Post.create({ title: "b" })).author).toBeNull();

      const found = await Post.find(created.id);
      const unloaded = found.author;
      expect(unloaded).toBeInstanceOf(Promise);
      expect((await unloaded)?.name).toBe("Ann");
      expect(found.author).toBe(await unloaded);

      const [preloaded] = await Post.includes("author").where({ id: created.id }).toArray();
      expect((preloaded.author as Author).name).toBe("Ann");
    });
  });

  it("imports no trails package from any of its own modules", () => {
    const modules = readdirSync(HERE).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect(modules.length).toBeGreaterThan(5);
    for (const file of modules) {
      expect(readFileSync(path.join(HERE, file), "utf8")).not.toMatch(/@blazetrails\//);
    }
  });
});
