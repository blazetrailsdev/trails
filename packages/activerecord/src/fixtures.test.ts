import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFile } from "fs/promises";
import { include } from "@blazetrails/ruby-compat";
import { FixtureSet, FixtureError } from "./fixtures.js";
import { PrimaryKeyError } from "./fixture-set/table-row.js";
import { Time } from "@blazetrails/date";
import {
  assertDifference,
  assertNoDifference,
  assertNotEmpty,
  assertRaises,
  Notifications,
  Duration,
  Logger,
} from "@blazetrails/activesupport";
import { primaryKeyErrorFixtureData } from "./test-helpers/fixtures/primary-key-error/primary-key-error.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { Base } from "./base.js";
import { fkObjectToPointToFixtureData } from "./test-helpers/fixtures/fk-object-to-point-to.js";
import { currentAdapter } from "./support/adapter-helper.js";
import { doubleColumnsHash } from "./test-helpers/double-columns.js";
import { fixtures, TestFixtures } from "./test-fixtures.js";
import { Organization } from "./test-helpers/models/organization.js";
import { ClassNameThatDoesNotFollowCONVENTIONS } from "./test-helpers/models/randomly-named-c1.js";
import {
  AdminClassNameThatDoesNotFollowCONVENTIONS1,
  AdminClassNameThatDoesNotFollowCONVENTIONS2,
} from "./test-helpers/models/admin/randomly-named-c1.js";
import { Bulb } from "./test-helpers/models/bulb.js";
import { Comment } from "./test-helpers/models/comment.js";
import { TrafficLight } from "./test-helpers/models/traffic-light.js";
import { Movie } from "./test-helpers/models/movie.js";
import { Computer } from "./test-helpers/models/computer.js";
import { ActiveRecordError, NotNullViolation } from "./errors.js";
import {
  bulbFixtureData,
  computerFixtureData,
  movieFixtureData,
} from "./test-helpers/fixtures/index.js";
import { CpkOrder } from "./test-helpers/models/cpk.js";
import { Task } from "./test-helpers/models/task.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Tree } from "./test-helpers/models/tree.js";
import { nakedYmlParrotsFixtureData } from "./test-helpers/fixtures/naked/yml/parrots.js";
import { nakedYmlTreesFixtureData } from "./test-helpers/fixtures/naked/yml/trees.js";
import { Aircraft } from "./test-helpers/models/aircraft.js";
import { Parrot } from "./test-helpers/models/parrot.js";
import { Reply } from "./test-helpers/models/reply.js";
import { registerModel } from "./associations.js";
import { topicFixtureData } from "./test-helpers/fixtures/topics.js";
import { taskFixtureData } from "./test-helpers/fixtures/tasks.js";
import { aircraftFixtureData } from "./test-helpers/fixtures/aircrafts.js";
import { Post } from "./test-helpers/models/post.js";
import { Joke } from "./test-helpers/models/joke.js";
import { Book } from "./test-helpers/models/book.js";
import { Course } from "./test-helpers/models/course.js";
import { College } from "./test-helpers/models/college.js";
import { withSecondPool } from "./support/setup-second-pool.js";
import { Account } from "./test-helpers/models/account.js";
import { Company } from "./test-helpers/models/company.js";
import { Matey } from "./test-helpers/models/matey.js";
import { DeadParrot, LiveParrot } from "./test-helpers/models/parrot.js";
import {
  badPostFixtureData,
  courseFixtureData,
  funnyJokeFixtureData,
  itemFixtureData,
} from "./test-helpers/fixtures/index.js";
import "./relation.js";
import { setVerifyForeignKeysForFixtures, verifyForeignKeysForFixtures } from "./active-record.js";

for (const model of [Topic, Reply, Task, Aircraft, Tree, Parrot]) {
  registerModel(model);
}

describe("PrimaryKeyErrorTest", () => {
  it("generates the correct value", async () => {
    const adapter = {
      execute: vi.fn(async () => []),
      beginTransaction: vi.fn(async () => {}),
      commit: vi.fn(async () => {}),
      rollback: vi.fn(async () => {}),
      createSavepoint: vi.fn(async () => {}),
      releaseSavepoint: vi.fn(async () => {}),
      rollbackToSavepoint: vi.fn(async () => {}),
      quote: (v: unknown) => (typeof v === "string" ? `'${v}'` : String(v)),
      quoteTableName: (n: string) => `"${n}"`,
      quoteColumnName: (n: string) => `"${n}"`,
    } as unknown as DatabaseAdapter;
    const pool = { withConnection: async (block: (c: unknown) => unknown) => block(adapter) };

    const AuthorModel = {
      connectionPool: () => pool,
      tableName: "authors",
      primaryKey: "id",
      loadSchema: async () => {},
      columns: () => Object.values(doubleColumnsHash("authors")),
      typeForAttribute: () => ({ type: () => "integer" }),
      _reflections: {
        ownedEssay: {
          name: "ownedEssay",
          joinForeignKey: "owned_essay_id",
          macro: "belongsTo",
          isPolymorphic: () => false,
          joinPrimaryKey: () => "name",
          klass: { primaryKey: "id", name: "Essay" },
          foreignKey: () => "owned_essay_id",
        },
      },
      findBy: vi.fn(async () => null),
    } as any;

    const e = await FixtureSet.createFixtures(
      { primary_key_error: primaryKeyErrorFixtureData },
      "primary_key_error",
      { primary_key_error: AuthorModel },
      AuthorModel,
    ).catch((err: Error) => err);
    expect(() => {
      throw e;
    }).toThrow(PrimaryKeyError);
    expect((e as Error).message).toContain("Unable to set");
  });
});

