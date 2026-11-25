import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Base as ActiveRecordBase } from "@blazetrails/activerecord";
import { I18n } from "../../../packages/activemodel/lib/index.js";
import { Notifications } from "../../../packages/activesupport/lib/index.js";
import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  Base,
  RecordInvalid,
  RecordNotFound,
  UnknownAttributeError,
  UnknownPrimaryKey,
  validate,
} from "./index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLES = ["authors", "posts", "tasks"];
const CANONICAL_SCHEMA = [
  `CREATE TABLE "authors" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, ` +
    `"name" varchar NOT NULL, "author_address_id" integer, "author_address_extra_id" integer, ` +
    `"organization_id" varchar, "owned_essay_id" varchar, "published_author_id" integer)`,
  `CREATE TABLE "posts" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "author_id" integer, ` +
    `"title" varchar NOT NULL, "body" text NOT NULL, "type" varchar, ` +
    `"legacy_comments_count" integer DEFAULT 0, "taggings_with_delete_all_count" integer DEFAULT 0, ` +
    `"taggings_with_destroy_count" integer DEFAULT 0, "tags_count" integer DEFAULT 0, ` +
    `"indestructible_tags_count" integer DEFAULT 0, "tags_with_destroy_count" integer DEFAULT 0, ` +
    `"tags_with_nullify_count" integer DEFAULT 0)`,
  `CREATE TABLE "tasks" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, ` +
    `"starting" datetime(6), "ending" datetime(6))`,
];
const BELONGS_TO = { className: "Author", foreignKey: "author_id" };

type Statement = [sql: string, binds: unknown[]];
type Row = Record<string, unknown>;
interface SqlPayload {
  name: string;
  sql: string;
  type_casted_binds: unknown[] | (() => unknown[]);
}

interface Model extends Row {
  save(): Promise<boolean>;
  saveBang(): Promise<unknown>;
  isValid(): Promise<boolean>;
  errors: ModelErrors;
  update(attributes: Row): Promise<boolean>;
  destroy(): Promise<unknown>;
  isNewRecord(): boolean;
  isPersisted(): boolean;
}
interface ModelErrors {
  add(attribute: string, type?: string): void;
  count: number;
  fullMessages: string[];
  messages: Record<string, string[]>;
  details: Record<string, unknown[]>;
  messagesFor(attribute: string): string[];
}
interface Query {
  where(conditions: Row): Query;
  order(ordering: Record<string, string>): Query;
  limit(value: number | string): Query;
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
  Task: ModelClass;
  Article: ModelClass;
}

function validations(model: {
  validates(attribute: string, options: Record<string, unknown>): void;
}): void {
  model.validates("title", { presence: true, length: { maximum: 5 } });
  model.validates("tags_count", {
    numericality: { onlyInteger: true, greaterThan: 0 },
    allowNil: true,
  });
  model.validates("body", { inclusion: { in: ["a", "b"] } });
  model.validates("title", { uniqueness: true });
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
  class Task extends ActiveRecordBase {
    static {
      this.tableName = "tasks";
    }
  }
  class Article extends ActiveRecordBase {
    static {
      this.tableName = "posts";
      validations(this);
    }
  }
  Object.defineProperty(Article, "name", { value: "Article" });
  Object.defineProperty(Author, "name", { value: "Author" });
  Object.defineProperty(Post, "name", { value: "Post" });
  Object.defineProperty(Task, "name", { value: "Task" });
  return { Author, Post, Task, Article } as unknown as Models;
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
  declare body: string | null;
  declare tags_count: number | null;
  declare author: Author | null | Promise<Author | null>;
}
class Task extends Base {
  static {
    this.tableName = "tasks";
  }
  declare starting: Temporal.Instant | null;
}
class Article extends Base {
  static {
    this.tableName = "posts";
    validations(this);
  }
  declare title: string | null;
  declare tags_count: number | null;
}
const spike = { Author, Post, Task, Article } as unknown as Models;

