import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { Base, registerModel } from "./index.js";
import { MissingAttributeError } from "@blazetrails/activemodel";
import {
  assertChanges,
  assertNotDeprecated,
  assertNothingRaised,
  assertRaises,
} from "@blazetrails/activesupport";
import { assertQueriesCount } from "./testing/query-assertions.js";
import { deprecator } from "./deprecator.js";
import { adapterType } from "./test-adapter.js";
import { fixtures } from "./test-fixtures.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Reply, SillyReply } from "./test-helpers/models/reply.js";
import { Keyboard } from "./test-helpers/models/keyboard.js";
import { Subscriber } from "./test-helpers/models/subscriber.js";
import { MixedCaseMonkey } from "./test-helpers/models/mixed-case-monkey.js";
import { Dashboard } from "./test-helpers/models/dashboard.js";
import { NonPrimaryKey } from "./test-helpers/models/non-primary-key.js";
import { CpkBook, CpkOrder } from "./test-helpers/models/cpk.js";
import { Country } from "./test-helpers/models/country.js";
import { dumpTableSchema } from "./support/schema-dumping-helper.js";

describe("PrimaryKeysTest", () => {
  const { topics, subscribers, mixedCaseMonkeys } = fixtures([
    "topics",
    "subscribers",
    "movies",
    "mixedCaseMonkeys",
  ]);

  beforeAll(async () => {
    registerModel(Reply);
    registerModel(SillyReply);
  });

  it("to key with default primary key", async () => {
    const topic = new Topic();
    expect(topic.toKey()).toBeNull();
    const found = await Topic.find(topics("first").id);
    expect(found.toKey()).toEqual([topics("first").id]);
  });

  it("resolves a custom string primary key with no explicit primary_key= via the schema cache", async () => {
    (Country as unknown as { resetColumnInformation?: () => void }).resetColumnInformation?.();
    await (Country as unknown as { loadSchema?: () => Promise<void> }).loadSchema?.();
    expect(Country.primaryKey).toBe("country_id");
  });

  it("to key with customized primary key", async () => {
    const keyboard = new Keyboard();
    expect(keyboard.toKey()).toBeNull();
    await keyboard.saveBang();
    expect(keyboard.toKey()).toEqual([keyboard.id]);
  });

  it.skip("to key with composite primary key", () => {
    // BLOCKED: composite-primary-key-id-reader-collapses-all-nil-to-nil
    const order = new CpkOrder();
    expect(order.toKey()).toEqual([null, null]);
    order.id = [1, 2];
    expect((order.toKey() ?? []).map(Number)).toEqual([1, 2]);
  });

  it("read attribute id", async () => {
    const topic = await Topic.find(topics("first").id);
    const id = await assertNotDeprecated(deprecator(), () => topic.readAttribute("id"));

    expect(Number(id)).toBe(1);
  });

  it("read attribute with custom primary key does not return it when reading the id attribute", async () => {
    const keyboard = await Keyboard.createBang();
    expect(keyboard.readAttribute("id")).toBeNull();
  });

  it("write_attribute id remaps to a scalar custom primary key", async () => {
    const keyboard = await Keyboard.createBang();
    keyboard.writeAttribute("id", 42);
    expect(Number(keyboard.readAttribute("key_number"))).toBe(42);
  });

  it("write_attribute id on a composite primary key raises", () => {
    const book = new CpkBook();
    expect(() => book.writeAttribute("id", 7)).toThrow(
      'can\'t write unknown attribute `["author_id", "id"]`',
    );
  });

  it("read attribute with composite primary key", async () => {
    const book = new CpkBook();
    book.id = [1, 2];
    const id = await assertNotDeprecated(deprecator(), () => book.readAttribute("id"));

    expect(id).toBe(2);
  });

  it("to key with primary key after destroy", async () => {
    const d = (await Dashboard.createBang({
      dashboard_id: "destroy-pk-test",
    } as any)) as unknown as Dashboard;
    const dId = d.id;
    await d.destroy();
    expect(d.toKey()).toEqual([dId]);
  });

  it("id was", async () => {
    const topic = await Topic.find(topics("first").id);
    expect(Number(topic.id)).toBe(1);
    topic.id = 3;
    expect(Number((topic as any).idWas)).toBe(1);
    expect(Number(topic.id)).toBe(3);
  });

  it("id?", async () => {
    const topic = await Topic.find(topics("first").id);

    await assertChanges(
      () => (topic as any).isId,
      null,
      { from: true, to: false },
      () => {
        topic.id = null as unknown as number;
      },
    );
  });

  it("integer key", async () => {
    let topic = await Topic.find(1);
    expect(topic.author_name).toBe(topics("first").author_name);
    topic = await Topic.find(2);
    expect(topic.author_name).toBe(topics("second").author_name);

    topic = new Topic();
    topic.title = "New Topic";
    expect(topic.id).toBeNull();
    await topic.saveBang();
    const id = topic.id;

    const topicReloaded = await Topic.find(id);
    expect(topicReloaded.title).toBe("New Topic");
  });

  it("customized primary key auto assigns on save", async () => {
    await Keyboard.deleteAll();
    const keyboard = new Keyboard({ name: "HHKB" });
    await keyboard.saveBang();
    expect(((await Keyboard.findBy({ name: "HHKB" })) as Keyboard).id).toBe(keyboard.id);
  });

  it("customized primary key can be get before saving", () => {
    const keyboard = new Keyboard();
    expect(keyboard.id).toBeNull();
    expect(keyboard.key_number).toBeNull();
  });

  it("customized string primary key settable before save", () => {
    const subscriber = new Subscriber();
    subscriber.id = "webster123";
    expect(subscriber.id).toBe("webster123");
    expect(subscriber.nick).toBe("webster123");
  });

  it("update with non primary key id column", async () => {
    const subscriber = (await Subscriber.first()) as Subscriber;
    await subscriber.update({ update_count: 1 });
    await subscriber.reload();
    expect(subscriber.update_count).toBe(1);
  });

  it("update columns with non primary key id column", async () => {
    const subscriber = (await Subscriber.first()) as Subscriber;
    await subscriber.updateColumns({ id: 1 });
    expect(subscriber.nick).not.toBe(1);
  });

  it("string key", async () => {
    let sub = await Subscriber.find(subscribers("first").nick);
    expect(sub.name).toBe(subscribers("first").name);
    sub = await Subscriber.find(subscribers("second").nick);
    expect(sub.name).toBe(subscribers("second").name);

    const newSub = new Subscriber();
    newSub.id = "jdoe";
    expect(newSub.id).toBe("jdoe");
    newSub.name = "John Doe";
    await newSub.saveBang();
    expect(newSub.id).toBe("jdoe");

    const reloaded = await Subscriber.find("jdoe");
    expect(reloaded.name).toBe("John Doe");
  });

  it("id column that is not primary key", async () => {
    await NonPrimaryKey.createBang({ id: 100 } as any);
    const actual = await NonPrimaryKey.findBy({ id: 100 } as any);
    expect(actual!.inspect()).toMatch(/<NonPrimaryKey id: 100/);
  });

  it("find with more than one string key", async () => {
    const found = await Subscriber.find(subscribers("first").nick, subscribers("second").nick);
    expect(found.length).toBe(2);
  });

  it("primary key prefix", () => {
    const oldPrimaryKeyPrefixType = Base.primaryKeyPrefixType;
    try {
      Base.primaryKeyPrefixType = "table_name";
      Topic.resetPrimaryKey();
      expect(Topic.primaryKey).toBe("topicid");

      Base.primaryKeyPrefixType = "table_name_with_underscore";
      Topic.resetPrimaryKey();
      expect(Topic.primaryKey).toBe("topic_id");

      Base.primaryKeyPrefixType = null;
      Topic.resetPrimaryKey();
      expect(Topic.primaryKey).toBe("id");
    } finally {
      Base.primaryKeyPrefixType = oldPrimaryKeyPrefixType;
    }
  });

  it("delete should quote pkey", async () => {
    await expect(MixedCaseMonkey.delete(mixedCaseMonkeys("first").monkeyID)).resolves.not.toThrow();
  });

  it("update counters should quote pkey and quote counter columns", async () => {
    await expect(
      MixedCaseMonkey.updateCounters(mixedCaseMonkeys("first").monkeyID, { fleaCount: 99 }),
    ).resolves.not.toThrow();
  });

  it("find with one id should quote pkey", async () => {
    await assertNothingRaised(() => MixedCaseMonkey.find(mixedCaseMonkeys("first").monkeyID));
  });

  it("find with multiple ids should quote pkey", async () => {
    await assertNothingRaised(() =>
      MixedCaseMonkey.find([
        mixedCaseMonkeys("first").monkeyID,
        mixedCaseMonkeys("second").monkeyID,
      ]),
    );
  });

  it("instance update should quote pkey", async () => {
    const monkey = await MixedCaseMonkey.find(mixedCaseMonkeys("first").monkeyID);
    await expect(monkey.save()).resolves.not.toThrow();
  });

  it("instance destroy should quote pkey", async () => {
    const monkey = await MixedCaseMonkey.find(mixedCaseMonkeys("first").monkeyID);
    await expect(monkey.destroy()).resolves.not.toThrow();
  });

  it("primary key returns value if it exists", () => {
    class AnonDevelopers extends Base {
      static {
        this._tableName = "developers";
      }
    }
    expect(AnonDevelopers.primaryKey).toBe("id");
  });

  it("primary key returns nil if it does not exist", async () => {
    class AnonDevelopersProjects extends Base {
      static {
        this._tableName = "developers_projects";
      }
    }
    await (Base.connection as any).internalSchemaCache.primaryKeys(
      Base.connection,
      "developers_projects",
    );
    expect(AnonDevelopersProjects.primaryKey).toBeNull();
  });

  it("quoted primary key after set primary key", () => {
    class AnonBar extends Base {
      static {
        this._tableName = "bar";
      }
    }
    expect(AnonBar.primaryKey).toBe("id");
    AnonBar.primaryKey = "foo";
    expect(AnonBar.primaryKey).toBe("foo");
  });

  it("auto detect primary key from schema", () => {
    expect(MixedCaseMonkey.primaryKey).toBe("monkeyID");
  });

  it("primary key update with custom key name", async () => {
    let dashboard = (await Dashboard.createBang({
      dashboard_id: "1",
    } as any)) as unknown as Dashboard;
    dashboard.id = "2";
    await dashboard.saveBang();

    dashboard = (await Dashboard.first()) as Dashboard;
    expect(dashboard.id).toBe("2");
  });

  it("create without primary key no extra query", async () => {
    class AnonDashboard extends Base {
      static {
        this._tableName = "dashboards";
      }
    }
    await AnonDashboard.createBang();
    await assertQueriesCount(3, true, async () => {
      await AnonDashboard.createBang();
    });
  });

  it("assign id raises error if primary key doesnt exist", async () => {
    class AnonDashboard extends Base {
      static {
        this._tableName = "dashboards";
      }
    }
    await AnonDashboard.loadSchema();
    const dashboard = new AnonDashboard();
    expect(() => {
      (dashboard as any).id = "1";
    }).toThrow(MissingAttributeError);
  });

  it("id returns nil if primary key doesnt exist", async () => {
    class AnonDashboard extends Base {
      static {
        this._tableName = "dashboards";
      }
    }
    await AnonDashboard.loadSchema();
    expect(AnonDashboard.primaryKey).toBe(null);
    expect(new AnonDashboard().id).toBe(null);
  });

  it("reconfiguring primary key resets composite primary key", () => {
    class AnonCpkBooks extends Base {
      static {
        this._tableName = "cpk_books";
        this._primaryKey = ["author_id", "id"] as string[];
      }
    }
    expect(AnonCpkBooks.compositePrimaryKey).toBeTruthy();
    AnonCpkBooks.primaryKey = "id";
    expect(AnonCpkBooks.compositePrimaryKey).toBeFalsy();
  });

  it("primary key values present", () => {
    const withId = new Topic();
    withId.id = 1;
    expect((withId as any).isPrimaryKeyValuesPresent()).toBeTruthy();

    expect((new Topic() as any).isPrimaryKeyValuesPresent()).toBeFalsy();
    expect((new Topic({ title: "Topic A" }) as any).isPrimaryKeyValuesPresent()).toBeFalsy();
  });

  it.skipIf(adapterType !== "postgres")("serial with quoted sequence name", async () => {
    const cols = (await (Base.connection as any).columns("mixed_case_monkeys")) as {
      name: string;
      defaultFunction?: string;
      isSerial?: () => boolean;
    }[];
    const col = cols.find((c) => c.name === "monkeyID");
    expect(col!.defaultFunction).toBe("nextval('\"mixed_case_monkeys_monkeyID_seq\"'::regclass)");
    expect(col!.isSerial!()).toBeTruthy();
  });

  it.skipIf(adapterType !== "postgres")("serial with unquoted sequence name", async () => {
    const cols = (await (Base.connection as any).columns("topics")) as {
      name: string;
      defaultFunction?: string;
      isSerial?: () => boolean;
    }[];
    const col = cols.find((c) => c.name === "id");
    expect(col!.defaultFunction).toBe("nextval('topics_id_seq'::regclass)");
    expect(col!.isSerial!()).toBeTruthy();
  });
});