describe("FixturesWithForeignKeyViolationsTest", () => {
  async function withVerifyForeignKeysForFixtures(block: () => Promise<void>): Promise<void> {
    const settingWas = verifyForeignKeysForFixtures();
    setVerifyForeignKeysForFixtures(true);
    try {
      await block();
    } finally {
      setVerifyForeignKeysForFixtures(settingWas);
    }
  }

  afterEach(() => {
    FixtureSet.resetCache();
  });

  it("raises fk violations", async () => {
    await withVerifyForeignKeysForFixtures(async () => {
      const load = (): Promise<unknown> =>
        FixtureSet.createFixtures(
          { fk_pointing_to_non_existent_objects: { first: { fk_object_to_point_to_id: 4242 } } },
          ["fk_pointing_to_non_existent_objects"],
        );
      if (currentAdapter("SQLite3Adapter", "PostgreSQLAdapter")) {
        const error = await load().catch((e: Error) => e);
        expect(() => {
          throw error;
        }).toThrow();
        expect((error as Error).message).toContain(
          "Foreign key violations found in your fixture data. Ensure you aren't referring to labels that don't exist on associations.",
        );
        expect((error as Error).message).toContain("fk_pointing_to_non_existent_objects");
      } else {
        await expect(load()).resolves.not.toThrow();
      }
    });
  });

  it("does not raise if no fk violations", async () => {
    await FixtureSet.createFixtures({ fk_object_to_point_tos: fkObjectToPointToFixtureData }, [
      "fk_object_to_point_tos",
    ]);
    await withVerifyForeignKeysForFixtures(async () => {
      await expect(
        FixtureSet.createFixtures(
          { fk_pointing_to_non_existent_objects: { first: { fk_object_to_point_to_id: 1 } } },
          ["fk_pointing_to_non_existent_objects"],
        ),
      ).resolves.not.toThrow();
    });
  });
});

class InsertQuerySubscriber {
  events: string[] = [];

  call(event: { payload: Record<string, unknown> }): void {
    const sql = event.payload.sql as string;
    if (/INSERT/.test(sql)) this.events.push(sql);
  }
}

function stubMaxAllowedPacket(conn: unknown, packetSize: number) {
  return vi
    .spyOn(conn as { maxAllowedPacket(): Promise<number | null> }, "maxAllowedPacket")
    .mockResolvedValue(packetSize);
}