const faithfulLog: Statement[] = [];
const spikeLog: Statement[] = [];

beforeAll(async () => {
  constSet(TopLevel, "Author", faithful.Author);
  constSet(TopLevel, "Post", faithful.Post);
  constSet(TopLevel, "Article", faithful.Article);
  Notifications.subscribe("sql.active_record", (event: { payload: SqlPayload }) => {
    const { name, sql, type_casted_binds: binds } = event.payload;
    if (name === "TRANSACTION" || name === "SCHEMA" || name == null) return;
    faithfulLog.push(literalLimit([sql, [...(typeof binds === "function" ? binds() : binds)]]));
  });

  await ActiveRecordBase.establishConnection({ adapter: "sqlite3", database: ":memory:" });
  const connection = await ActiveRecordBase.leaseConnection();
  await Base.establishConnection({ adapter: "sqlite3", database: ":memory:" });
  for (const sql of CANONICAL_SCHEMA) {
    await connection.execute(sql);
    Base.connection.raw.exec(sql);
  }
  Base.connection.listener = (sql, binds) => spikeLog.push([sql, [...binds]]);
  for (const model of Object.values(faithful)) await model.loadSchema();
});

beforeEach(async () => {
  const connection = await ActiveRecordBase.leaseConnection();
  for (const table of TABLES) {
    await connection.execute(`DELETE FROM ${table}`);
    Base.connection.raw.exec(`DELETE FROM ${table}`);
  }
  faithfulLog.length = 0;
  spikeLog.length = 0;
});

function literalLimit([sql, binds]: Statement): Statement {
  const bound = / LIMIT \?(\) subquery_for_count)?$/;
  if (!bound.test(sql)) return [sql, binds];
  return [sql.replace(bound, ` LIMIT ${String(binds.at(-1))}$1`), binds.slice(0, -1)];
}

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
  await Post.create({ title: "one", body: "b", tags_count: 1, author_id: author.id });
  await Post.create({ title: "two", body: "b", tags_count: 2, author_id: author.id });
  return Post.create({ title: "three", body: "b", tags_count: 3 });
}

