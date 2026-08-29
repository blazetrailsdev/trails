import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { Notifications, NotificationEvent as Event, Logger } from "@blazetrails/activesupport";
import { IntegerType, StringType, ValueType } from "@blazetrails/activemodel";
import { Nodes } from "@blazetrails/arel";
import { LogSubscriber } from "./log-subscriber.js";
import { QueryAttribute } from "./relation/query-attribute.js";
import { Base, RecordNotFound } from "./index.js";
import { registerModel } from "./associations.js";
import { fixtures } from "./test-fixtures.js";
import { currentAdapter } from "./support/adapter-helper.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Author } from "./test-helpers/models/author.js";
import { Post } from "./test-helpers/models/post.js";

class LogListener {
  events: Event[] = [];
  call(event: Event): void {
    this.events.push(event);
  }
}

class CaptureLogger extends Logger {
  debugs: string[] = [];
  constructor() {
    super(null);
  }
  override debug(message?: string | (() => string)): boolean {
    this.debugs.push(typeof message === "function" ? message() : (message ?? ""));
    return true;
  }
}

class DebugLogSubscriber extends LogSubscriber {
  capture = new CaptureLogger();
  override get logger(): Logger {
    return this.capture;
  }
}

async function logBinds(
  binds: unknown[],
  sql = "select * from topics where id = ?",
): Promise<string> {
  const subscriber = new DebugLogSubscriber();
  const conn = (await Topic.leaseConnection()) as any;
  const event = new Event("sql.active_record", null, null, "id", {
    name: "SQL",
    sql,
    binds,
    type_casted_binds: conn.typeCastedBinds(binds),
  });
  subscriber.sql(event);
  return subscriber.capture.debugs[0] ?? "";
}