describe("FixturesTest", () => {
  const { topics, developers, binaries, trafficLights } = fixtures(
    [
      "topics",
      "developers",
      "accounts",
      "tasks",
      "categories",
      "funnyJokes",
      "binaries",
      "trafficLights",
      "trees",
    ],
    { useTransactionalTests: false },
  );

  const FIXTURES_ROOT = new URL("./fixture-set/test-data", import.meta.url).pathname;

  it.skipIf(!currentAdapter("Mysql2Adapter", "TrilogyAdapter", "PostgreSQLAdapter"))(
    "bulk insert",
    async () => {
      const subscriber = new InsertQuerySubscriber();
      const subscription = Notifications.subscribe("sql.active_record", (e) =>
        subscriber.call(e as never),
      );
      try {
        await FixtureSet.createFixtures({ bulbs: bulbFixtureData }, "bulbs", { bulbs: Bulb });
        expect(subscriber.events.length, "It takes one INSERT query to insert two fixtures").toBe(
          1,
        );
      } finally {
        Notifications.unsubscribe(subscription);
      }
    },
  );

  it.skipIf(!currentAdapter("Mysql2Adapter", "TrilogyAdapter", "PostgreSQLAdapter"))(
    "bulk insert multiple table with a multi statement query",
    async () => {
      const subscriber = new InsertQuerySubscriber();
      const subscription = Notifications.subscribe("sql.active_record", (e) =>
        subscriber.call(e as never),
      );
      try {
        await FixtureSet.createFixtures(
          { bulbs: bulbFixtureData, movies: movieFixtureData, computers: computerFixtureData },
          ["bulbs", "movies", "computers"],
          { bulbs: Bulb, movies: Movie, computers: Computer },
        );
        const conn = await Base.leaseConnection();
        const expectedSql = [
          `INSERT INTO ${conn.quoteTableName("bulbs")} .*`,
          `INSERT INTO ${conn.quoteTableName("movies")} .*`,
          `INSERT INTO ${conn.quoteTableName("computers")} .*`,
        ].join("\n");
        expect(subscriber.events.length).toBe(1);
        expect(subscriber.events[0]).toMatch(new RegExp(expectedSql));
      } finally {
        Notifications.unsubscribe(subscription);
      }
    },
  );

  it.skipIf(!currentAdapter("Mysql2Adapter", "TrilogyAdapter", "PostgreSQLAdapter"))(
    "bulk insert with a multi statement query raises an exception when any insert fails",
    async () => {
      expect(Aircraft.columnsHash()["wheels_count"].null).toBe(false);
      const fixtures = {
        aircraft: [
          { name: "working_aircrafts", wheels_count: 2 },
          { name: "broken_aircrafts", wheels_count: null },
        ],
      };

      await assertNoDifference(
        async () => (await Aircraft.count()) as number,
        null,
        async () => {
          await expect((await Base.leaseConnection()).insertFixturesSet(fixtures)).rejects.toThrow(
            NotNullViolation,
          );
        },
      );
    },
  );

  it.skipIf(!currentAdapter("Mysql2Adapter", "TrilogyAdapter", "PostgreSQLAdapter"))(
    "bulk insert with a multi statement query in a nested transaction",
    async () => {
      const fixtures = {
        traffic_lights: [{ location: "US", state: ["NY"], long_state: ["a"] }],
      };

      await assertDifference(
        async () => (await TrafficLight.count()) as number,
        1,
        null,
        async () => {
          await Base.transaction(async () => {
            const conn = await Base.leaseConnection();
            expect(conn.openTransactions()).toBe(1);
            await conn.insertFixturesSet(fixtures);
            expect(conn.openTransactions()).toBe(1);
          });
        },
      );
    },
  );

  it.skipIf(!currentAdapter("Mysql2Adapter", "TrilogyAdapter"))(
    "insert fixtures set raises an error when max allowed packet is smaller than fixtures set size",
    async () => {
      const conn = await Base.leaseConnection();
      const mysqlMargin = 2;
      const packetSize = 1024;
      const bytesNeededToHaveA1024BytesFixture = 906;
      const fixtures = {
        traffic_lights: [
          {
            location: "US",
            state: ["NY"],
            long_state: ["a".repeat(bytesNeededToHaveA1024BytesFixture)],
          },
        ],
      };

      const stub = stubMaxAllowedPacket(conn, packetSize - mysqlMargin);
      try {
        const error = (await assertRaises([ActiveRecordError], {}, () =>
          conn.insertFixturesSet(fixtures),
        )) as ActiveRecordError;
        expect(error.message).toMatch(new RegExp(`Fixtures set is too large ${packetSize}\\.`));
      } finally {
        stub.mockRestore();
      }
    },
  );

  it.skipIf(!currentAdapter("Mysql2Adapter", "TrilogyAdapter"))(
    "insert fixture set when max allowed packet is bigger than fixtures set size",
    async () => {
      const conn = await Base.leaseConnection();
      const packetSize = 1024;
      const fixtures = {
        traffic_lights: [{ location: "US", state: ["NY"], long_state: ["a".repeat(51)] }],
      };

      const stub = stubMaxAllowedPacket(conn, packetSize);
      try {
        await assertDifference(
          async () => (await TrafficLight.count()) as number,
          1,
          null,
          async () => {
            await conn.insertFixturesSet(fixtures);
          },
        );
      } finally {
        stub.mockRestore();
      }
    },
  );

  it.skipIf(!currentAdapter("Mysql2Adapter", "TrilogyAdapter"))(
    "insert fixtures set split the total sql into two chunks smaller than max allowed packet",
    async () => {
      const subscriber = new InsertQuerySubscriber();
      const subscription = Notifications.subscribe("sql.active_record", (e) =>
        subscriber.call(e as never),
      );
      const conn = await Base.leaseConnection();
      const packetSize = 1024;
      const fixtures = {
        traffic_lights: [{ location: "US", state: ["NY"], long_state: ["a".repeat(450)] }],
        comments: [{ post_id: 1, body: "a".repeat(450) }],
      };

      const stub = stubMaxAllowedPacket(conn, packetSize);
      try {
        await conn.insertFixturesSet(fixtures);

        expect(subscriber.events.length).toBe(2);
        expect(new TextEncoder().encode(subscriber.events[0]).length).toBeLessThan(packetSize);
        expect(new TextEncoder().encode(subscriber.events[1]).length).toBeLessThan(packetSize);
      } finally {
        stub.mockRestore();
        Notifications.unsubscribe(subscription);
      }
    },
  );

  it.skipIf(!currentAdapter("Mysql2Adapter", "TrilogyAdapter"))(
    "insert fixtures set concat total sql into a single packet smaller than max allowed packet",
    async () => {
      const subscriber = new InsertQuerySubscriber();
      const subscription = Notifications.subscribe("sql.active_record", (e) =>
        subscriber.call(e as never),
      );
      const conn = await Base.leaseConnection();
      const packetSize = 1024;
      const fixtures = {
        traffic_lights: [{ location: "US", state: ["NY"], long_state: ["a".repeat(200)] }],
        comments: [{ post_id: 1, body: "a".repeat(200) }],
      };

      const stub = stubMaxAllowedPacket(conn, packetSize);
      try {
        await assertDifference(
          [
            async () => (await TrafficLight.count()) as number,
            async () => (await Comment.count()) as number,
          ],
          +1,
          null,
          async () => {
            await conn.insertFixturesSet(fixtures);
          },
        );
        expect(subscriber.events.length).toBe(1);
      } finally {
        stub.mockRestore();
        Notifications.unsubscribe(subscription);
      }
    },
  );

  it("auto value on primary key", async () => {
    const fixtures = [
      { name: "first", wheels_count: 2 },
      { name: "second", wheels_count: 3 },
    ];
    const conn = await Base.leaseConnection();
    await expect(
      conn.insertFixturesSet({ aircraft: fixtures }, ["aircraft"]),
    ).resolves.not.toThrow();
    const result = await conn.selectAll("SELECT name, wheels_count FROM aircraft ORDER BY id");
    expect(result.toArray()).toEqual(fixtures);
  });

  it("attributes", async () => {
    const [topics] = await FixtureSet.createFixtures({ topics: topicFixtureData }, "topics", {
      topics: Topic,
    });
    expect(topics.get("first")!.get("title")).toBe("The First Topic");
    expect(topics.get("second")!.get("author_email_address")).toBeNull();
  });

  it("no args returns all", () => {
    const allTopics = topics();
    expect(allTopics.length).toBe(5);
    expect(allTopics[0].title).toBe("The First Topic");
    expect(allTopics[allTopics.length - 1].id).toBe(5);
  });

  it("no args record returns all without array", () => {
    const allBinaries = binaries();
    expect(allBinaries).toBeInstanceOf(Array);
    expect(binaries().length).toBe(2);
  });

  it("nil raises", () => {
    expect(() => topics(null as never)).toThrow();
    expect(() => topics([null] as never)).toThrow();
  });

  it("inserts", async () => {
    await FixtureSet.createFixtures({ topics: topicFixtureData }, "topics", { topics: Topic });
    const firstRow = await (
      await Base.leaseConnection()
    ).selectOne("SELECT * FROM topics WHERE author_name = 'David'");
    expect(firstRow?.["title"]).toBe("The First Topic");

    const secondRow = await (
      await Base.leaseConnection()
    ).selectOne("SELECT * FROM topics WHERE author_name = 'Mary'");
    expect(secondRow?.["author_email_address"]).toBeNull();
  });

  it("insert with datetime", async () => {
    await FixtureSet.createFixtures({ tasks: taskFixtureData }, "tasks", { tasks: Task });
    const first = await Task.find(1);
    expect(first).toBeTruthy();
  });

  it("insert with default function", async () => {
    await FixtureSet.createFixtures({ aircrafts: aircraftFixtureData }, "aircrafts", {
      aircrafts: Aircraft,
    });
    const aircraft = await Aircraft.findBy({ name: "boeing-with-no-manufactured-at" });
    expect(
      Math.abs(Time.now().toF() - (aircraft!.manufactured_at as Time).toF()),
    ).toBeLessThanOrEqual(1.1);
  });

  it("insert with default value", async () => {
    await FixtureSet.createFixtures({ aircrafts: aircraftFixtureData }, "aircrafts", {
      aircrafts: Aircraft,
    });
    const aircraft = await Aircraft.findBy({ name: "boeing-with-no-wheels" });
    expect(aircraft?.wheels_count).toBe(0);
  });

  it("logger level invariant", async () => {
    const previousLogger = Base.logger;
    try {
      Base.logger = new Logger(null);

      const level = (Base.logger as Logger).level;
      await FixtureSet.createFixtures({ topics: topicFixtureData }, "topics", { topics: Topic });
      expect((Base.logger as Logger).level).toBe(level);
    } finally {
      Base.logger = previousLogger;
    }
  });

  it("instantiation", async () => {
    const [topics] = await FixtureSet.createFixtures({ topics: topicFixtureData }, "topics", {
      topics: Topic,
    });
    expect(await topics.get("first")!.find()).toBeInstanceOf(Topic);
  });

  it("yaml file with invalid column", async () => {
    const e = await FixtureSet.createFixtures({ parrots: nakedYmlParrotsFixtureData }, "parrots", {
      parrots: Parrot,
    }).catch((err: Error) => err);
    expect(() => {
      throw e;
    }).toThrow(FixtureError);
    expect((e as Error).message).toBe('table "parrots" has no columns named "arrr", "foobar".');
  });

  it("yaml file with symbol columns", async () => {
    await FixtureSet.createFixtures({ trees: nakedYmlTreesFixtureData }, "trees", { trees: Tree });
    const root = await Tree.find(1);
    expect(root).toBeTruthy();
  });

  it("erb in fixtures", () => {
    expect(developers("dev_5").name).toBe("fixture_5");
  });

  it("empty yaml fixture", () => {
    expect(
      new FixtureSet(null, "accounts", Account, FIXTURES_ROOT + "/naked/yml/accounts"),
    ).not.toBeNull();
  });

  it("empty yaml fixture with a comment in it", () => {
    expect(
      new FixtureSet(null, "companies", Company, FIXTURES_ROOT + "/naked/yml/companies"),
    ).not.toBeNull();
  });

  it("binary in fixtures", async () => {
    const data = new Uint8Array(
      await readFile(new URL("./test-helpers/assets/flowers.jpg", import.meta.url)),
    );
    expect(new Uint8Array(binaries("flowers").data)).toEqual(data);
    expect(new Uint8Array(binaries("binary_helper").data)).toEqual(data);
  });

  it("serialized fixtures", () => {
    expect(trafficLights("uk").state).toEqual(["Green", "Red", "Orange"]);
  });
});