describe("PrimaryKeyWithAutoIncrementTest", () => {
  fixtures({}, { useTransactionalTests: false });

  class AutoIncrement extends Base {
    static _tableName = "auto_increments";
  }

  beforeEach(async () => {
    await (Base.connection as any).dropTable("auto_increments", { ifExists: true });
    void AutoIncrement.resetColumnInformation();
  });

  afterEach(async () => {
    void AutoIncrement.resetColumnInformation();
    await (Base.connection as any).dropTable("auto_increments", { ifExists: true });
  });

  async function assertAutoIncremented() {
    void AutoIncrement.resetColumnInformation();
    await AutoIncrement.loadSchema();
    const record1 = await AutoIncrement.createBang();
    expect(record1.id).not.toBeNull();
    await record1.destroy();
    const record2 = await AutoIncrement.createBang();
    expect(record2.id).not.toBeNull();
    if (adapterType !== "sqlite") {
      expect(record2.id as number).toBeGreaterThan(record1.id as number);
    } else {
      expect(record2.id as number).toBeGreaterThanOrEqual(1);
    }
  }

  it("primary key with integer", async () => {
    const type = "integer";
    await (Base.connection as any).createTable("auto_increments", {
      id: { type },
      force: true,
    });
    await assertAutoIncremented();
  });

  it("primary key with bigint", async () => {
    const type = "bigint";
    await (Base.connection as any).createTable("auto_increments", {
      id: { type },
      force: true,
    });
    await assertAutoIncremented();
  });
});