describe("BindParameterTest", () => {
  fixtures(["topics", "authors", "authorAddresses", "posts"]);

  beforeAll(async () => {
    registerModel(Author);
    registerModel(Post);
  });

  afterEach(() => {
    Notifications.unsubscribeAll();
    Base.filterAttributes = [];
  });

  function statementCacheKeys(conn: any): string[] {
    return conn._statements.keys;
  }
  function toSqlKey(conn: any, arel: unknown): string {
    const sql = conn.toSql(arel);
    return typeof conn.sqlKey === "function" ? conn.sqlKey(sql) : sql;
  }
  function cachedStatement(conn: any, klass: any, key: string[]): string {
    const cache = klass.cachedFindByStatement(conn, JSON.stringify(key), () => {
      throw new Error(`${klass.name} has no cached statement by ${JSON.stringify(key)}`);
    });
    return cache._queryBuilder._sql;
  }

  it("statement cache", async (ctx) => {
    const conn = (await Topic.leaseConnection()) as any;
    ctx.skip(!conn.preparedStatements);
    conn.clearCache();

    const topics = Topic.where({ id: 1 });
    expect((await topics).map((t: any) => Number(t.id))).toEqual([1]);

    const key = toSqlKey(conn, topics.arel());
    expect(statementCacheKeys(conn)).toContain(key);

    conn.clearCache();
    expect(statementCacheKeys(conn)).not.toContain(key);
  });

  it("statement cache with query cache", async (ctx) => {
    const conn = (await Topic.leaseConnection()) as any;
    ctx.skip(!conn.preparedStatements);
    conn.enableQueryCacheBang();
    conn.clearCache();
    try {
      const topics = Topic.where({ id: 1 });
      expect((await topics).map((t: any) => Number(t.id))).toEqual([1]);

      expect(statementCacheKeys(conn)).toContain(toSqlKey(conn, topics.arel()));
    } finally {
      conn.disableQueryCacheBang();
    }
  });

  it("statement cache with find", async (ctx) => {
    const conn = (await Topic.leaseConnection()) as any;
    ctx.skip(!conn.preparedStatements);
    conn.clearCache();

    expect(Number((await Topic.find(1)).id)).toBe(1);
    const topicSql = cachedStatement(conn, Topic, [Topic.primaryKey as string]);
    expect(statementCacheKeys(conn)).toContain(toSqlKey(conn, topicSql));

    await expect(Author.find(999999)).rejects.toBeInstanceOf(RecordNotFound);
    const authorSql = cachedStatement(conn, Author, [Author.primaryKey as string]);
    expect(statementCacheKeys(conn)).toContain(toSqlKey(conn, authorSql));

    const authors = Author.where({ id: 999999 }).limit(1);
    expect(statementCacheKeys(conn)).toContain(toSqlKey(conn, authors.arel()));
  });

  it("statement cache with find by", async (ctx) => {
    const conn = (await Topic.leaseConnection()) as any;
    ctx.skip(!conn.preparedStatements);
    conn.clearCache();

    expect(Number((await Topic.findBy({ id: 1 }))!.id)).toBe(1);
    const topicSql = cachedStatement(conn, Topic, ["id"]);
    expect(statementCacheKeys(conn)).toContain(toSqlKey(conn, topicSql));

    await expect(Author.findByBang({ id: 999999 })).rejects.toBeInstanceOf(RecordNotFound);
    const authorSql = cachedStatement(conn, Author, ["id"]);
    expect(statementCacheKeys(conn)).toContain(toSqlKey(conn, authorSql));

    const authors = Author.where({ id: 999999 }).limit(1);
    expect(statementCacheKeys(conn)).toContain(toSqlKey(conn, authors.arel()));
  });

  it("statement cache with in clause", async (ctx) => {
    const conn = (await Topic.leaseConnection()) as any;
    ctx.skip(!conn.preparedStatements);
    conn.clearCache();

    const topics = Topic.where({ id: [1, 3] });
    expect(
      (await topics).map((t: any) => Number(t.id)).sort((a: number, b: number) => a - b),
    ).toEqual([1, 3]);

    expect(statementCacheKeys(conn)).not.toContain(toSqlKey(conn, topics.arel()));
  });

  it("statement cache with sql string literal", async (ctx) => {
    const conn = (await Topic.leaseConnection()) as any;
    ctx.skip(!conn.preparedStatements);
    conn.clearCache();

    const topics = Topic.where("topics.id = ?", 1);
    expect((await topics).map((t: any) => Number(t.id))).toEqual([1]);

    expect(statementCacheKeys(conn)).toContain(toSqlKey(conn, topics.arel()));
  });

  it("too many binds", async () => {
    const conn = (await Topic.leaseConnection()) as any;
    const bindParamsLength = conn.bindParamsLength();

    const ids = Array.from({ length: bindParamsLength }, (_, i) => i + 1);
    ids.push((2n ** 63n) as unknown as number);

    let topics = Topic.where({ id: ids });
    expect(await topics.count()).toBe(await Topic.count());

    topics = Topic.where().not({ id: ids });
    expect(await topics.count()).toBe(0);
  });

  it("too many binds with query cache", async () => {
    const conn = (await Topic.leaseConnection()) as any;
    conn.enableQueryCacheBang();
    try {
      const bindParamsLength = conn.bindParamsLength();
      const ids = Array.from({ length: bindParamsLength + 1 }, (_, i) => i + 1);

      let topics = Topic.where({ id: ids });
      expect(await topics.count()).toBe(await Topic.count());

      topics = Topic.where().not({ id: ids });
      expect(await topics.count()).toBe(0);
    } finally {
      conn.disableQueryCacheBang();
    }
  });

  it("materializes a record load whose IN exceeds the bind-params cap", async () => {
    const conn = (await Topic.leaseConnection()) as any;
    const ids = Array.from({ length: conn.bindParamsLength() + 1 }, (_, i) => i + 1);
    const topics = await Topic.where({ id: ids });
    expect(topics.length).toBe(await Topic.count());
  });

  it("bind from join in subquery", async (ctx) => {
    const conn = (await Topic.leaseConnection()) as any;
    ctx.skip(!conn.preparedStatements);

    const subquery = Author.joins(":thinkingPosts").where({ name: "David" });
    const scope = Author.from(subquery, "authors").where({ id: 1 });
    expect(await scope.count()).toBe(1);
  });

  it("binds are logged", async (ctx) => {
    const conn = (await Topic.leaseConnection()) as any;
    ctx.skip(!conn.preparedStatements);

    const sql = `select * from topics where id = ${new Nodes.BindParam(1).toSql()}`;
    const binds = [new QueryAttribute("id", 1, new ValueType())];

    const subscriber = new LogListener();
    const handle = Notifications.subscribe("sql.active_record", (e: Event) => subscriber.call(e));
    try {
      await conn.execQuery(sql, "SQL", binds);
      const message = subscriber.events.find((e) => e.payload.binds === binds);
      expect(message?.payload.binds).toBe(binds);
    } finally {
      Notifications.unsubscribe(handle);
    }
  });

  it("find one uses binds", async (ctx) => {
    const conn = (await Topic.leaseConnection()) as any;
    ctx.skip(!conn.preparedStatements);

    const subscriber = new LogListener();
    const sub = Notifications.subscribe("sql.active_record", (e: Event) => subscriber.call(e));
    try {
      await Topic.find(1);
      const message = subscriber.events.find((e) =>
        (e.payload.binds as any[])?.some((attr) => attr?.value === 1),
      );
      expect(message).toBeTruthy();
    } finally {
      Notifications.unsubscribe(sub);
    }
  });

  it("logs binds after type cast", async () => {
    const binds = [new QueryAttribute("id", "10", new IntegerType())];
    expect(await logBinds(binds)).toMatch(/\["id",10\]\]$/);
  });

  it("logs unnamed binds", async () => {
    const binds = ["abcd"];
    expect(await logBinds(binds, "select * from topics where title = $1")).toMatch(
      /\[null,"abcd"\]\]$/,
    );
  });

  it("binds with filtered attributes", async () => {
    Base.filterAttributes = ["auth"];
    const binds = [new QueryAttribute("auth_token", "abcd", new StringType())];
    expect(await logBinds(binds, "select * from users where auth_token = ?")).toContain(
      '["auth_token","[FILTERED]"]',
    );
  });

  function bindParams(conn: any, ids: (number | string)[]): string {
    const collector = conn.collector();
    const compiled = conn.visitor.compile(
      ids.map((i) => new Nodes.BindParam(i)),
      collector,
    );
    const [sql] = Array.isArray(compiled) ? compiled : [compiled];
    return sql;
  }

  async function assertBindParamsToSql(conn: any): Promise<void> {
    const table = conn.quoteTableName(Author.tableName);
    const pk = `${table}.${conn.quoteColumnName(Author.primaryKey)}`;

    let sql = `SELECT ${table}.* FROM ${table} WHERE (${pk} IN (${bindParams(conn, [1, 2, 3])}) OR ${pk} IS NULL)`;
    let authors = Author.where({ id: [1, 2, 3, null] });
    expect(conn.toSql(authors.arel())).toBe(sql);
    expect((await authors).length).toBe(3);

    sql = `SELECT ${table}.* FROM ${table} WHERE ${pk} IN (${bindParams(conn, [1, 2, 3])})`;
    authors = Author.where({ id: [1, 2, 3, 2n ** 63n] });
    expect(conn.toSql(authors.arel())).toBe(sql);
    expect((await authors).length).toBe(3);

    const params = currentAdapter("Mysql2Adapter", "TrilogyAdapter")
      ? bindParams(conn, ["1", "2", "3"])
      : bindParams(conn, [1, 2, 3]);
    sql = `SELECT ${table}.* FROM ${table} WHERE ${pk} IN (${params})`;
    const arelNode = new Nodes.BoundSqlLiteral(
      `SELECT ${table}.* FROM ${table} WHERE ${pk} IN (?)`,
      [[1, 2, 3]],
      null,
    );
    expect(conn.toSql(arelNode)).toBe(sql);
    expect((await conn.selectAll(arelNode)).length).toBe(3);
  }

  it("bind params to sql with prepared statements", async (ctx) => {
    const conn = (await Topic.leaseConnection()) as any;
    ctx.skip(!conn.preparedStatements);
    await assertBindParamsToSql(conn);
  });

  it("bind params to sql with unprepared statements", async (ctx) => {
    const conn = (await Topic.leaseConnection()) as any;
    ctx.skip(!conn.preparedStatements);
    await conn.unpreparedStatement(async () => {
      await assertBindParamsToSql(conn);
    });
  });

  it("nested unprepared statements", async (ctx) => {
    const conn = (await Topic.leaseConnection()) as any;
    ctx.skip(!conn.preparedStatements);
    expect(conn.preparedStatements).toBe(true);

    await conn.unpreparedStatement(async () => {
      expect(conn.preparedStatements).toBe(false);

      await conn.unpreparedStatement(async () => {
        expect(conn.preparedStatements).toBe(false);
      });

      expect(conn.preparedStatements).toBe(false);
    });

    expect(conn.preparedStatements).toBe(true);
  });
});