describe("FixturesWithoutInstantiationTest", () => {
  const { topics, developers, accounts } = fixtures(["topics", "developers", "accounts"]);

  it("accessor methods", () => {
    expect(topics("first").title).toBe("The First Topic");
    expect(developers("jamis").name).toBe("Jamis");
    expect(accounts("signals37").credit_limit).toBe(50);
  });

  it("accessor methods with multiple args", () => {
    expect(topics("first", "second").length).toBe(2);
    expect(() => topics(["first", "second"] as never)).toThrow();
  });

  it("reloading fixtures through accessor methods", async () => {
    expect(topics("first").title).toBe("The First Topic");
    await Topic.where({ id: topics("first").id }).updateAll({ title: "Fresh Topic!" });
    expect((await topics("first", true)).title).toBe("Fresh Topic!");
    expect(topics("first").title).toBe("Fresh Topic!");
  });
});

describe("TransactionalFixturesTest", () => {
  const { topics } = fixtures(["topics"], { useTransactionalTests: true });

  it("destroy", async () => {
    expect(topics("first")).not.toBeNull();
    await topics("first").destroy();
  });

  it("destroy just kidding", () => {
    expect(topics("first")).not.toBeNull();
  });
});

interface SetupTestState {
  first?: boolean;
  second?: boolean;
}

describe("MultipleFixturesTest", () => {
  fixtures(["topics"]);
  const test = fixtures(["developers", "accounts"]);

  it("fixture table names", () => {
    expect(test.fixtureTableNames).toEqual(["accounts", "developers", "topics"]);
  });
});

function setupTest(): SetupTestState {
  const state: SetupTestState = {};

  beforeEach(() => {
    state.first = true;
  });

  return state;
}

describe("SetupTest", () => {
  setupTest();

  it("nothing", () => {});
});

describe("SetupSubclassTest", () => {
  const state = setupTest();

  beforeEach(() => {
    state.second = true;
  });

  it("subclassing should preserve setups", () => {
    expect(state.first).toBeTruthy();
    expect(state.second).toBeTruthy();
  });
});

describe("OverlappingFixturesTest", () => {
  fixtures(["topics", "developers"]);
  const test = fixtures(["developers", "accounts"]);

  it("fixture table names", () => {
    expect(test.fixtureTableNames).toEqual(["accounts", "developers", "topics"]);
  });
});

describe("ForeignKeyFixturesTest", () => {
  fixtures(["fkTestHasPk", "fkTestHasFk"]);

  it("number1", () => {
    expect(true).toBeTruthy();
  });

  it("number2", () => {
    expect(true).toBeTruthy();
  });
});

describe("OverRideFixtureMethodTest", () => {
  const { topics: superTopics } = fixtures(["topics"]);

  function topics(name: "first") {
    const topic = superTopics(name);
    topic.title = "omg";
    return topic;
  }

  it("fixture methods can be overridden", () => {
    const x = topics("first");
    expect(x.title).toBe("omg");
  });
});