describe("PrimaryKeyAnyTypeTest", () => {
  fixtures({}, { useTransactionalTests: false });

  class Barcode extends Base {
    static _tableName = "barcodes";
    static _primaryKey = "code";
  }

  let connection: any;

  beforeEach(async () => {
    connection = await Base.leaseConnection();
    await connection.createTable("barcodes", {
      primaryKey: "code",
      id: { type: "string", limit: 42 },
      force: true,
    });
    void Barcode.resetColumnInformation();
    await Barcode.loadSchema();
  });

  afterEach(async () => {
    void Barcode.resetColumnInformation();
    await connection.dropTable("barcodes", { ifExists: true });
  });

  it("any type primary key", async () => {
    expect(Barcode.primaryKey).toBe("code");
    const col = (Barcode as any).columnForAttribute(Barcode.primaryKey);
    expect(col.null).toBeFalsy();
    expect(col.type).toBe("string");
    expect(col.limit).toBe(42);
    void Barcode.resetColumnInformation();
    await Barcode.loadSchema();
  });

  it("schema dump primary key includes type and options", async () => {
    const schema = await dumpTableSchema(connection, "barcodes");
    expect(schema).toMatch(
      /createTable\("barcodes", \{ primaryKey: "code", id: \{ type: "string", limit: 42 \}/,
    );
    expect(schema).not.toMatch(/t\.index\(\["code"\]/);
  });

  it.skipIf(adapterType !== "mysql")("schema typed primary key column", async () => {
    await connection.dropTable("scheduled_logs", { ifExists: true });
    await connection.createTable("scheduled_logs", {
      id: "timestamp",
      precision: 6,
      force: true,
    });
    try {
      const schema = await dumpTableSchema(connection, "scheduled_logs");
      expect(schema).toMatch(/createTable\("scheduled_logs", \{ id: "timestamp"/);
    } finally {
      await connection.dropTable("scheduled_logs", { ifExists: true });
    }
  });
});

describe("CompositePrimaryKeyTest", () => {
  const { cpkBooks } = fixtures(["cpkBooks", "cpkOrders"], { useTransactionalTests: false });

  let connection: any;

  beforeEach(async () => {
    Base.schemaCache().clearBang();
    connection = await Base.leaseConnection();
    await connection.createTable(
      "uber_barcodes",
      { primaryKey: ["region", "code"], force: true },
      (t: any) => {
        t.string("region");
        t.integer("code");
      },
    );
    await connection.createTable(
      "barcodes_reverse",
      { primaryKey: ["code", "region"], force: true },
      (t: any) => {
        t.string("region");
        t.integer("code");
      },
    );
    await connection.createTable(
      "travels",
      { primaryKey: ["from", "to"], force: true },
      (t: any) => {
        t.string("from");
        t.string("to");
      },
    );
  });

  afterEach(async () => {
    await connection.dropTable("uber_barcodes", "barcodes_reverse", "travels", { ifExists: true });
  });

  it("composite primary key", async () => {
    expect(await connection.primaryKeys("uber_barcodes")).toEqual(["region", "code"]);
  });

  it("composite primary key with reserved words", async () => {
    expect(await connection.primaryKeys("travels")).toEqual(["from", "to"]);
  });

  it("composite primary key out of order", async () => {
    expect(await connection.primaryKeys("barcodes_reverse")).toEqual(["code", "region"]);
  });

  it("assigning a composite primary key", async () => {
    try {
      const book = new CpkBook();
      book.id = [1, 2];
      await book.saveBang();

      expect(book.id).toEqual([1, 2]);
    } finally {
      await CpkBook.deleteAll();
    }
  });

  it("assigning a non array value to model with composite primary key raises", async () => {
    const book = new CpkBook();

    const error = await assertRaises([TypeError], {}, () => {
      book.id = 1 as unknown as number[];
    });

    expect(error.message).toBe('Expected value matching ["author_id", "id"], got 1.');
  });

  it("id was composite", () => {
    const book = cpkBooks("cpk_great_author_first_book");
    const bookId = book.id as unknown[];
    expect(bookId).not.toEqual([42, 42]);
    book.id = [42, 42];
    expect((book as any).idWas).toEqual(bookId);
    expect(book.id).toEqual([42, 42]);
  });

  it("id predicate composite", async () => {
    const book = cpkBooks("cpk_great_author_first_book");

    const validId = [42, 42];

    const invalidIds: unknown[][] = [
      [42, null],
      [null, 42],
      [null, null],
    ];

    for (const invalidId of invalidIds) {
      book.id = validId;

      await assertChanges(
        () => (book as any).isId,
        null,
        { from: true, to: false },
        () => {
          book.id = invalidId as number[];
        },
      );
    }
  });

  it("derives composite primary key", () => {
    class AnonUberBarcodes extends Base {
      static {
        this._tableName = "uber_barcodes";
        this._primaryKey = ["region", "code"] as string[];
      }
    }
    expect(AnonUberBarcodes.primaryKey).toEqual(["region", "code"]);
  });

  it("collectly dump composite primary key", async () => {
    const schema = await dumpTableSchema(connection, "uber_barcodes");
    expect(schema).toMatch(/createTable\("uber_barcodes", \{ primaryKey: \["region","code"\]/);
  });

  it("dumping composite primary key out of order", async () => {
    const schema = await dumpTableSchema(connection, "barcodes_reverse");
    expect(schema).toMatch(/createTable\("barcodes_reverse", \{ primaryKey: \["code","region"\]/);
  });

  it("model with a composite primary key", () => {
    expect(CpkBook.primaryKey).toEqual(["author_id", "id"]);
    expect(CpkOrder.primaryKey).toEqual(["shop_id", "id"]);
  });

  it("primary key values present for a composite pk model", () => {
    const withBoth = new CpkBook();
    withBoth.id = [1, 1];
    expect((withBoth as any).isPrimaryKeyValuesPresent()).toBeTruthy();

    expect((new CpkBook() as any).isPrimaryKeyValuesPresent()).toBeFalsy();

    const withAuthorOnly = new CpkBook({ author_id: 1 });
    expect((withAuthorOnly as any).isPrimaryKeyValuesPresent()).toBeFalsy();

    const withNullId = new CpkBook();
    withNullId.id = [null as unknown as number, 1];
    expect((withNullId as any).isPrimaryKeyValuesPresent()).toBeFalsy();

    const withTitleOnly = new CpkBook({ title: "Book A" });
    expect((withTitleOnly as any).isPrimaryKeyValuesPresent()).toBeFalsy();

    const withAuthorAndTitle = new CpkBook({ author_id: 1, title: "Book A" });
    expect((withAuthorAndTitle as any).isPrimaryKeyValuesPresent()).toBeFalsy();
  });
});

describe("PrimaryKeyIntegerNilDefaultTest", () => {
  fixtures({}, { useTransactionalTests: false });

  beforeEach(async () => {
    await (Base.connection as any).dropTable("int_defaults", { ifExists: true });
  });

  afterEach(async () => {
    await (Base.connection as any).dropTable("int_defaults", { ifExists: true });
  });

  it.skipIf(adapterType === "sqlite")(
    "schema dump primary key integer with default nil",
    async () => {
      await (Base.connection as any).createTable("int_defaults", {
        id: "integer",
        default: null,
        force: true,
      });
      const schema = await dumpTableSchema(Base.connection, "int_defaults");
      expect(schema).toMatch(/createTable\("int_defaults", \{ id: "integer", default: null/);
    },
  );

  it("schema dump primary key bigint with default nil", async () => {
    await (Base.connection as any).createTable("int_defaults", {
      id: "bigint",
      default: null,
      force: true,
    });
    const schema = await dumpTableSchema(Base.connection, "int_defaults");
    expect(schema).toMatch(/createTable\("int_defaults", \{ id: "bigint", default: null/);
  });
});

describe("PrimaryKeyIntegerTest", () => {
  fixtures({}, { useTransactionalTests: false });

  class Widget extends Base {
    static _tableName = "widgets";
  }

  let connection: any;

  beforeEach(async () => {
    connection = await Base.leaseConnection();
  });

  afterEach(async () => {
    void Widget.resetColumnInformation();
    await connection.dropTable("widgets", { ifExists: true });
  });

  const pkType = adapterType === "postgres" ? "serial" : "integer";

  it.skipIf(adapterType === "sqlite")("primary key column type with serial/integer", async () => {
    await connection.createTable("widgets", { id: { type: pkType }, force: true });
    void Widget.resetColumnInformation();
    await Widget.loadSchema();
    const col = (Widget as any).columnsHash()["id"];
    expect(col.type).toBe("integer");
    expect(col.isBigint()).toBeFalsy();
  });

  it.skipIf(adapterType === "sqlite")(
    "primary key with serial/integer are automatically numbered",
    async () => {
      await connection.createTable("widgets", { id: { type: pkType }, force: true });
      void Widget.resetColumnInformation();
      await Widget.loadSchema();
      const w = await Widget.createBang();
      expect(w.id).not.toBeNull();
    },
  );

  it.skipIf(adapterType === "sqlite")("schema dump primary key with serial/integer", async () => {
    await connection.createTable("widgets", { id: { type: pkType }, force: true });
    const schema = await dumpTableSchema(connection, "widgets");
    expect(schema).toMatch(new RegExp(`createTable\\("widgets", \\{ id: "${pkType}", `));
  });

  it.skipIf(adapterType !== "mysql")("primary key column type with options", async () => {
    await connection.createTable("widgets", {
      id: { type: "primary_key", limit: 4, unsigned: true },
      force: true,
    });
    void Widget.resetColumnInformation();
    await Widget.loadSchema();
    const col = (Widget as any).columnsHash()["id"];
    expect(col.isAutoIncrement()).toBeTruthy();
    expect(col.type).toBe("integer");
    expect(col.isBigint()).toBeFalsy();
    expect(col.isUnsigned()).toBeTruthy();

    const schema = await dumpTableSchema(connection, "widgets");
    expect(schema).toMatch(/createTable\("widgets", \{ id: \{ type: "integer", unsigned: true \}/);
  });

  it.skipIf(adapterType !== "mysql")("bigint primary key with unsigned", async () => {
    await connection.createTable("widgets", {
      id: { type: "bigint", unsigned: true },
      force: true,
    });
    void Widget.resetColumnInformation();
    await Widget.loadSchema();
    const col = (Widget as any).columnsHash()["id"];
    expect(col.isAutoIncrement()).toBeTruthy();
    expect(col.type).toBe("integer");
    expect(col.isBigint()).toBeTruthy();
    expect(col.isUnsigned()).toBeTruthy();

    const schema = await dumpTableSchema(connection, "widgets");
    expect(schema).toMatch(/createTable\("widgets", \{ id: \{ type: "bigint", unsigned: true \}/);
  });
});