describe("record spike", () => {
  describe("toSql", () => {
    const queries: Record<string, (Post: ModelClass, Task: ModelClass) => Query> = {
      all: (Post) => Post.all(),
      "where equality": (Post) => Post.where({ title: "a" }),
      "where with a quote": (Post) => Post.where({ title: "it's" }),
      "where null": (Post) => Post.where({ title: null }),
      "where list": (Post) => Post.where({ id: [1, 2] }),
      "where empty list": (Post) => Post.where({ id: [] }),
      "where chained": (Post) => Post.where({ title: "a" }).where({ tags_count: 3 }),
      "where datetime": (_Post, Task) => Task.where({ starting: "2026-10-12 12:00:00" }),
      order: (Post) => Post.order({ id: "asc" }),
      "order by two columns": (Post) => Post.order({ tags_count: "desc", id: "asc" }),
      limit: (Post) => Post.limit(2),
      "where, order and limit": (Post) =>
        Post.where({ title: "a", tags_count: 3 }).order({ tags_count: "desc" }).limit(5),
    };
    for (const [name, query] of Object.entries(queries)) {
      it(`matches ActiveRecord for ${name}`, () => {
        expect(query(spike.Post, spike.Task).toSql()).toBe(
          query(faithful.Post, faithful.Task).toSql(),
        );
      });
    }
  });

  describe("read statements", () => {
    const reads: Record<string, (models: Models) => Promise<unknown>> = {
      find: async ({ Post }) => Post.find((await Post.first())?.id),
      "find with a string id": async ({ Post }) => Post.find(String((await Post.first())?.id)),
      findBy: ({ Post }) => Post.findBy({ title: "two" }),
      first: ({ Post }) => Post.first(),
      "first on a relation": ({ Post }) => Post.where({ title: "two" }).first(),
      "first keeps an order": ({ Post }) => Post.order({ tags_count: "desc" }).first(),
      count: ({ Post }) => Post.count(),
      "count on a relation": ({ Post }) => Post.where({ title: "two" }).count(),
      "count with a limit": ({ Post }) => Post.where({ body: "b" }).limit(2).count(),
      "count with an order": ({ Post }) => Post.order({ id: "desc" }).count(),
      "toArray with a string limit": ({ Post }) => Post.limit("2").toArray(),
      toArray: ({ Post }) =>
        Post.where({ tags_count: [1, 2] })
          .order({ id: "desc" })
          .toArray(),
      "toArray with a limit": ({ Post }) => Post.limit(2).toArray(),
      "includes loads the association in one extra query": ({ Post }) =>
        Post.includes("author").toArray(),
      "an unloaded belongsTo reader": async ({ Post }) => (await Post.first())?.author,
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
        return posts.map((post) => [
          post.id,
          post.author_id,
          post.title,
          post.body,
          post.tags_count,
        ]);
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
      create: ({ Post }) => Post.create({ title: "hi", body: "b", tags_count: 1 }),
      createBang: ({ Post }) => Post.createBang({ title: "hi", body: "b" }),
      "create with a datetime": ({ Task }) => Task.create({ starting: "2026-10-12 12:00:00" }),
      "create with no attributes": ({ Task }) => Task.create(),
      "new then save": ({ Post }) => new Post({ title: "n", body: "b" }).save(),
      "create through the association writer": async ({ Author, Post }) => {
        const author = await Author.create({ name: "Ann" });
        await Post.create({ title: "hi", body: "b", author });
      },
      update: async ({ Post }) =>
        (await Post.create({ title: "a", body: "b", tags_count: 1 })).update({ tags_count: 2 }),
      "update writes only changed columns": async ({ Post }) => {
        const post = await Post.create({ title: "a", body: "b", tags_count: 1 });
        await post.update({ title: "a", tags_count: 2 });
      },
      "assignment then save": async ({ Post }) => {
        const post = await Post.create({ title: "a", body: "b" });
        post.title = "b";
        post.tags_count = 7;
        await post.save();
      },
      "save with nothing changed sends nothing": async ({ Post }) => {
        const post = await Post.create({ title: "a", body: "b" });
        await post.save();
        await (await Post.find(post.id)).update({ title: "a" });
      },
      destroy: async ({ Post }) => (await Post.create({ title: "a", body: "b" })).destroy(),
    };
    for (const [name, write] of Object.entries(writes)) {
      it(`matches ActiveRecord for ${name}`, async () => {
        await expectSameStatements(write);
      });
    }

    it("tracks persistence state as ActiveRecord does", async () => {
      const [theirs, ours] = await onBoth(async ({ Post }) => {
        const post = new Post({ title: "a", body: "b" });
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

  describe("validations", () => {
    const report = (record: Model): unknown => ({
      count: record.errors.count,
      full: record.errors.fullMessages,
      messages: JSON.parse(JSON.stringify(record.errors.messages)),
      details: JSON.parse(JSON.stringify(record.errors.details)),
      title: record.errors.messagesFor("title"),
    });
    const cases: Record<string, (models: Models) => Promise<unknown>> = {
      "an invalid record": async ({ Article }) => {
        const article = new Article({ title: "", body: "zz", tags_count: 0 });
        return [
          await article.isValid(),
          report(article),
          await article.save(),
          article.isNewRecord(),
        ];
      },
      "a value too long, and one not an integer": async ({ Article }) => {
        const article = await Article.create({ title: "toolong", body: "a", tags_count: 1.5 });
        return [article.isPersisted(), report(article)];
      },
      "a value that is not a number": async ({ Article }) => {
        const article = new Article({ title: "a", body: "a", tags_count: "many" });
        return [await article.isValid(), report(article)];
      },
      "numbers written with an underscore, and in hexadecimal": async ({ Article }) => {
        const underscored = new Article({ title: "a", body: "a", tags_count: "1_000" });
        const hexadecimal = new Article({ title: "b", body: "a", tags_count: "0x10" });
        return [
          await underscored.isValid(),
          report(underscored),
          await hexadecimal.isValid(),
          report(hexadecimal),
        ];
      },
      "a valid record, then a duplicate": async ({ Article }) => {
        const first = await Article.create({ title: "ok", body: "a", tags_count: 2 });
        const second = await Article.create({ title: "ok", body: "b" });
        return [first.isPersisted(), report(first), second.isPersisted(), report(second)];
      },
      "an update that stays unique against other rows only": async ({ Article }) => {
        const article = await Article.create({ title: "ok", body: "a" });
        return [await article.update({ body: "b" }), await article.update({ body: "c" })];
      },
      "errors are replaced on the next validation": async ({ Article }) => {
        const article = new Article({ title: "", body: "a" });
        await article.isValid();
        article.title = "fine";
        return [await article.isValid(), report(article)];
      },
      "saveBang and createBang raise RecordInvalid": async ({ Article }) => {
        const save = await new Article({ body: "a" }).saveBang().catch((e: Error) => e.message);
        const create = await Article.createBang({ title: "toolong", body: "zz" }).catch(
          (e: Error) => e.message,
        );
        return [save, create];
      },
      "errors added by hand": async ({ Article }) => {
        const article = new Article({ title: "a", body: "a" });
        article.errors.add("base", "is odd");
        article.errors.add("title", "looks wrong");
        article.errors.add("body", ":blank");
        article.errors.add("tags_count");
        return report(article);
      },
    };
    for (const [name, body] of Object.entries(cases)) {
      it(`matches ActiveRecord for ${name}`, async () => {
        const [theirs, ours] = await onBoth(body);
        expect(ours).toEqual(theirs);
        expect(spikeLog).toEqual(faithfulLog);
      });
    }

    it("takes an application's translations through a function, with no i18n import", async () => {
      I18n.backend().storeTranslations("en", {
        attributes: { body: "Text" },
        errors: { messages: { inclusion: "is not on the list" } },
        activerecord: {
          attributes: { article: { tags_count: "Tag total" } },
          errors: {
            models: { article: { attributes: { title: { blank: "is needed" } } } },
            messages: { greater_than: "has to be over %{count}" },
          },
        },
      });
      Base.i18n = (key, options) =>
        I18n.exists(key) ? String(I18n.translate(key, options)) : undefined;
      try {
        const [theirs, ours] = await onBoth(async ({ Article }) => {
          const article = new Article({ title: "", body: "zz", tags_count: 0 });
          await article.isValid();
          return article.errors.fullMessages;
        });
        expect(ours).toEqual(theirs);
        expect(ours).toEqual([
          "Title is needed",
          "Tag total has to be over 0",
          "Text is not on the list",
        ]);
      } finally {
        Base.i18n = null;
        I18n.setBackend(new I18n.Simple());
      }
    });

    it("exposes the same check as a function over a record", () => {
      const article = new Article({ title: "", tags_count: 0 });
      expect(validate(article, Article._validators)).toEqual([
        { attribute: "title", type: ":blank", options: {} },
        { attribute: "tags_count", type: ":greater_than", options: { value: 0, count: 0 } },
        { attribute: "body", type: ":inclusion", options: { value: null } },
      ]);
      expect(article.errors.count).toBe(0);
    });

    it("raises RecordInvalid carrying the record", async () => {
      const error = await Article.createBang({ body: "a" }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(RecordInvalid);
      expect((error as RecordInvalid).record).toBeInstanceOf(Article);
    });
  });

  describe("the model layer", () => {
    it("defines one accessor pair per column on the prototype, from the database", async () => {
      await faithful.Post.create({ title: "a", body: "b" });
      const post = await Post.create({ title: "a", body: "b" });
      for (const column of ["id", "author_id", "title", "body", "type", "tags_count"]) {
        expect(Object.hasOwn(Post.prototype, column)).toBe(true);
        expect(Object.hasOwn(post, column)).toBe(false);
      }
      const before = Object.getOwnPropertyDescriptor(Post.prototype, "title");
      await Post.loadSchema();
      expect(Object.getOwnPropertyDescriptor(Post.prototype, "title")).toEqual(before);
    });

    it("casts integer, text and datetime columns", async () => {
      await faithful.Post.create({ title: 5, body: "b", tags_count: "12" });
      await faithful.Task.create({ starting: "2026-10-12 12:00:00" });
      const created = await Post.create({ title: 5, body: "b", tags_count: "12" });
      expect([created.title, created.tags_count]).toEqual(["5", 12]);
      const task = await Task.find((await Task.create({ starting: "2026-10-12 12:00:00" })).id);
      expect(task.starting).toBeInstanceOf(Temporal.Instant);
      expect(String(task.starting)).toBe("2026-10-12T12:00:00Z");
      expect(task.starting).toBe(task.starting);
    });

    it("raises UnknownPrimaryKey for a table with no primary key", async () => {
      Base.connection.raw.exec(`CREATE TABLE IF NOT EXISTS "edges" ("source_id" integer)`);
      class Edge extends Base {
        static {
          this.tableName = "edges";
        }
        declare source_id: number | null;
      }
      const edge = await Edge.create({ source_id: 1 });
      edge.source_id = 2;
      await expect(edge.save()).rejects.toThrow(UnknownPrimaryKey);
      await expect(edge.destroy()).rejects.toThrow(UnknownPrimaryKey);
      await expect(Edge.find(1)).rejects.toThrow(
        "Unknown primary key for table edges in model Edge.",
      );
      await expect(Edge.first()).rejects.toThrow(UnknownPrimaryKey);
      expect(await Edge.count()).toBe(1);
    });

    it("rejects a limit that is not an integer, since it is written into the SQL", () => {
      expect(() => Post.limit("1; DROP TABLE posts")).toThrow("limit takes an integer");
      expect(() => Post.limit(1.5)).toThrow("limit takes an integer");
    });

    it("leaves a question mark inside a quoted name alone in toSql", () => {
      expect(Post.where({ "odd?": "x" }).toSql()).toBe(
        `SELECT "posts".* FROM "posts" WHERE "posts"."odd?" = 'x'`,
      );
    });

    it("compares cast values, so a stored value that casts to null is not a change to null", async () => {
      await faithful.Post.create({ title: "a", body: "b" });
      const created = await Post.create({ title: "a", body: "b" });
      Base.connection.raw.exec(`UPDATE posts SET tags_count = '' WHERE id = ${created.id}`);
      const post = await Post.find(created.id);
      post.tags_count = null;
      expect(post.isChanged).toBe(false);
      post.tags_count = 3;
      expect(post.changes).toEqual({ tags_count: [null, 3] });
    });

    it("assigns by name through the model's table and rejects an unknown name", () => {
      expect(() => new Post({ nope: 1 })).toThrow(UnknownAttributeError);
      const post = new Post();
      post.assignAttributes({ title: "a", tags_count: 1 });
      expect(post.changes).toEqual({ title: [null, "a"], tags_count: [0, 1] });
    });

    it("answers a loaded belongsTo without a promise and an unloaded one with a promise", async () => {
      await faithful.Author.create({ name: "Ann" });
      await faithful.Post.create({ title: "a", body: "b" });
      await faithful.Post.create({ title: "b", body: "b" });
      const author = await Author.create({ name: "Ann" });
      const created = await Post.create({ title: "a", body: "b", author });
      expect(created.author).toBe(author);
      expect((await Post.create({ title: "b", body: "b" })).author).toBeNull();

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