describe("FixtureWithSetModelClassTest", () => {
  const { otherPosts, otherComments } = fixtures(["otherPosts", "otherComments"], {
    useTransactionalTests: false,
  });

  it("uses fixture class defined in yaml", () => {
    expect(otherPosts("second_welcome")).toBeInstanceOf(Post);
  });

  it("loads the associations to fixtures with set model class", async () => {
    const post = otherPosts("second_welcome");
    const comment = otherComments("second_greetings");
    expect((await post.comments).map((c) => c.id)).toEqual([comment.id]);
    expect((await comment.post)?.id).toBe(post.id);
  });
});

describe("SetFixtureClassPrevailsTest", () => {
  const { badPosts } = fixtures(
    { badPosts: [Post, badPostFixtureData] },
    { useTransactionalTests: false },
  );

  it("uses set fixture class", () => {
    expect(badPosts("bad_welcome")).toBeInstanceOf(Post);
  });
});

describe.skipIf(!currentAdapter("PostgreSQLAdapter"))("FixturesResetPkSequenceTest", () => {
  fixtures(["accounts", "companies"], { useTransactionalTests: false });
  withSecondPool();

  let instances: Base[];

  beforeEach(async () => {
    await Course.loadSchema();
    instances = [
      new Account({ credit_limit: 50 }),
      new Company({ name: "RoR Consulting" }),
      new Course({ name: "Test" }),
    ];
  });

  it("resets to min pk with specified pk and sequence", async () => {
    for (const instance of instances) {
      const model = instance.constructor as typeof Base;
      await model.deleteAll();
      const connection = (await model.leaseConnection()) as unknown as {
        resetPkSequenceBang(
          table: string,
          pk?: string | null,
          sequence?: string | null,
        ): Promise<void>;
      };
      await connection.resetPkSequenceBang(
        model.tableName,
        model.primaryKey as string,
        model.sequenceName,
      );

      await instance.saveBang();
      expect(instance.id, `Sequence reset for ${model.tableName} failed.`).toBe(1);
    }
  });

  it("resets to min pk with default pk and sequence", async () => {
    for (const instance of instances) {
      const model = instance.constructor as typeof Base;
      await model.deleteAll();
      const connection = (await model.leaseConnection()) as unknown as {
        resetPkSequenceBang(table: string): Promise<void>;
      };
      await connection.resetPkSequenceBang(model.tableName);

      await instance.saveBang();
      expect(instance.id, `Sequence reset for ${model.tableName} failed.`).toBe(1);
    }
  });
});

describe("CheckSetTableNameFixturesTest", () => {
  const { funnyJokes } = fixtures(
    { funnyJokes: [Joke, funnyJokeFixtureData] },
    { useTransactionalTests: false },
  );

  it("table method", () => {
    expect(funnyJokes("a_joke")).toBeInstanceOf(Joke);
  });
});

describe("FixtureNameIsNotTableNameFixturesTest", () => {
  const { items } = fixtures({ items: [Book, itemFixtureData] }, { useTransactionalTests: false });

  it("named accessor", () => {
    expect(items("dvd")).toBeInstanceOf(Book);
  });
});

describe("FixtureNameIsNotTableNameMultipleFixturesTest", () => {
  const { items, funnyJokes } = fixtures(
    { items: [Book, itemFixtureData], funnyJokes: [Joke, funnyJokeFixtureData] },
    { useTransactionalTests: false },
  );

  it("named accessor of differently named fixture", () => {
    expect(items("dvd")).toBeInstanceOf(Book);
  });

  it("named accessor of same named fixture", () => {
    expect(funnyJokes("a_joke")).toBeInstanceOf(Joke);
  });
});

describe("CustomConnectionFixturesTest", () => {
  registerModel(College);
  const { courses } = fixtures(
    { courses: [Course, courseFixtureData] },
    { useTransactionalTests: false },
  );

  it("leaky destroy", async () => {
    expect(() => courses("ruby")).not.toThrow();
    await courses("ruby").destroy();
  });

  it("it twice in whatever order to check for fixture leakage", async () => {
    expect(() => courses("ruby")).not.toThrow();
    await courses("ruby").destroy();
  });
});

describe("TransactionalFixturesOnCustomConnectionTest", () => {
  registerModel(College);
  const { courses } = fixtures({ courses: [Course, courseFixtureData] });

  it("leaky destroy", async () => {
    expect(() => courses("ruby")).not.toThrow();
    await courses("ruby").destroy();
  });

  it("it twice in whatever order to check for fixture leakage", async () => {
    expect(() => courses("ruby")).not.toThrow();
    await courses("ruby").destroy();
  });
});

describe("CheckEscapedYamlFixturesTest", () => {
  const { funnyJokes } = fixtures(
    { funnyJokes: [Joke, funnyJokeFixtureData] },
    { useTransactionalTests: false },
  );

  it("proper escaped fixture", () => {
    expect(funnyJokes("another_joke").name).toBe("The \\n Aristocrats\nAte the candy\n");
  });
});

class DevelopersProject {}
describe("ManyToManyFixturesWithClassDefined", () => {
  fixtures(["developersProjects"]);

  it("this should run cleanly", () => {
    expect(true).toBeTruthy();
  });
});

const TIMESTAMP_COLUMNS = ["created_at", "created_on", "updated_at", "updated_on"] as const;

describe("FoxyFixturesTest", () => {
  const {
    parrots,
    pirates,
    treasures,
    ships,
    computers,
    developers,
    "admin/accounts": adminAccounts,
    "admin/users": adminUsers,
    liveParrots,
    deadParrots,
    books,
  } = fixtures(
    [
      "parrots",
      "parrotsPirates",
      "pirates",
      "treasures",
      "mateys",
      "ships",
      "computers",
      "developers",
      "admin/accounts",
      "admin/users",
      "liveParrots",
      "deadParrots",
      "books",
    ],
    { useTransactionalTests: false },
  );

  it("identifies strings", () => {
    expect(FixtureSet.identify("foo")).toBe(FixtureSet.identify("foo"));
    expect(FixtureSet.identify("foo")).not.toBe(FixtureSet.identify("FOO"));
  });

  it("identifies symbols", () => {
    expect(FixtureSet.identify("foo")).toBe(FixtureSet.identify("foo"));
  });

  it("identifies consistently", () => {
    expect(FixtureSet.identify("ruby")).toBe(207281424);
    expect(FixtureSet.identify("sapphire_2")).toBe(1066363776);

    expect(FixtureSet.identify("daddy", ":uuid")).toBe("f92b6bda-0d0d-5fe1-9124-502b18badded");
    expect(FixtureSet.identify("sonny", ":uuid")).toBe("b4b10018-ad47-595d-b42f-d8bdaa6d01bf");
  });

  it("populates timestamp columns", () => {
    for (const property of TIMESTAMP_COLUMNS) {
      expect(parrots("george").readAttribute(property), `should set ${property}`).not.toBeNull();
    }
  });

  it("does not populate timestamp columns if model has set record timestamps to false", () => {
    for (const property of TIMESTAMP_COLUMNS) {
      expect(ships("black_pearl").readAttribute(property), `should not set ${property}`).toBeNull();
    }
  });

  it("populates all columns with the same time", () => {
    let last: unknown = null;

    for (const property of TIMESTAMP_COLUMNS) {
      const current = parrots("george").readAttribute(property);
      last ??= current;

      expect(current).toEqual(last);
      last = current;
    }
  });

  it("only populates columns that exist", () => {
    expect(pirates("blackbeard").created_on).not.toBeNull();
    expect(pirates("blackbeard").updated_on).not.toBeNull();
  });

  it("preserves existing fixture data", () => {
    expect(String((pirates("redbeard").created_on as Time).toDate())).toBe(
      String(Duration.weeks(2).ago(Time.now()).toDate()),
    );
    expect(String((pirates("redbeard").updated_on as Time).toDate())).toBe(
      String(Duration.weeks(2).ago(Time.now()).toDate()),
    );
  });

  it("generates unique ids", () => {
    expect(parrots("george").id).not.toBeNull();
    expect(parrots("george").id).not.toBe(parrots("louis").id);
  });

  it("automatically sets primary key", () => {
    expect(ships("black_pearl")).not.toBeNull();
  });

  it("preserves existing primary key", () => {
    expect(ships("interceptor").id).toBe(2);
  });

  it("resolves belongs to symbols", async () => {
    expect((await pirates("blackbeard").parrot)?.id).toBe(parrots("george").id);
  });

  it("ignores belongs to symbols if association and foreign key are named the same", async () => {
    expect((await computers("workstation").developer)?.id).toBe(developers("david").id);
  });

  it("supports join tables", async () => {
    expect(await pirates("blackbeard").parrots.isInclude(parrots("george"))).toBeTruthy();
    expect(await pirates("blackbeard").parrots.isInclude(parrots("louis"))).toBeTruthy();
    expect(await parrots("george").pirates.isInclude(pirates("blackbeard"))).toBeTruthy();
  });

  it("supports timestamps in join tables", async () => {
    expect(developers("david").created_at).not.toBeNull();
    expect(computers("laptop").created_at).not.toBeNull();

    const klass = class extends Base {
      static {
        this.tableName = "computers_developers";
      }
    };

    const computersDevelopers = await klass.findBy({
      developer_id: developers("david").id,
      computer_id: computers("laptop").id,
    });
    expect(computersDevelopers?.readAttribute("created_at")).not.toBeNull();
  });

  it("supports inline habtm", async () => {
    expect(await parrots("george").treasures.isInclude(treasures("diamond"))).toBeTruthy();
    expect(await parrots("george").treasures.isInclude(treasures("sapphire"))).toBeTruthy();
    expect(await parrots("george").treasures.isInclude(treasures("ruby"))).toBeFalsy();
  });

  it("supports inline habtm with specified id", async () => {
    expect(await parrots("polly").treasures.isInclude(treasures("ruby"))).toBeTruthy();
    expect(await parrots("polly").treasures.isInclude(treasures("sapphire"))).toBeTruthy();
    expect(await parrots("polly").treasures.isInclude(treasures("diamond"))).toBeFalsy();
  });

  it("supports yaml arrays", async () => {
    expect(await parrots("louis").treasures.isInclude(treasures("diamond"))).toBeTruthy();
    expect(await parrots("louis").treasures.isInclude(treasures("sapphire"))).toBeTruthy();
  });

  it("strips DEFAULTS key", async () => {
    expect(() => parrots("DEFAULTS" as never)).toThrow();

    for (const t of ["sapphire", "ruby"] as const) {
      expect(await parrots("davey").treasures.isInclude(treasures(t))).toBeTruthy();
    }
  });

  it("supports label interpolation", () => {
    expect(parrots("frederick").name).toBe("frederick");
  });

  it("supports label string interpolation", () => {
    expect(pirates("mark").catchphrase).toBe("X marks the spot!");
  });

  it("supports label interpolation for integer label", () => {
    expect(pirates("1").catchphrase).toBe("#1 pirate!");
  });

  it("supports polymorphic belongs to", async () => {
    expect((await treasures("sapphire").looter)?.id).toBe(pirates("redbeard").id);
    expect((await treasures("ruby").looter)?.id).toBe(parrots("louis").id);
  });

  it("only generates a pk if necessary", async () => {
    const m = (await Matey.first())!;
    expect(() => {
      m.pirate = pirates("blackbeard");
      m.target = pirates("redbeard");
    }).not.toThrow();
  });

  it("supports sti", async () => {
    expect(parrots("polly")).toBeInstanceOf(DeadParrot);
    expect((await (parrots("polly") as DeadParrot).killer)?.id).toBe(pirates("blackbeard").id);
  });

  it("supports sti with respective files", async () => {
    expect(liveParrots("dusty")).toBeInstanceOf(LiveParrot);
    expect(deadParrots("deadbird")).toBeInstanceOf(DeadParrot);
    expect((await deadParrots("deadbird").killer)?.id).toBe(pirates("blackbeard").id);
  });

  it("resolves enums in sti subclasses", () => {
    expect((parrots("george") as LiveParrot).isAustralian()).toBeTruthy();
    expect((parrots("louis") as LiveParrot).isAfrican()).toBeTruthy();
    expect((parrots("frederick") as LiveParrot).isAfrican()).toBeTruthy();
  });

  it("namespaced models", async () => {
    expect((await adminAccounts("signals37").users).map((u) => u.id)).toContain(
      adminUsers("david").id,
    );
    expect(await adminAccounts("signals37").users.size()).toBe(2);
  });

  it("resolves enums", () => {
    expect(books("awdr").isPublished()).toBeTruthy();
    expect(books("awdr").isRead()).toBeTruthy();
    expect(books("rfr").isProposed()).toBeTruthy();
    expect(books("ddd").isPublished()).toBeTruthy();
  });
});

describe("ActiveSupportSubclassWithFixturesTest", () => {
  const { organizations } = fixtures(["organizations"]);

  it("foo", async () => {
    expect((await Organization.findBy({ name: "No Such Agency" }))?.id).toBe(
      organizations("nsa").id,
    );
  });
});

describe("CustomNameForFixtureOrModelTest", () => {
  const {
    randomlyNamedA9,
    "admin/randomlyNamedA9": adminRandomlyNamedA9,
    "admin/randomlyNamedB0": adminRandomlyNamedB0,
  } = fixtures(["randomlyNamedA9", "admin/randomlyNamedA9", "admin/randomlyNamedB0"]);

  it("named accessor for randomly named fixture and class", () => {
    expect(randomlyNamedA9("first_instance")).toBeInstanceOf(ClassNameThatDoesNotFollowCONVENTIONS);
  });

  it("named accessor for randomly named namespaced fixture and class", () => {
    expect(adminRandomlyNamedA9("first_instance")).toBeInstanceOf(
      AdminClassNameThatDoesNotFollowCONVENTIONS1,
    );
    expect(adminRandomlyNamedB0("second_instance")).toBeInstanceOf(
      AdminClassNameThatDoesNotFollowCONVENTIONS2,
    );
  });

  it("table name is defined in the model", () => {
    expect(FixtureSet.allLoadedFixtures["admin/randomlyNamedA9"].tableName).toBe(
      "randomly_named_table2",
    );
    expect(AdminClassNameThatDoesNotFollowCONVENTIONS1.tableName).toBe("randomly_named_table2");
  });
});

describe("IgnoreFixturesTest", () => {
  const { otherBooks, parrots } = fixtures(
    ["otherBooks", "parrots", "parrotsPirates", "pirates", "treasures"],
    { useTransactionalTests: false },
  );

  it("ignores books fixtures", async () => {
    expect(() => otherBooks("published" as never)).toThrow();
    expect(() => otherBooks("published_paperback" as never)).toThrow();
    expect(() => otherBooks("published_ebook" as never)).toThrow();

    expect(await Book.count()).toBe(2);
    expect(otherBooks("awdr").name).toBe("Agile Web Development with Rails");
    expect(otherBooks("awdr").status).toBe("published");
    expect(otherBooks("awdr").format).toBe("paperback");
    expect(otherBooks("awdr").language).toBe("english");

    expect(otherBooks("rfr").name).toBe("Ruby for Rails");
    expect(otherBooks("rfr").format).toBe("ebook");
    expect(otherBooks("rfr").status).toBe("published");
  });

  it("ignores parrots fixtures", () => {
    expect(() => parrots("DEFAULT" as never)).toThrow();
    expect(() => parrots("DEAD_PARROT" as never)).toThrow();

    expect(parrots("polly").parrot_sti_class).toBe("DeadParrot");
  });
});

describe("FixturesWithDefaultScopeTest", () => {
  const { bulbs } = fixtures(["bulbs"]);

  it("inserts fixtures excluded by a default scope", async () => {
    expect(await Bulb.count()).toBe(1);
    expect(await Bulb.unscoped().count()).toBe(2);
  });

  it("allows access to fixtures excluded by a default scope", () => {
    expect(bulbs("special").name).toBe("special");
  });
});

describe("FixturesWithAbstractBelongsTo", () => {
  const { pirates, doubloons } = fixtures(["pirates", "doubloons"]);

  it("creates fixtures with belongs_to associations defined in abstract base classes", async () => {
    expect(doubloons("blackbeards_doubloon")).not.toBeNull();
    expect((await doubloons("blackbeards_doubloon").pirate)?.id).toBe(pirates("blackbeard").id);
  });
});

describe("FixtureClassNamesTest", () => {
  let klass: (new () => object) & { fixtureClassNames: Record<string, unknown> };
  let savedCache: Record<string, unknown>;

  beforeEach(() => {
    klass = class {} as typeof klass;
    include(klass, TestFixtures);
    savedCache = { ...klass.fixtureClassNames };
  });

  afterEach(() => {
    klass.fixtureClassNames = savedCache;
  });

  it("fixture_class_names returns nil for unregistered identifier", () => {
    expect(klass.fixtureClassNames["unregistered_identifier"]).toBeUndefined();
  });
});

describe("MultipleFixtureConnectionsTest", () => {
  describe("CompositePkFixturesTest", () => {
    const { cpkOrders, cpkBooks, cpkAuthors, cpkReviews, cpkOrderAgreements } = fixtures([
      "cpkOrders",
      "cpkBooks",
      "cpkAuthors",
      "cpkReviews",
      "cpkOrderAgreements",
    ]);

    it("generates composite primary key for partially filled fixtures", () => {
      const alice = cpkAuthors("cpk_great_author");
      const aliceCpkBook = cpkBooks("cpk_great_author_first_book");
      const aliceCpkBookId = aliceCpkBook.id as unknown[];

      assertNotEmpty(aliceCpkBookId.filter((v) => v != null));
      expect(aliceCpkBookId[0]).toBe(alice.id);
      expect(aliceCpkBookId[aliceCpkBookId.length - 1]).not.toBeNull();
    });

    it("generates composite primary key ids", () => {
      assertNotEmpty((cpkOrders("cpk_groceries_order_1").id as unknown[]).filter((v) => v != null));

      for (const idColumn of cpkBooks("cpk_great_author_first_book").id as unknown[]) {
        expect(idColumn).not.toBeNull();
      }
    });

    it("generates composite primary key with unique components", () => {
      expect(new Set(cpkOrders("cpk_groceries_order_1").id as unknown[]).size).toBe(2);
    });

    it("resolves associations using composite primary keys", async () => {
      const review = cpkReviews("first_book_review");
      const generatedBook = cpkBooks("cpk_book_with_generated_pk");

      expect([review.author_id, review.number]).toEqual(generatedBook.id);
      expect(await review.book).toEqual(generatedBook);
    });

    it("resolves associations using composite primary keys with partially filled values", async () => {
      const review = cpkReviews("second_book_review_for_book_with_partial_pk_defined");
      const bookWithPartiallyFilledCpk = cpkBooks("cpk_great_author_first_book");

      expect([review.author_id, review.number]).toEqual(bookWithPartiallyFilledCpk.id);
      expect(await review.book).toEqual(bookWithPartiallyFilledCpk);
    });

    it("association with custom primary key", async () => {
      const order = cpkOrders("cpk_groceries_order_2");
      const orderAgreement = cpkOrderAgreements("order_agreement_three");

      const [, orderId] = order.id as unknown[];

      expect(orderAgreement.order_id).toBe(orderId);
      expect((await orderAgreement.order)?.id).toEqual(order.id);
    });

    it("composite identify resolves to same values", () => {
      const identifyOne = FixtureSet.compositeIdentify("label", ["a", "b", "c"]);
      const identifyTwo = FixtureSet.compositeIdentify("label", ["a", "b", "c"]);

      expect(identifyOne).toEqual(identifyTwo);
    });

    it("composite identify returns hash with key names", () => {
      const id = FixtureSet.compositeIdentify("order", CpkOrder.primaryKey as string[]);

      expect(Object.keys(id)).toEqual(["shop_id", "id"]);
    });

    it("composite identify uses same hashing algorithm as identify for first attribute", () => {
      const idHash = FixtureSet.compositeIdentify("order", ["first_attribute", "second_attribute"]);
      const id = FixtureSet.identify("order");

      expect(idHash["first_attribute"]).toBe(id);
      expect(idHash["second_attribute"]).not.toBe(id);
    });

    it("composite identify hashes one label to same values irrespective of column names", () => {
      const idHashOne = FixtureSet.compositeIdentify("order", [
        "first_attribute",
        "second_attribute",
      ]);
      const idHashTwo = FixtureSet.compositeIdentify("order", ["shop_id", "id"]);

      expect(Object.values(idHashOne)).toEqual(Object.values(idHashTwo));
      expect(Object.keys(idHashOne)).not.toEqual(Object.keys(idHashTwo));
    });

    it("composite identify hashes to same values based on position in key", () => {
      const id = FixtureSet.identify("order");
      const idHashTwo = FixtureSet.compositeIdentify("order", ["one", "two"]);
      const idHashThree = FixtureSet.compositeIdentify("order", ["one", "two", "three"]);

      expect(Object.values(idHashTwo)[0]).toBe(id);
      expect(Object.values(idHashThree)[0]).toBe(id);
      expect(Object.values(idHashThree).slice(0, 2)).toEqual(Object.values(idHashTwo));
    });
  });
});

describe("HasManyThroughFixture", () => {
  fixtures([]);

  const FIXTURES_ROOT = new URL("./fixture-set/test-data", import.meta.url).pathname;

  function makeModel(name: string): typeof Base {
    const klass = class extends Base {};
    Object.defineProperty(klass, "name", { value: name });
    return klass;
  }

  function loadHasAndBelongsToMany(): Record<string, Record<string, unknown>[]> {
    const parrot = makeModel("Parrot");
    parrot.hasAndBelongsToMany("treasures");

    const parrots = `${FIXTURES_ROOT}/parrots`;

    const fs = new FixtureSet(null, "parrots", parrot, parrots);
    return fs.tableRows();
  }

  it("has many through with join table name changed to match habtm table name", () => {
    const pt = makeModel("ParrotTreasure");
    const parrot = makeModel("Parrot");
    const treasure = makeModel("Treasure");

    pt.tableName = "parrots_treasures";
    pt.belongsTo("parrot", { anonymousClass: parrot });
    pt.belongsTo("treasure", { anonymousClass: treasure });

    parrot.hasMany("parrot_treasures", { anonymousClass: pt });
    parrot.hasMany("treasures", { through: "parrot_treasures" });

    const parrots = `${FIXTURES_ROOT}/parrots`;

    const fs = new FixtureSet(null, "parrots", parrot, parrots);
    const rows = fs.tableRows();
    expect(rows["parrots_treasures"]).toEqual(loadHasAndBelongsToMany()["parrots_treasures"]);
  });

  it("has many through with default table name on join table", () => {
    const pt = makeModel("ParrotTreasure");
    const parrot = makeModel("Parrot");
    const treasure = makeModel("Treasure");

    pt.belongsTo("parrot", { anonymousClass: parrot });
    pt.belongsTo("treasure", { anonymousClass: treasure });

    parrot.hasMany("parrot_treasures", { anonymousClass: pt });
    parrot.hasMany("treasures", { through: "parrot_treasures" });

    const parrots = `${FIXTURES_ROOT}/parrots`;

    const fs = new FixtureSet(null, "parrots", parrot, parrots);
    const rows = fs.tableRows();
    expect(rows["parrot_treasures"]).toEqual(loadHasAndBelongsToMany()["parrots_treasures"]);
  });

  it("has and belongs to many order", () => {
    expect(Object.keys(loadHasAndBelongsToMany())).toEqual(["parrots", "parrots_treasures"]);
  });
});
