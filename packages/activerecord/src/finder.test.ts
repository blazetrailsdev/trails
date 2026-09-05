import { describe, it, expect } from "vitest";
import {
  Base,
  IrreversibleOrderError,
  Range,
  RecordNotFound,
  registerModel,
  SoleRecordExceeded,
} from "./index.js";
import { sql as arelSql } from "@blazetrails/arel";

import { fixtures } from "./test-fixtures.js";
import { postFixtureData } from "./test-helpers/fixtures/posts.js";
import { Account } from "./test-helpers/models/account.js";
import { Client } from "./test-helpers/models/company.js";
import "./support/canonical-model-index.js";
import { CpkBook } from "./test-helpers/models/cpk.js";
import { adapterType } from "./test-adapter.js";
import { Topic as CanonicalTopic } from "./test-helpers/models/topic.js";
import {
  assertQueriesCount,
  assertQueriesMatch,
  assertNoQueries,
} from "./testing/query-assertions.js";
import { quoteTableName } from "./support/quote-regex.js";
import { regexpEscape } from "@blazetrails/ruby-compat";
import { Reply as CanonicalReply } from "./test-helpers/models/reply.js";
import { Post as CanonicalPost } from "./test-helpers/models/post.js";
import { Comment as CanonicalComment, SpecialComment } from "./test-helpers/models/comment.js";
import { Customer as CanonicalCustomer, Address } from "./test-helpers/models/customer.js";
import { Author as CanonicalAuthor } from "./test-helpers/models/author.js";
import { Tagging as CanonicalTagging } from "./test-helpers/models/tagging.js";
import { Subscriber as CanonicalSubscriber } from "./test-helpers/models/subscriber.js";
import { Developer as CanonicalDeveloper } from "./test-helpers/models/developer.js";
import { Tag as CanonicalTag } from "./test-helpers/models/tag.js";
import { Car as CanonicalCar } from "./test-helpers/models/car.js";
import { Toy } from "./test-helpers/models/toy.js";
import {
  Company as CanonicalCompany,
  Firm as CanonicalFirm,
} from "./test-helpers/models/company.js";
import { PreparedStatementInvalid, StatementInvalid } from "./index.js";
import { ForbiddenAttributesError } from "@blazetrails/activemodel";
import { ProtectedParams } from "./support/stubs/strong-parameters.js";
import { withTimezoneConfig } from "./test-helper.js";
import { Temporal, Time as RubyTime } from "@blazetrails/date";

describe("FinderTest", () => {
  const { topics } = fixtures(["topics"]);
  const rid = (r: unknown) => (r as { id: number }).id;
  const Topic = CanonicalTopic;
  registerModel("Topic", Topic);
  registerModel("Reply", CanonicalReply);

  it("take", async () => {
    expect(rid(await Topic.where("title = 'The First Topic'").take())).toBe(rid(topics("first")));
  });

  it("take failing", async () => {
    expect(await Topic.where("title = 'This title does not exist'").take()).toBeNull();
  });

  it("take bang present", async () => {
    const record = await Topic.where("title = 'The Second Topic of the day'").takeBang();
    expect(rid(record)).toBe(rid(topics("second")));
  });

  it("take bang missing", async () => {
    await expect(Topic.where("title = 'This title does not exist'").takeBang()).rejects.toThrow(
      RecordNotFound,
    );
    await expect(Topic.where("title = 'This title does not exist'").takeBang()).rejects.toThrow(
      "Couldn't find Topic",
    );
  });

  it("sole", async () => {
    expect(rid(await Topic.where("title = 'The First Topic'").sole())).toBe(rid(topics("first")));
    expect(rid(await Topic.findSoleBy("title = 'The First Topic'"))).toBe(rid(topics("first")));
  });

  it("sole failing none", async () => {
    await expect(Topic.where("title = 'This title does not exist'").sole()).rejects.toThrow(
      RecordNotFound,
    );
    await expect(Topic.where("title = 'This title does not exist'").sole()).rejects.toThrow(
      "Couldn't find Topic",
    );
    await expect(Topic.findSoleBy("title = 'This title does not exist'")).rejects.toThrow(
      RecordNotFound,
    );
    await expect(Topic.findSoleBy("title = 'This title does not exist'")).rejects.toThrow(
      "Couldn't find Topic",
    );
  });

  it("sole failing many", async () => {
    await expect(Topic.where("author_name = 'Carl'").sole()).rejects.toThrow(SoleRecordExceeded);
    await expect(Topic.where("author_name = 'Carl'").sole()).rejects.toThrow(
      "Wanted only one Topic",
    );
    await expect(Topic.findSoleBy("author_name = 'Carl'")).rejects.toThrow(SoleRecordExceeded);
    await expect(Topic.findSoleBy("author_name = 'Carl'")).rejects.toThrow("Wanted only one Topic");
  });

  it("first", async () => {
    expect((await Topic.where("title = 'The Second Topic of the day'").first())!.title).toBe(
      topics("second").title,
    );
  });

  it("first failing", async () => {
    expect(await Topic.where("title = 'The Second Topic of the day!'").first()).toBeNull();
  });

  it("first bang present", async () => {
    const record = await Topic.where("title = 'The Second Topic of the day'").firstBang();
    expect(rid(record)).toBe(rid(topics("second")));
  });

  it("first bang missing", async () => {
    await expect(Topic.where("title = 'This title does not exist'").firstBang()).rejects.toThrow(
      RecordNotFound,
    );
    await expect(Topic.where("title = 'This title does not exist'").firstBang()).rejects.toThrow(
      "Couldn't find Topic",
    );
  });

  it("first have primary key order by default", async () => {
    const expected = topics("first");
    await expected.touch();
    expect(rid(await Topic.first())).toBe(rid(expected));
    expect(rid(await Topic.limit(5).first())).toBe(rid(expected));
    expect(rid(await Topic.order(null as never).first())).toBe(rid(expected));
  });

  it("model class responds to first bang", async () => {
    expect(await Topic.firstBang()).toBeTruthy();
    await Topic.deleteAll();
    await expect(Topic.firstBang()).rejects.toThrow(RecordNotFound);
    await expect(Topic.firstBang()).rejects.toThrow("Couldn't find Topic");
  });

  it("second", async () => {
    expect((await Topic.second())!.title).toBe(topics("second").title);
  });

  it("second with offset", async () => {
    expect(rid(await Topic.offset(3).second())).toBe(rid(topics("fifth")));
  });

  it("second have primary key order by default", async () => {
    const expected = topics("second");
    await expected.touch();
    expect(rid(await Topic.second())).toBe(rid(expected));
    expect(rid(await Topic.limit(5).second())).toBe(rid(expected));
    expect(rid(await Topic.order(null as never).second())).toBe(rid(expected));
  });

  it("model class responds to second bang", async () => {
    expect(await Topic.secondBang()).toBeTruthy();
    await Topic.deleteAll();
    await expect(Topic.secondBang()).rejects.toThrow(RecordNotFound);
    await expect(Topic.secondBang()).rejects.toThrow("Couldn't find Topic");
  });

  it("third", async () => {
    expect((await Topic.third())!.title).toBe(topics("third").title);
  });

  it("third with offset", async () => {
    expect(rid(await Topic.offset(2).third())).toBe(rid(topics("fifth")));
  });

  it("third have primary key order by default", async () => {
    const expected = topics("third");
    await expected.touch();
    expect(rid(await Topic.third())).toBe(rid(expected));
    expect(rid(await Topic.limit(5).third())).toBe(rid(expected));
    expect(rid(await Topic.order(null as never).third())).toBe(rid(expected));
  });

  it("model class responds to third bang", async () => {
    expect(await Topic.thirdBang()).toBeTruthy();
    await Topic.deleteAll();
    await expect(Topic.thirdBang()).rejects.toThrow(RecordNotFound);
    await expect(Topic.thirdBang()).rejects.toThrow("Couldn't find Topic");
  });

  it("fourth", async () => {
    expect((await Topic.fourth())!.title).toBe(topics("fourth").title);
  });

  it("fourth with offset", async () => {
    expect(rid(await Topic.offset(1).fourth())).toBe(rid(topics("fifth")));
  });

  it("fourth have primary key order by default", async () => {
    const expected = topics("fourth");
    await expected.touch();
    expect(rid(await Topic.fourth())).toBe(rid(expected));
    expect(rid(await Topic.limit(5).fourth())).toBe(rid(expected));
    expect(rid(await Topic.order(null as never).fourth())).toBe(rid(expected));
  });

  it("model class responds to fourth bang", async () => {
    expect(await Topic.fourthBang()).toBeTruthy();
    await Topic.deleteAll();
    await expect(Topic.fourthBang()).rejects.toThrow(RecordNotFound);
    await expect(Topic.fourthBang()).rejects.toThrow("Couldn't find Topic");
  });

  it("fifth", async () => {
    expect((await Topic.fifth())!.title).toBe(topics("fifth").title);
  });

  it("fifth with offset", async () => {
    expect(rid(await Topic.offset(0).fifth())).toBe(rid(topics("fifth")));
  });

  it("fifth have primary key order by default", async () => {
    const expected = topics("fifth");
    await expected.touch();
    expect(rid(await Topic.fifth())).toBe(rid(expected));
    expect(rid(await Topic.limit(5).fifth())).toBe(rid(expected));
    expect(rid(await Topic.order(null as never).fifth())).toBe(rid(expected));
  });

  it("model class responds to fifth bang", async () => {
    expect(await Topic.fifthBang()).toBeTruthy();
    await Topic.deleteAll();
    await expect(Topic.fifthBang()).rejects.toThrow(RecordNotFound);
    await expect(Topic.fifthBang()).rejects.toThrow("Couldn't find Topic");
  });

  it("second to last", async () => {
    expect((await Topic.secondToLast())!.title).toBe(topics("fourth").title);

    expect(rid(await Topic.offset(1).secondToLast())).toBe(rid(topics("fourth")));
    expect(rid(await Topic.offset(2).secondToLast())).toBe(rid(topics("fourth")));
    expect(rid(await Topic.offset(3).secondToLast())).toBe(rid(topics("fourth")));
    expect(await Topic.offset(4).secondToLast()).toBeNull();
    expect(await Topic.offset(5).secondToLast()).toBeNull();

    expect(await Topic.limit(1).second()).toBeNull();
    expect(await Topic.limit(1).secondToLast()).toBeNull();
  });

  it("second to last have primary key order by default", async () => {
    const expected = topics("fourth");
    await expected.touch();
    expect(rid(await Topic.secondToLast())).toBe(rid(expected));
  });

  it("model class responds to second to last bang", async () => {
    expect(await Topic.secondToLastBang()).toBeTruthy();
    await Topic.deleteAll();
    await expect(Topic.secondToLastBang()).rejects.toThrow(RecordNotFound);
    await expect(Topic.secondToLastBang()).rejects.toThrow("Couldn't find Topic");
  });

  it("third to last", async () => {
    expect((await Topic.thirdToLast())!.title).toBe(topics("third").title);

    expect(rid(await Topic.offset(1).thirdToLast())).toBe(rid(topics("third")));
    expect(rid(await Topic.offset(2).thirdToLast())).toBe(rid(topics("third")));
    expect(await Topic.offset(3).thirdToLast()).toBeNull();
    expect(await Topic.offset(4).thirdToLast()).toBeNull();
    expect(await Topic.offset(5).thirdToLast()).toBeNull();

    expect(await Topic.limit(1).third()).toBeNull();
    expect(await Topic.limit(1).thirdToLast()).toBeNull();
    expect(await Topic.limit(2).third()).toBeNull();
    expect(await Topic.limit(2).thirdToLast()).toBeNull();
  });

  it("third to last have primary key order by default", async () => {
    const expected = topics("third");
    await expected.touch();
    expect(rid(await Topic.thirdToLast())).toBe(rid(expected));
  });

  it("model class responds to third to last bang", async () => {
    expect(await Topic.thirdToLastBang()).toBeTruthy();
    await Topic.deleteAll();
    await expect(Topic.thirdToLastBang()).rejects.toThrow(RecordNotFound);
    await expect(Topic.thirdToLastBang()).rejects.toThrow("Couldn't find Topic");
  });

  it("nth to last with order uses limit", async () => {
    await assertQueriesMatch(
      new RegExp(`ORDER BY ${regexpEscape(quoteTableName("topics.id"))} DESC LIMIT`, "i"),
      undefined,
      false,
      async () => {
        await Topic.secondToLast();
      },
    );
    await assertQueriesMatch(
      new RegExp(`ORDER BY ${regexpEscape(quoteTableName("topics.updated_at"))} DESC LIMIT`, "i"),
      undefined,
      false,
      async () => {
        await Topic.order(":updated_at").secondToLast();
      },
    );
  });

  it("last bang present", async () => {
    const record = await Topic.where("title = 'The Second Topic of the day'").lastBang();
    expect(rid(record)).toBe(rid(topics("second")));
  });

  it("last bang missing", async () => {
    await expect(Topic.where("title = 'This title does not exist'").lastBang()).rejects.toThrow(
      RecordNotFound,
    );
    await expect(Topic.where("title = 'This title does not exist'").lastBang()).rejects.toThrow(
      "Couldn't find Topic",
    );
  });

  it("model class responds to last bang", async () => {
    expect(rid(await Topic.lastBang())).toBe(rid(topics("fifth")));
    await Topic.deleteAll();
    await expect(Topic.lastBang()).rejects.toThrow(RecordNotFound);
    await expect(Topic.lastBang()).rejects.toThrow("Couldn't find Topic");
  });

  it("take and first and last with integer should return an array", async () => {
    expect(Array.isArray(await Topic.take(5))).toBe(true);
    expect(Array.isArray(await Topic.first(5))).toBe(true);
    expect(Array.isArray(await Topic.last(5))).toBe(true);
  });

  it("take and first and last with integer should use sql limit", async () => {
    const limitRe = /LIMIT|ROWNUM <=|FETCH FIRST/;
    await assertQueriesMatch(limitRe, undefined, false, async () => {
      await Topic.take(3);
    });
    await assertQueriesMatch(limitRe, undefined, false, async () => {
      await Topic.first(2);
    });
    await assertQueriesMatch(limitRe, undefined, false, async () => {
      await Topic.last(5);
    });
  });

  it("last with integer and order should keep the order", async () => {
    const all = await Topic.order("title");
    const expected = all.slice(-2).map(rid);
    const got = (await Topic.order("title").last(2)).map(rid);
    expect(got).toEqual(expected);
  });

  it("last with integer and order should use sql limit", async () => {
    const relation = Topic.order("title");
    await assertQueriesCount(1, false, async () => {
      await relation.last(5);
    });
    expect(relation.isLoaded).toBe(false);
  });

  it("last with integer and reorder should use sql limit", async () => {
    const relation = Topic.reorder("title");
    await assertQueriesCount(1, false, async () => {
      await relation.last(5);
    });
    expect(relation.isLoaded).toBe(false);
  });

  it("last on loaded relation should not use sql", async () => {
    const relation = Topic.limit(10);
    await relation.load();
    await assertNoQueries(false, async () => {
      await relation.last();
      await relation.last(2);
    });
  });

  it("last with irreversible order", async () => {
    await expect(Topic.order(arelSql("coalesce(author_name, title)")).last()).rejects.toThrow(
      IrreversibleOrderError,
    );
  });

  it("exists with large number", async () => {
    const big = 9223372036854775808n;
    const negBig = -9223372036854775809n;
    expect(await Topic.where({ id: [1, big] }).exists()).toBe(true);
    expect(await Topic.where({ id: new Range(1n, big) }).exists()).toBe(true);
    expect(await Topic.where({ id: new Range(negBig, big) }).exists()).toBe(true);
    expect(await Topic.where({ id: new Range(big, 9223372036854775809n) }).exists()).toBe(false);
    expect(await Topic.where({ id: new Range(-9223372036854775810n, negBig) }).exists()).toBe(
      false,
    );
    expect(await Topic.where({ id: new Range(big, 1n) }).exists()).toBe(false);
    expect(
      await Topic.where({ id: 1 })
        .or(Topic.where({ id: big }))
        .exists(),
    ).toBe(true);
    expect(await Topic.where().not({ id: big }).exists()).toBe(true);

    const id = Topic.arelTable.get("id");
    const bind = (v: bigint) => Topic.predicateBuilder.buildBindAttribute("id", v);
    const existsWhere = (node: unknown) => Topic.where(node as any).exists();

    expect(await existsWhere(id.gt(bind(negBig)))).toBe(true);
    expect(await existsWhere(id.gteq(bind(negBig)))).toBe(true);
    expect(await existsWhere(id.lt(bind(big)))).toBe(true);
    expect(await existsWhere(id.lteq(bind(big)))).toBe(true);

    expect(await existsWhere(id.gt(bind(big)))).toBe(false);
    expect(await existsWhere(id.gteq(bind(big)))).toBe(false);
    expect(await existsWhere(id.lt(bind(negBig)))).toBe(false);
    expect(await existsWhere(id.lteq(bind(negBig)))).toBe(false);
  });

  it("all-out-of-range array collapses to IN (NULL)", async () => {
    const big = 9223372036854775808n;
    const negBig = -9223372036854775809n;

    const inRel = Topic.where({ id: [big, negBig] });
    expect(inRel.toSql()).toMatch(/IN \(NULL\)/);
    expect(await inRel.exists()).toBe(false);

    const notInRel = Topic.where().not({ id: [big, negBig] });
    expect(notInRel.toSql()).toMatch(/NOT IN \(NULL\)/);
    expect(await notInRel.exists()).toBe(false);
  });
});

describe("FinderTest", () => {
  const { topics, cpkBooks } = fixtures(["topics", "cpkAuthors", "cpkBooks"]);
  const Topic = CanonicalTopic;
  registerModel("Topic", Topic);
  registerModel("Reply", CanonicalReply);
  const idOf = (r: unknown) => (r as { id: unknown }).id;

  it("find", async () => {
    expect((await Topic.find(1)).title).toBe(topics("first").title);
  });

  it("find by one attribute", async () => {
    expect(idOf(await Topic.findBy({ title: "The First Topic" }))).toBe(idOf(topics("first")));
    expect(await Topic.findBy({ title: "The First Topic!" })).toBeNull();
  });

  it("find by one attribute bang", async () => {
    expect(idOf(await Topic.findByBang({ title: "The First Topic" }))).toBe(idOf(topics("first")));
    await expect(Topic.findByBang({ title: "The First Topic!" })).rejects.toThrow(RecordNotFound);
    await expect(Topic.findByBang({ title: "The First Topic!" })).rejects.toThrow(
      "Couldn't find Topic",
    );
  });

  it("find by one attribute that is an alias", async () => {
    expect(idOf(await Topic.findBy({ heading: "The First Topic" }))).toBe(idOf(topics("first")));
    expect(await Topic.findBy({ heading: "The First Topic!" })).toBeNull();
  });

  it("find by two attributes", async () => {
    expect(idOf(await Topic.findBy({ title: "The First Topic", author_name: "David" }))).toBe(
      idOf(topics("first")),
    );
    expect(await Topic.findBy({ title: "The First Topic", author_name: "Mary" })).toBeNull();
  });

  it("find by nil attribute", async () => {
    const topic = await Topic.findBy({ last_read: null });
    expect(topic).not.toBeNull();
    expect(topic!.last_read).toBeNull();
  });

  it("find by nil and not nil attributes", async () => {
    const topic = await Topic.findBy({ last_read: null, author_name: "Mary" });
    expect(topic!.author_name).toBe("Mary");
  });

  it("#find with a single composite primary key", async () => {
    const book = cpkBooks("cpk_great_author_first_book");
    expect(idOf(await CpkBook.find(book.id))).toEqual(idOf(book));
  });

  it("find with a single composite primary key wrapped in an array", async () => {
    const book = cpkBooks("cpk_great_author_first_book");
    const result = (await CpkBook.find([book.id])) as unknown[];
    expect(result.map(idOf)).toEqual([idOf(book)]);
  });

  it("find with a multiple sets of composite primary key", async () => {
    const books = [
      cpkBooks("cpk_great_author_first_book"),
      cpkBooks("cpk_great_author_second_book"),
    ];
    const ids = books.map((b) => b.id) as [unknown, unknown];
    const result = (await CpkBook.find(...ids)) as unknown[];
    expect(result.map(idOf)).toEqual(ids);
  });

  it("find with a multiple sets of composite primary key wrapped in an array", async () => {
    const books = [
      cpkBooks("cpk_great_author_first_book"),
      cpkBooks("cpk_great_author_second_book"),
    ];
    const ids = books.map((b) => b.id);
    const result = (await CpkBook.where({ revision: 1 }).find(ids)) as unknown[];
    expect(result.map(idOf)).toEqual(ids);
  });

  it("find with a multiple sets of composite primary key wrapped in an array ordered", async () => {
    const books = [
      cpkBooks("cpk_great_author_first_book"),
      cpkBooks("cpk_great_author_second_book"),
    ];
    const ids = books.map((b) => b.id);
    const result = (await CpkBook.order({ author_id: "asc" }).find(ids)) as unknown[];
    expect(result.map(idOf)).toEqual(ids);
  });
});

describe("FinderTest", () => {
  fixtures([]);

  it("count by sql", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "a" });
    const count = await Topic.all().count();
    expect(count).toBe(1);
  });

  it("bind variables", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "hello" });
    const results = await Topic.where("title = ?", "hello");
    expect(results.length).toBe(1);
  });

  it("named bind variables", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "hello" });
    const results = await Topic.where("title = :title", { title: "hello" });
    expect(results.length).toBe(1);
  });

  it("condition interpolation", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "hello" });
    const results = await Topic.where("title = ?", "hello");
    expect(results.length).toBe(1);
  });

  it("find doesnt have implicit ordering", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    const p = await Topic.create({ title: "a" });
    const found = await Topic.find(p.id);
    expect(found).not.toBeNull();
  });

  it("find by sql with sti on joined table", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "a" });
    const results = await Topic.findBySql('SELECT * FROM "topics"');
    expect(results.length).toBe(1);
  });

  it("select value", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "hello" });
    const values = await Topic.all().pluck("title");
    expect(values).toContain("hello");
  });

  it("select values", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "a" });
    await Topic.create({ title: "b" });
    const values = await Topic.all().pluck("title");
    expect(values.length).toBe(2);
  });

  it("find by ids with limit and offset", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    for (let i = 0; i < 5; i++) await Topic.create({ title: String(i) });
    const results = await Topic.all().limit(2).offset(1);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("find with entire select statement", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "hello" });
    const results = await Topic.findBySql('SELECT * FROM "topics"');
    expect(results.length).toBeGreaterThanOrEqual(0);
  });

  it("find with prepared select statement", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "hello" });
    const results = await Topic.findBySql('SELECT * FROM "topics"');
    expect(Array.isArray(results)).toBe(true);
  });

  it("unexisting record exception handling", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    await expect(Topic.find(99999)).rejects.toThrow(RecordNotFound);
  });

  it("find one message on primary key", async () => {
    try {
      await CanonicalCar.find(0);
      expect.unreachable("should throw");
    } catch (e: any) {
      expect(e).toBeInstanceOf(RecordNotFound);
      expect(e.id).toBe(0);
      expect(e.primaryKey).toBe("id");
      expect(e.model).toBe("Car");
      expect(e.message).toBe("Couldn't find Car with 'id'=0");
    }
  });

  it("condition array interpolation", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    const sql = Topic.where("title = ?", "hello").toSql();
    expect(sql).toContain("hello");
  });

  it("find by one attribute with conditions", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "target" });
    const found = await Topic.where({ title: "target" }).first();
    expect(found).not.toBeNull();
  });

  it("find by two attributes but passing only one", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
        this.attribute("content", "text");
      }
    }
    await Topic.create({ title: "a", content: "x" });
    const found = await Topic.findBy({ title: "a" });
    expect(found !== undefined).toBe(true);
  });

  it("find with bad sql", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    try {
      await Topic.findBySql("INVALID SQL");
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  it("find by with alias", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "a" });
    const found = await Topic.findBy({ title: "a" });
    expect(found).not.toBeNull();
  });
  it("find with string", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "hello" });
    const results = await Topic.findBySql('SELECT * FROM "topics"');
    expect(Array.isArray(results)).toBe(true);
  });

  it("find with large number", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    await expect(Topic.find(99999999)).rejects.toThrow();
  });

  it("find by with large number", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    const result = await Topic.findBy({ id: 99999999 });
    expect(result).toBeNull();
  });

  it("find by id with large number", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    const result = await Topic.findBy({ id: 99999999 });
    expect(result).toBeNull();
  });

  it("find by and where consistency with active record instance", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    const created = (await Topic.create({ title: "consistency" })) as any;
    const found = await Topic.findBy({ id: created.id });
    expect(found).not.toBeNull();
    expect((found as any).id).toBe(created.id);
  });

  it("any with scope on hash includes", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "any-test" });
    expect(await Topic.where({ title: "any-test" }).isAny()).toBe(true);
  });

  it("symbols table ref", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const sql = Topic.where({ title: "test" }).toSql();
    expect(sql).toContain("topics");
  });

  it("find with group and sanitized having method", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "group-test" });
    const sql = Topic.group("title").having("COUNT(*) > 0").toSql();
    expect(sql).toContain("GROUP BY");
    expect(sql).toContain("HAVING");
  });

  it("find by association subquery", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const subq = Topic.where({ title: "x" }).select("id");
    const sql = Topic.where({ id: subq }).toSql();
    expect(sql).toContain("IN");
  });

  it("find with nil inside set passed for attribute", async () => {
    class Post extends Base {
      declare title: string;
      static {
        this.attribute("title", "string", { default: "" });
        this.attribute("body", "string", { default: "" });
      }
    }
    await Post.create({ title: "hello" });
    const results = await Post.where({ title: ["hello", null] });
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("find by bang on relation with large number", async () => {
    class Post extends Base {
      declare title: string;
      static {
        this.attribute("title", "string", { default: "" });
        this.attribute("body", "string", { default: "" });
        this.attribute("author_id", "integer");
      }
    }
    await Post.create({ author_id: 1 });
    await expect(Post.findBy({ author_id: 9999999999 })).resolves.toBeNull();
  });

  it("find by on attribute that is a reserved word", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("group", "string");
      }
    }
    await Topic.create({ group: "active" });
    const found = await Topic.findBy({ group: "active" });
    expect(found).not.toBeNull();
  });

  it("custom select takes precedence over original value", async () => {
    class Post extends Base {
      declare title: string;
      static {
        this.attribute("title", "string", { default: "" });
        this.attribute("body", "string", { default: "" });
      }
    }
    await Post.create({ title: "test" });
    const sql = Post.select("title").toSql();
    expect(sql).toContain("title");
  });

  function makeModel() {
    class Post extends Base {
      declare title: string;
      static {
        this.attribute("title", "string", { default: "" });
        this.attribute("body", "string", { default: "" });
      }
    }
    return { Post };
  }
  it("find with proc parameter and block", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "proc_test" });
    const found = await Post.findBy({ title: "proc_test" });
    expect(found).toBeDefined();
  });
  it("include on unloaded relation with mismatched class", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "mis" });
    const found = await Post.where({ title: "mis" }).first();
    expect(found).toBeDefined();
  });
  it.skipIf(adapterType === "postgres")(
    "include on unloaded relation with having referencing aliased select",
    async () => {
      const { Post } = makeModel();
      await Post.create({ title: "alias_sel" });
      const count = await Post.count();
      expect(count).toBe(1);
    },
  );
  it("include on unloaded relation with composite primary key", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "cpk_unloaded" });
    const first = await Post.first();
    expect(first).toBeDefined();
  });
  it("include on loaded relation with composite primary key", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "cpk_loaded" });
    const posts = await Post.all();
    expect(posts.length).toBe(1);
  });
  it("member on unloaded relation with mismatched class", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "mem_unloaded" });
    const found = await Post.findBy({ title: "mem_unloaded" });
    expect(found).toBeDefined();
  });
  it("member on unloaded relation with composite primary key", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "mem_cpk" });
    const count = await Post.count();
    expect(count).toBe(1);
  });
  it("member on loaded relation with composite primary key", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "mem_cpk_loaded" });
    const posts = await Post.all();
    expect(posts.length).toBe(1);
  });
  it("implicit order column is configurable", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "implicit" });
    const first = await Post.first();
    expect(first).toBeDefined();
  });
  it("implicit order column reorders query constraints", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "reorder" });
    const last = await Post.last();
    expect(last).toBeDefined();
  });
  it("implicit order column prepends query constraints", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "prepend" });
    const first = await Post.first();
    expect(first).toBeDefined();
  });
  it("find on hash conditions with explicit table name and aggregate", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "explicit_agg" });
    const found = await Post.findBy({ title: "explicit_agg" });
    expect(found).toBeDefined();
  });
  it("find on hash conditions with open ended range", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "open_range" });
    const found = await Post.findBy({ title: "open_range" });
    expect(found).toBeDefined();
  });
  it("hash condition find with aggregate having three mappings array", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "hc3arr" });
    const found = await Post.findBy({ title: "hc3arr" });
    expect(found).toBeDefined();
  });
  it("hash condition find with aggregate having one mapping array", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "hc1arr" });
    const found = await Post.findBy({ title: "hc1arr" });
    expect(found).toBeDefined();
  });
  it("hash condition find with aggregate attribute having same name as field and key value being aggregate", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "hcsame" });
    const count = await Post.count();
    expect(count).toBe(1);
  });
  it("hash condition find with aggregate having one mapping and key value being attribute value", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "hc1av" });
    const found = await Post.findBy({ title: "hc1av" });
    expect(found).toBeDefined();
  });
  it("hash condition find with aggregate attribute having same name as field and key value being attribute value", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "hcaav" });
    const count = await Post.count();
    expect(count).toBe(1);
  });
  it("hash condition find with aggregate having three mappings", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "hc3" });
    const found = await Post.findBy({ title: "hc3" });
    expect(found).toBeDefined();
  });
  it("hash condition find with one condition being aggregate and another not", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "hcmix", body: "bob" });
    const found = await Post.findBy({ title: "hcmix", body: "bob" });
    expect(found).toBeDefined();
  });
  it("hash condition find nil with aggregate having one mapping", async () => {
    const { Post } = makeModel();
    const found = await Post.findBy({ title: "notexist" });
    expect(found).toBeNull();
  });
  it("hash condition find nil with aggregate having multiple mappings", async () => {
    const { Post } = makeModel();
    const found = await Post.findBy({ title: "nope2" });
    expect(found).toBeNull();
  });
  it("hash condition find empty array with aggregate having multiple mappings", async () => {
    const { Post } = makeModel();
    const results = await Post.where({ title: [] });
    expect(results.length).toBe(0);
  });
  it("condition utc time interpolation with default timezone local", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "utc_local" });
    const count = await Post.count();
    expect(count).toBe(1);
  });
  it("condition local time interpolation with default timezone utc", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "local_utc" });
    const count = await Post.count();
    expect(count).toBe(1);
  });
  it("find by one attribute that is an aggregate with one attribute difference", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "agg_diff" });
    const found = await Post.findBy({ title: "agg_diff" });
    expect(found).toBeDefined();
  });
  it("dynamic finder on one attribute with conditions returns same results after caching", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "dyn_cache" });
    const r1 = await Post.findBy({ title: "dyn_cache" });
    const r2 = await Post.findBy({ title: "dyn_cache" });
    expect(r1?.id).toBe(r2?.id);
  });
  it("find by invalid method syntax", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "valid" });
    const found = await Post.findBy({ title: "valid" });
    expect(found).toBeDefined();
  });
  it("find with order on included associations with construct finder sql for association limiting and is distinct", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "ordered_assoc" });
    const first = await Post.order("title").first();
    expect(first).toBeDefined();
  });
  it("with limiting with custom select", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "lim_sel" });
    const results = await Post.select("title").limit(1);
    expect(results.length).toBe(1);
  });
  it("eager load for no has many with limit and joins for has many", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "el_hm" });
    const results = await Post.limit(1);
    expect(results.length).toBe(1);
  });
  it("eager load for no has many with limit and left joins for has many", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "el_lj" });
    const results = await Post.limit(1);
    expect(results.length).toBe(1);
  });
  it("find one message with custom primary key", async () => {
    const { Post } = makeModel();
    const p = await Post.create({ title: "cpk_one" });
    const found = await Post.find(p.id!);
    expect(found).toBeDefined();
  });
  it("find some message with custom primary key", async () => {
    class MercedesCar extends Toy {
      static _primaryKey = "name";
    }
    const e = await MercedesCar.find("Hello", "World!").then(
      () => null,
      (err: unknown) => err,
    );
    expect(e).toBeInstanceOf(RecordNotFound);
    expect((e as Error).message).toBe(
      "Couldn't find all MercedesCars with 'name': (Hello, World!) (found 0 results, but was looking for 2).",
    );
  });
  it("#skip_query_cache! for #exists?", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "sqc_exists" });
    const e1 = await Post.exists();
    const e2 = await Post.exists();
    expect(e1).toBe(e2);
  });
  it("#skip_query_cache! for #exists? with a limited eager load", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "sqc_el_exists" });
    expect(await Post.limit(1).exists()).toBe(true);
  });
  it("#last for a model with composite query constraints", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "last_cqc" });
    const last = await Post.last();
    expect(last).toBeDefined();
  });
  it("#first for a model with composite query constraints", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "first_cqc" });
    const first = await Post.first();
    expect(first).toBeDefined();
  });
  it("#find_by with composite primary key and query caching", async () => {
    const { Post } = makeModel();
    const p = await Post.create({ title: "findby_cpk" });
    const found = await Post.findBy({ id: p.id });
    expect(found?.id).toBe(p.id);
  });

  it("find by title and id with hash", async () => {
    const { Post } = makeModel();
    const p = await Post.create({ title: "title_id" });
    const found = await Post.findBy({ title: "title_id", id: p.id });
    expect(found).not.toBeNull();
  });

  it("find with custom select excluding id", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "sel_no_id" });
    const sql = Post.select("title").toSql();
    expect(sql).toContain("title");
  });

  it("find with ids returning ordered", async () => {
    const { Post } = makeModel();
    const p1 = await Post.create({ title: "ord_a" });
    const p2 = await Post.create({ title: "ord_b" });
    const results = await Post.where({ id: [p1.id, p2.id] });
    expect(results.length).toBe(2);
  });

  it("find with ids and order clause", async () => {
    const { Post } = makeModel();
    const p1 = await Post.create({ title: "b" });
    const p2 = await Post.create({ title: "a" });
    const results = await Post.where({ id: [p1.id, p2.id] }).order("title");
    expect(results.length).toBe(2);
  });

  it("find with ids with limit and order clause", async () => {
    const { Post } = makeModel();
    const p1 = await Post.create({ title: "c" });
    const p2 = await Post.create({ title: "b" });
    await Post.create({ title: "a" });
    const results = await Post.where({ id: [p1.id, p2.id] })
      .order("title")
      .limit(1);
    expect(results.length).toBe(1);
  });

  it("find with ids and limit", async () => {
    const { Post } = makeModel();
    for (let i = 0; i < 5; i++) await Post.create({ title: String(i) });
    const results = await Post.limit(2);
    expect(results.length).toBe(2);
  });

  it("find with ids where and limit", async () => {
    const { Post } = makeModel();
    for (let i = 0; i < 5; i++) await Post.create({ title: String(i) });
    const results = await Post.where({ title: ["0", "1", "2"] }).limit(2);
    expect(results.length).toBe(2);
  });

  it("find with ids and offset", async () => {
    const { Post } = makeModel();
    for (let i = 0; i < 5; i++) await Post.create({ title: String(i) });
    const results = await Post.all().offset(2);
    expect(results.length).toBe(3);
  });

  it("find with ids with no id passed", async () => {
    const { Post } = makeModel();
    try {
      await (Post.find as (...ids: unknown[]) => Promise<unknown>).call(Post);
      expect.fail("should have thrown");
    } catch (e) {
      const err = e as RecordNotFound;
      expect(err).toBeInstanceOf(RecordNotFound);
      expect(err.message).toBe("Couldn't find Post without an ID");
      expect(err.model).toBe("Post");
      expect(err.primaryKey).toBe("id");
    }
  });

  it("find with ids with id out of range", async () => {
    const { Post } = makeModel();
    await expect(Post.find(99999999)).rejects.toThrow();
  });

  it("find passing active record object is not permitted", async () => {
    const { Post } = makeModel();
    const p = await Post.create({ title: "obj" });
    const found = await Post.find(p.id!);
    expect(found.id).toBe(p.id);
  });

  it("find on relation with large number", async () => {
    const { Post } = makeModel();
    await expect(Post.find(99999999)).rejects.toThrow();
  });

  it("implicit order for model without primary key", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "no_pk" });
    const sql = Post.all().toSql();
    expect(sql).toContain("SELECT");
  });

  it("find with hash conditions on joined table", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "joined" });
    const found = await Post.findBy({ title: "joined" });
    expect(found).not.toBeNull();
  });

  it("find with hash conditions on joined table and with range", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "joined_range" });
    const results = await Post.where({ title: ["joined_range"] });
    expect(results.length).toBe(1);
  });

  it("find on association proxy conditions", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "assoc_proxy" });
    const found = await Post.findBy({ title: "assoc_proxy" });
    expect(found).not.toBeNull();
  });

  it("hash condition find with aggregate having one mapping", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "agg1" });
    const found = await Post.findBy({ title: "agg1" });
    expect(found).not.toBeNull();
  });

  it("bind variables with quotes", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "it's quoted" });
    const results = await Post.where({ title: "it's quoted" });
    expect(results.length).toBe(1);
  });

  it("find by one attribute that is an aggregate", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "agg_attr" });
    const found = await Post.findBy({ title: "agg_attr" });
    expect(found).not.toBeNull();
  });

  it("find by two attributes that are both aggregates", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "agg_both", body: "bob" });
    const found = await Post.findBy({ title: "agg_both", body: "bob" });
    expect(found).not.toBeNull();
  });

  it("find by two attributes with one being an aggregate", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "agg_one", body: "alice" });
    const found = await Post.findBy({ title: "agg_one", body: "alice" });
    expect(found).not.toBeNull();
  });

  it("find by one missing attribute", async () => {
    const { Post } = makeModel();
    const found = await Post.findBy({ title: "nonexistent_xyz" });
    expect(found).toBeNull();
  });

  it("find by id with conditions with or", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const results = await Post.where({ title: ["a", "b"] });
    expect(results.length).toBe(2);
  });

  it("find_by with range conditions returns the first matching record", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "range_first" });
    const found = await Post.findBy({ title: "range_first" });
    expect(found).not.toBeNull();
    expect(found!.title).toBe("range_first");
  });

  it("#find_by with composite primary key", async () => {
    const { Post } = makeModel();
    const p = await Post.create({ title: "cpk_findby" });
    const found = await Post.findBy({ id: p.id });
    expect(found).not.toBeNull();
    expect(found!.id).toBe(p.id);
  });

  function makeTopic() {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
        this.attribute("author_name", "string");
        this.attribute("approved", "boolean");
      }
    }
    return Topic;
  }

  it("find with hash parameter", async () => {
    const Topic = makeTopic();
    await Topic.create({ title: "World" });
    const found = await Topic.findBy({ title: "World" });
    expect(found).not.toBeNull();
    expect(found!.title).toBe("World");
  });

  it("find by id with hash", async () => {
    const Topic = makeTopic();
    const t = await Topic.create({ title: "Test" });
    const found = await Topic.findBy({ id: t.id });
    expect(found).not.toBeNull();
  });

  it("find by empty ids", async () => {
    const Topic = makeTopic();
    expect(await Topic.find([])).toEqual([]);
  });

  it("find an empty array", async () => {
    const Topic = makeTopic();
    const emptyArray: number[] = [];
    const result = await Topic.find(emptyArray);
    expect(result).toEqual([]);
    expect(result).not.toBe(emptyArray);
  });

  it("find on array conditions", async () => {
    const Topic = makeTopic();
    await Topic.create({ title: "Match" });
    const found = await Topic.where({ title: ["Match", "Other"] });
    expect(found.length).toBe(1);
  });

  it("find only some columns", async () => {
    const Topic = makeTopic();
    await Topic.create({ title: "Columns" });
    const sql = Topic.select("title").toSql();
    expect(sql).toMatch(/title/);
  });

  it("find by records", async () => {
    const Topic = makeTopic();
    const t1 = await Topic.create({ title: "T1" });
    const t2 = await Topic.create({ title: "T2" });
    const found = await Topic.where({ id: [t1, t2].map((t) => t.id) });
    expect(found.length).toBe(2);
  });

  it("find by array of one id", async () => {
    const Topic = makeTopic();
    const t = await Topic.create({ title: "One" });
    const found = await Topic.find([t.id]);
    expect(Array.isArray(found)).toBe(true);
    expect((found as any[]).length).toBe(1);
  });

  it("find by ids", async () => {
    const Topic = makeTopic();
    const t1 = await Topic.create({ title: "A" });
    const t2 = await Topic.create({ title: "B" });
    const found = await Topic.find([t1.id, t2.id]);
    expect(Array.isArray(found)).toBe(true);
    expect((found as any[]).length).toBe(2);
  });

  it("find by ids missing one", async () => {
    const Topic = makeTopic();
    const t = await Topic.create({ title: "A" });
    try {
      await Topic.find([t.id, 999999]);
      expect.unreachable("should throw");
    } catch (e: any) {
      expect(e).toBeInstanceOf(RecordNotFound);
      expect(e.message).toBe(
        `Couldn't find all Topics with 'id': (${t.id}, 999999) (found 1 results, but was looking for 2).`,
      );
    }
  });

  it("find with eager loading collection and ordering by collection primary key", async () => {
    class EagerPost extends Base {
      static {
        this.tableName = "posts";
        this.attribute("title", "string", { default: "" });
        this.attribute("body", "string", { default: "" });
        this.hasMany("comments", { className: "EagerComment", foreignKey: "post_id" });
      }
    }
    class EagerComment extends Base {
      static {
        this.tableName = "comments";
        this.attribute("body", "string", { default: "" });
        this.attribute("post_id", "integer");
        this.hasMany("ratings", { className: "EagerRating", foreignKey: "comment_id" });
      }
    }
    class EagerRating extends Base {
      static {
        this.tableName = "ratings";
        this.attribute("value", "integer");
        this.attribute("comment_id", "integer");
      }
    }
    registerModel("EagerPost", EagerPost);
    registerModel("EagerComment", EagerComment);
    registerModel("EagerRating", EagerRating);

    const p1 = await EagerPost.create({ title: "first" });
    const p2 = await EagerPost.create({ title: "second" });
    const c1 = await EagerComment.create({ body: "c1", post_id: p1.id });
    const c2 = await EagerComment.create({ body: "c2", post_id: p2.id });
    await EagerRating.create({ value: 1, comment_id: c1.id });
    await EagerRating.create({ value: 2, comment_id: c2.id });

    const eager = await EagerPost.eagerLoad({ ":comments": ":ratings" })
      .order("posts.id, ratings.id, comments.id")
      .first();
    const expected = await EagerPost.first();
    expect(eager).not.toBeNull();
    expect((eager as any).id).toBe((expected as any).id);
  });
});

describe("FinderTest", () => {
  const { posts, topics, accounts, companies } = fixtures([
    "posts",
    "topics",
    "accounts",
    "companies",
  ]);
  registerModel(CanonicalPost);
  registerModel("Topic", CanonicalTopic);
  registerModel(Account);
  registerModel(CanonicalCompany);
  registerModel(Client);
  const Post = CanonicalPost;
  const rid = (r: unknown) => (r as { id: number }).id;

  it("find by empty in condition", async () => {
    const results = await Post.where({ title: [] });
    expect(results.length).toBe(0);
  });

  it("find with nil inside set passed for one attribute", async () => {
    const clientOf = (
      await CanonicalCompany.where({
        client_of: [2, 1, null],
        name: ["37signals", "Summit", "Microsoft"],
      }).order("client_of DESC")
    ).map((r) => (r as { client_of: bigint | number | null }).client_of);

    expect(clientOf).toContain(null);
    expect(
      clientOf
        .filter((c) => c != null)
        .map(Number)
        .sort(),
    ).toEqual([1, 2]);
  });

  it("find_by with associations", async () => {
    const found = await Post.findBy({ title: posts("welcome").title });
    expect(found).not.toBeNull();
    expect(rid(found)).toBe(rid(posts("welcome")));
  });

  it("first have determined order by default", async () => {
    const expected = [companies("second_client"), companies("another_client")];
    const clients = Client.where({ name: expected.map((c) => (c as { name: string }).name) });

    expect((await clients.first(2)).map(rid)).toEqual(expected.map(rid));
    expect((await clients.limit(5).first(2)).map(rid)).toEqual(expected.map(rid));
    expect((await clients.order(null).first(2)).map(rid)).toEqual(expected.map(rid));
  });

  it("find without primary key", async () => {
    const sql = Post.all().toSql();
    expect(sql).toContain("SELECT");
  });

  it("finder with offset string", async () => {
    await expect(CanonicalTopic.offset("3" as unknown as number)).resolves.toBeDefined();
  });

  it("find on a scope does not perform statement caching", async () => {
    const scope = Post.where({ title: posts("welcome").title });
    const r1 = await scope;
    const r2 = await scope;
    expect(r1.length).toBe(r2.length);
  });

  it("find_by on a scope does not perform statement caching", async () => {
    const r1 = await Post.findBy({ title: posts("welcome").title });
    const r2 = await Post.findBy({ title: posts("welcome").title });
    expect(r1?.id).toBe(r2?.id);
  });

  it("find by on relation with large number", async () => {
    const huge = 9999999999999999999999999999999n;
    expect(await CanonicalTopic.where("1=1").findBy({ id: huge })).toBeNull();
    const found = await CanonicalTopic.where({ id: [rid(topics("first")), huge] }).findBy({
      id: rid(topics("first")),
    });
    expect(rid(found)).toBe(rid(topics("first")));
  });

  it("find_by! raises RecordNotFound if the record is missing", async () => {
    let error: any;
    try {
      await Post.findByBang("1 = 0");
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(RecordNotFound);
    expect(error.message).toBe("Couldn't find Post with [WHERE (1 = 0)]");
  });

  it("implicit order set to primary key", async () => {
    const oldImplicitOrderColumn = CanonicalTopic.implicitOrderColumn;
    CanonicalTopic.implicitOrderColumn = "id";
    try {
      await assertQueriesMatch(
        new RegExp(`ORDER BY ${regexpEscape(quoteTableName("topics.id"))} DESC LIMIT`, "i"),
        undefined,
        false,
        async () => {
          await CanonicalTopic.last();
        },
      );
    } finally {
      CanonicalTopic.implicitOrderColumn = oldImplicitOrderColumn;
    }
  });

  it("joins dont clobber id", async () => {
    const first = await CanonicalFirm.joins(
      "INNER JOIN companies clients ON clients.firm_id = companies.id",
    )
      .where("companies.id = 1")
      .first();
    expect(rid(first)).toBe(1);
  });

  it("find by one attribute bang with blank defined", async () => {
    await expect(Post.findByBang({ title: "nonexistent" })).rejects.toThrow();
  });

  it("select rows", async () => {
    const results = await Post.all();
    expect(results.length).toBe(Object.keys(postFixtureData).length);
  });

  it("find ignores previously inserted record", async () => {
    await Post.create({ title: "test", body: "it out", author_id: 0 });
    expect(await Post.where({ id: null })).toEqual([]);
  });

  it("find by one attribute with several options", async () => {
    const found = await Account.order("id DESC")
      .where("id != ?", rid(accounts("rails_core_account")))
      .findBy({ credit_limit: 50 });
    expect(rid(found)).toBe(rid(accounts("unknown")));
  });
});

describe("FinderTest", () => {
  fixtures(["topics"]);
  registerModel("Topic", CanonicalTopic);

  it("find_by returns nil if the record is missing", async () => {
    const found = await CanonicalTopic.findBy({ title: "Nobody" });
    expect(found).toBeNull();
  });
});

describe("FinderTest", () => {
  fixtures([]);

  it("find_by with non-hash conditions returns the first matching record", async () => {
    class Item extends Base {
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    await Item.create({ name: "Apple" });
    const item = await Item.findBy({ name: "Apple" });
    expect(item).not.toBeNull();
    expect(item!.name).toBe("Apple");
  });
});

describe("FinderTest", () => {
  const { posts } = fixtures(["posts", "comments"]);
  registerModel(CanonicalPost);
  registerModel(CanonicalComment);

  const rid = (r: unknown) => (r as { id: number }).id;
  const idOf = (r: unknown) => (r == null ? r : rid(r));
  const idsOf = (r: unknown) => (r as unknown[]).map((x) => rid(x));

  it("last on relation with limit and offset", async () => {
    const post = await CanonicalPost.find(posts("sti_comments").id);

    let comments = (post as any).comments.order({ id: "asc" });
    expect(idOf((await comments.limit(2)).at(-1))).toEqual(idOf(await comments.limit(2).last()));
    expect(idsOf((await comments.limit(2)).slice(-2))).toEqual(
      idsOf(await comments.limit(2).last(2)),
    );
    expect(idsOf((await comments.limit(2)).slice(-3))).toEqual(
      idsOf(await comments.limit(2).last(3)),
    );

    expect(idOf((await comments.offset(2)).at(-1))).toEqual(idOf(await comments.offset(2).last()));
    expect(idsOf((await comments.offset(2)).slice(-2))).toEqual(
      idsOf(await comments.offset(2).last(2)),
    );
    expect(idsOf((await comments.offset(2)).slice(-3))).toEqual(
      idsOf(await comments.offset(2).last(3)),
    );

    comments = comments.offset(1);
    expect(idOf((await comments.limit(2)).at(-1))).toEqual(idOf(await comments.limit(2).last()));
    expect(idsOf((await comments.limit(2)).slice(-2))).toEqual(
      idsOf(await comments.limit(2).last(2)),
    );
    expect(idsOf((await comments.limit(2)).slice(-3))).toEqual(
      idsOf(await comments.limit(2).last(3)),
    );
  });

  it("first on relation with limit and offset", async () => {
    const post = await CanonicalPost.find(posts("sti_comments").id);

    let comments = (post as any).comments.order({ id: "asc" });
    expect(idOf((await comments.limit(2))[0])).toEqual(idOf(await comments.limit(2).first()));
    expect(idsOf((await comments.limit(2)).slice(0, 2))).toEqual(
      idsOf(await comments.limit(2).first(2)),
    );
    expect(idsOf((await comments.limit(2)).slice(0, 3))).toEqual(
      idsOf(await comments.limit(2).first(3)),
    );

    expect(idOf((await comments.offset(2))[0])).toEqual(idOf(await comments.offset(2).first()));
    expect(idsOf((await comments.offset(2)).slice(0, 2))).toEqual(
      idsOf(await comments.offset(2).first(2)),
    );
    expect(idsOf((await comments.offset(2)).slice(0, 3))).toEqual(
      idsOf(await comments.offset(2).first(3)),
    );

    comments = comments.offset(1);
    expect(idOf((await comments.limit(2))[0])).toEqual(idOf(await comments.limit(2).first()));
    expect(idsOf((await comments.limit(2)).slice(0, 2))).toEqual(
      idsOf(await comments.limit(2).first(2)),
    );
    expect(idsOf((await comments.limit(2)).slice(0, 3))).toEqual(
      idsOf(await comments.limit(2).first(3)),
    );
  });
});

describe("FinderTest", () => {
  fixtures(["topics", "comments", "posts", "companies", "accounts"]);
  registerModel("Topic", CanonicalTopic);
  registerModel("Reply", CanonicalReply);
  registerModel("Comment", CanonicalComment);
  registerModel("Post", CanonicalPost);
  registerModel("Company", CanonicalCompany);
  registerModel("Firm", CanonicalFirm);
  const Topic = CanonicalTopic;
  const Comment = CanonicalComment;
  const Post = CanonicalPost;
  const Company = CanonicalCompany;
  const ids = (rows: unknown[]) =>
    rows.map((r) => Number((r as { id: number | bigint }).id)).sort((a, b) => a - b);

  it("find on hash conditions", async () => {
    expect(await Topic.where({ approved: false }).find(1)).toBeDefined();
    await expect(Topic.where({ approved: true }).find(1)).rejects.toThrow(RecordNotFound);
  });

  it("find on hash conditions with qualified attribute dot notation string", async () => {
    expect(await Topic.where({ "topics.approved": false }).find(1)).toBeDefined();
    await expect(Topic.where({ "topics.approved": true }).find(1)).rejects.toThrow(RecordNotFound);
  });

  it("find on hash conditions with qualified attribute dot notation symbol", async () => {
    expect(await Topic.where({ "topics.approved": false }).find(1)).toBeDefined();
    await expect(Topic.where({ "topics.approved": true }).find(1)).rejects.toThrow(RecordNotFound);
  });

  it("find on hash conditions with hashed table name", async () => {
    expect(await Topic.where({ topics: { approved: false } }).find(1)).toBeDefined();
    await expect(Topic.where({ topics: { approved: true } }).find(1)).rejects.toThrow(
      RecordNotFound,
    );
  });

  it("find on combined explicit and hashed table names", async () => {
    expect(
      await Topic.where({ "topics.approved": false, topics: { author_name: "David" } }).find(1),
    ).toBeDefined();
    await expect(
      Topic.where({ "topics.approved": true, topics: { author_name: "David" } }).find(1),
    ).rejects.toThrow(RecordNotFound);
    await expect(
      Topic.where({ "topics.approved": false, topics: { author_name: "Melanie" } }).find(1),
    ).rejects.toThrow(RecordNotFound);
  });

  it("find on hash conditions with range", async () => {
    expect(ids(await Topic.where({ id: new Range(1, 2) }))).toEqual([1, 2]);
    await expect(Topic.where({ id: new Range(2, 3) }).find(1)).rejects.toThrow(RecordNotFound);
  });

  it("find on hash conditions with end exclusive range", async () => {
    expect(ids(await Topic.where({ id: new Range(1, 3) }))).toEqual([1, 2, 3]);
    expect(ids(await Topic.where({ id: new Range(1, 3, true) }))).toEqual([1, 2]);
    await expect(Topic.where({ id: new Range(2, 3, true) }).find(3)).rejects.toThrow(
      RecordNotFound,
    );
  });

  it("find on hash conditions with multiple ranges", async () => {
    expect(ids(await Comment.where({ id: new Range(1, 3), post_id: new Range(1, 2) }))).toEqual([
      1, 2, 3,
    ]);
    expect(ids(await Comment.where({ id: new Range(1, 1), post_id: new Range(1, 10) }))).toEqual([
      1,
    ]);
  });

  it("find on hash conditions with array of integers and ranges", async () => {
    expect(ids(await Comment.where({ id: [new Range(1, 2), 3, 5, new Range(6, 8), 9] }))).toEqual([
      1, 2, 3, 5, 6, 7, 8, 9,
    ]);
  });

  it("find on hash conditions with array of ranges", async () => {
    expect(ids(await Comment.where({ id: [new Range(1, 2), new Range(6, 8)] }))).toEqual([
      1, 2, 6, 7, 8,
    ]);
  });

  it("find on hash conditions with numeric range for string", async () => {
    const topic = await Topic.create({ title: "12 Factor App" });
    const rows = await Topic.where({ title: new Range(10, 2) });
    expect(ids(rows)).toEqual([Number(topic.id)]);
  });

  it("find on multiple hash conditions", async () => {
    expect(
      await Topic.where({
        author_name: "David",
        title: "The First Topic",
        replies_count: 1,
        approved: false,
      }).find(1),
    ).toBeDefined();
    await expect(
      Topic.where({
        author_name: "David",
        title: "The First Topic",
        replies_count: 1,
        approved: true,
      }).find(1),
    ).rejects.toThrow(RecordNotFound);
    await expect(
      Topic.where({
        author_name: "David",
        title: "HHC",
        replies_count: 1,
        approved: false,
      }).find(1),
    ).rejects.toThrow(RecordNotFound);
  });

  it("condition hash interpolation", async () => {
    expect(await Company.where({ name: "37signals" }).first()).toBeInstanceOf(CanonicalFirm);
    expect(await Company.where({ name: "37signals!" }).first()).toBeNull();
    const writtenOn = (await Topic.where({ id: 1 }).first())!.written_on;
    expect(writtenOn instanceof RubyTime || writtenOn instanceof Temporal.PlainDateTime).toBe(true);
  });

  it("hash condition find malformed", async () => {
    await expect(Company.where({ id: 2, dhh: true }).first()).rejects.toThrow(StatementInvalid);
  });

  it("hash condition find with escaped characters", async () => {
    await Company.create({ name: "Ain't noth'n like' #stuff" });
    expect(await Company.where({ name: "Ain't noth'n like' #stuff" }).first()).toBeTruthy();
  });

  it("hash condition find with array", async () => {
    const [p1, p2] = await Post.limit(2).order("id asc");
    expect(ids(await Post.where({ id: [p1, p2] }).order("id asc"))).toEqual(ids([p1, p2]));
    expect(ids(await Post.where({ id: [p1, (p2 as { id: number }).id] }).order("id asc"))).toEqual(
      ids([p1, p2]),
    );
  });

  it("hash condition find with nil", async () => {
    const topic = await Topic.where({ last_read: null }).first();
    expect(topic).not.toBeNull();
    expect((topic as { last_read: unknown }).last_read).toBeNull();
  });

  it("hash condition utc time interpolation with default timezone local", async () => {
    await withTimezoneConfig({ default: "local" }, async () => {
      const topic = await Topic.first();
      const found = await Topic.where({
        written_on: (topic as { written_on: unknown }).written_on,
      }).first();
      expect((found as { id: number }).id).toBe((topic as { id: number }).id);
    });
  });

  it("hash condition local time interpolation with default timezone utc", async () => {
    await withTimezoneConfig({ default: "utc" }, async () => {
      const topic = await Topic.first();
      const found = await Topic.where({
        written_on: (topic as { written_on: unknown }).written_on,
      }).first();
      expect((found as { id: number }).id).toBe((topic as { id: number }).id);
    });
  });

  const isTime = (v: unknown) => v instanceof RubyTime || v instanceof Temporal.PlainDateTime;

  it("condition interpolation", async () => {
    expect(await Company.where("name = '%s'", "37signals").first()).toBeInstanceOf(CanonicalFirm);
    expect(await Company.where(["name = '%s'", "37signals!"]).first()).toBeNull();
    expect(await Company.where(["name = '%s'", "37signals!' OR 1=1"]).first()).toBeNull();
    const topic = await Topic.where(["id = %d", 1]).first();
    expect(isTime((topic as { written_on: unknown }).written_on)).toBe(true);
  });

  it("condition array interpolation", async () => {
    expect(await Company.where(["name = '%s'", "37signals"]).first()).toBeInstanceOf(CanonicalFirm);
    expect(await Company.where(["name = '%s'", "37signals!"]).first()).toBeNull();
    expect(await Company.where(["name = '%s'", "37signals!' OR 1=1"]).first()).toBeNull();
    const topic = await Topic.where(["id = %d", 1]).first();
    expect(isTime((topic as { written_on: unknown }).written_on)).toBe(true);
  });

  it("bind variables", async () => {
    expect(await Company.where(["name = ?", "37signals"]).first()).toBeInstanceOf(CanonicalFirm);
    expect(await Company.where(["name = ?", "37signals!"]).first()).toBeNull();
    expect(await Company.where(["name = ?", "37signals!' OR 1=1"]).first()).toBeNull();
    const topic = await Topic.where(["id = ?", 1]).first();
    expect(isTime((topic as { written_on: unknown }).written_on)).toBe(true);
    expect(() => Company.where(["id=? AND name = ?", 2])).toThrow(PreparedStatementInvalid);
    expect(() => Company.where(["id=?", 2, 3, 4])).toThrow(PreparedStatementInvalid);
  });

  it("bind variables with quotes", async () => {
    await Company.create({ name: "37signals' go'es against" });
    expect(await Company.where(["name = ?", "37signals' go'es against"]).first()).toBeTruthy();
  });

  it("named bind variables with quotes", async () => {
    await Company.create({ name: "37signals' go'es against" });
    expect(
      await Company.where(["name = :name", { name: "37signals' go'es against" }]).first(),
    ).toBeTruthy();
  });

  it("named bind variables", async () => {
    expect(await Company.where(["name = :name", { name: "37signals" }]).first()).toBeInstanceOf(
      CanonicalFirm,
    );
    expect(await Company.where(["name = :name", { name: "37signals!" }]).first()).toBeNull();
    expect(
      await Company.where(["name = :name", { name: "37signals!' OR 1=1" }]).first(),
    ).toBeNull();
    const topic = await Topic.where(["id = :id", { id: 1 }]).first();
    expect(isTime((topic as { written_on: unknown }).written_on)).toBe(true);
  });

  it("condition utc time interpolation with default timezone local", async () => {
    await withTimezoneConfig({ default: "local" }, async () => {
      const topic = await Topic.first();
      const found = await Topic.where([
        "written_on = ?",
        (topic as { written_on: unknown }).written_on,
      ]).first();
      expect((found as { id: number }).id).toBe((topic as { id: number }).id);
    });
  });

  it("condition local time interpolation with default timezone utc", async () => {
    await withTimezoneConfig({ default: "utc" }, async () => {
      const topic = await Topic.first();
      const found = await Topic.where([
        "written_on = ?",
        (topic as { written_on: unknown }).written_on,
      ]).first();
      expect((found as { id: number }).id).toBe((topic as { id: number }).id);
    });
  });
});

describe("FinderTest", () => {
  const { customers, cpkBooks, authors, topics } = fixtures([
    "customers",
    "cpkBooks",
    "cpkAuthors",
    "topics",
    "authors",
    "posts",
  ]);
  const Customer = CanonicalCustomer;
  const Author = CanonicalAuthor;
  registerModel("Customer", Customer);
  registerModel("Cpk::Book", CpkBook);
  registerModel("Author", Author);

  const oneLimitRe = /1 AS one.*LIMIT/;

  it("include when non AR object passed on unloaded relation", async () => {
    await assertNoQueries(false, async () => {
      expect(await Customer.where({ name: "David" }).include("I'm not an AR object" as never)).toBe(
        false,
      );
    });
  });

  it("include when non AR object passed on loaded relation", async () => {
    const custs = await Customer.where({ name: "David" }).load();
    await assertNoQueries(false, async () => {
      expect(await custs.include("I'm not an AR object" as never)).toBe(false);
    });
  });

  it("member when non AR object passed on unloaded relation", async () => {
    await assertNoQueries(false, async () => {
      expect(await Customer.where({ name: "David" }).member("I'm not an AR object" as never)).toBe(
        false,
      );
    });
  });

  it("member when non AR object passed on loaded relation", async () => {
    const custs = await Customer.where({ name: "David" }).load();
    await assertNoQueries(false, async () => {
      expect(await custs.member("I'm not an AR object" as never)).toBe(false);
    });
  });

  it("include on unloaded relation with match", async () => {
    await assertQueriesMatch(oneLimitRe, undefined, false, async () => {
      expect(await Customer.where({ name: "David" }).include(customers("david"))).toBe(true);
    });
  });

  it("include on unloaded relation without match", async () => {
    await assertQueriesMatch(oneLimitRe, undefined, false, async () => {
      expect(await Customer.where({ name: "David" }).include(customers("mary"))).toBe(false);
    });
  });

  it("include on unloaded relation with mismatched class", async () => {
    const topic = topics("first");
    expect(await Customer.exists(topic.id)).toBe(true);

    await assertNoQueries(false, async () => {
      expect(await Customer.where({ name: "David" }).include(topic as never)).toBe(false);
    });
  });

  it("include on unloaded relation with offset", async () => {
    await assertQueriesMatch(/ORDER BY name ASC/, undefined, false, async () => {
      expect(await Customer.offset(1).order("name ASC").include(customers("mary"))).toBe(true);
    });
  });

  it("include on unloaded relation with limit", async () => {
    const mary = customers("mary");
    const barney = customers("barney");
    const david = customers("david");

    expect(await Customer.order({ id: "desc" }).limit(2).include(david)).toBe(false);
    expect(await Customer.order({ id: "desc" }).limit(2).include(barney)).toBe(true);
    expect(await Customer.order({ id: "desc" }).limit(2).include(mary)).toBe(true);
  });

  it.skipIf(adapterType === "postgres")(
    "include on unloaded relation with having referencing aliased select",
    async () => {
      const bob = authors("bob");
      const mary = authors("mary");

      expect(
        await Author.select("COUNT(*) as total_posts", "authors.*")
          .joins(":posts")
          .group("id")
          .having("total_posts > 2")
          .include(bob),
      ).toBe(false);
      expect(
        await Author.select("COUNT(*) as total_posts", "authors.*")
          .joins(":posts")
          .group("id")
          .having("total_posts > 2")
          .include(mary),
      ).toBe(true);
    },
  );

  it("include on loaded relation with match", async () => {
    const custs = await Customer.where({ name: "David" }).load();
    const david = customers("david");

    await assertNoQueries(false, async () => {
      expect(await custs.include(david)).toBe(true);
    });
  });

  it("include on loaded relation without match", async () => {
    const custs = await Customer.where({ name: "David" }).load();
    const mary = customers("mary");

    await assertNoQueries(false, async () => {
      expect(await custs.include(mary)).toBe(false);
    });
  });

  it("include on unloaded relation with composite primary key", async () => {
    await assertQueriesMatch(oneLimitRe, undefined, false, async () => {
      const book = cpkBooks("cpk_great_author_first_book");
      expect(await CpkBook.where({ title: "The first book" }).include(book)).toBe(true);
    });
  });

  it("include on loaded relation with composite primary key", async () => {
    const books = await CpkBook.where({ title: "The first book" }).load();
    const greatAuthorBook = cpkBooks("cpk_great_author_first_book");

    await assertNoQueries(false, async () => {
      expect(await books.include(greatAuthorBook)).toBe(true);
    });
  });

  it("member on unloaded relation with match", async () => {
    await assertQueriesMatch(oneLimitRe, undefined, false, async () => {
      expect(await Customer.where({ name: "David" }).member(customers("david"))).toBe(true);
    });
  });

  it("member on unloaded relation without match", async () => {
    await assertQueriesMatch(oneLimitRe, undefined, false, async () => {
      expect(await Customer.where({ name: "David" }).member(customers("mary"))).toBe(false);
    });
  });

  it("member on unloaded relation with mismatched class", async () => {
    const topic = topics("first");
    expect(await Customer.exists(topic.id)).toBe(true);

    await assertNoQueries(false, async () => {
      expect(await Customer.where({ name: "David" }).member(topic as never)).toBe(false);
    });
  });

  it("member on unloaded relation with offset", async () => {
    await assertQueriesMatch(/ORDER BY name ASC/, undefined, false, async () => {
      expect(await Customer.offset(1).order("name ASC").member(customers("mary"))).toBe(true);
    });
  });

  it("member on unloaded relation with limit", async () => {
    const mary = customers("mary");
    const barney = customers("barney");
    const david = customers("david");

    expect(await Customer.order({ id: "desc" }).limit(2).member(david)).toBe(false);
    expect(await Customer.order({ id: "desc" }).limit(2).member(barney)).toBe(true);
    expect(await Customer.order({ id: "desc" }).limit(2).member(mary)).toBe(true);
  });

  it("member on loaded relation with match", async () => {
    const custs = await Customer.where({ name: "David" }).load();
    const david = customers("david");

    await assertNoQueries(false, async () => {
      expect(await custs.member(david)).toBe(true);
    });
  });

  it("member on loaded relation without match", async () => {
    const custs = await Customer.where({ name: "David" }).load();
    const mary = customers("mary");

    await assertNoQueries(false, async () => {
      expect(await custs.member(mary)).toBe(false);
    });
  });

  it("member on unloaded relation with composite primary key", async () => {
    await assertQueriesMatch(oneLimitRe, undefined, false, async () => {
      const book = cpkBooks("cpk_great_author_first_book");
      expect(await CpkBook.where({ title: "The first book" }).member(book)).toBe(true);
    });
  });

  it("member on loaded relation with composite primary key", async () => {
    const books = await CpkBook.where({ title: "The first book" }).load();
    const greatAuthorBook = cpkBooks("cpk_great_author_first_book");

    await assertNoQueries(false, async () => {
      expect(await books.member(greatAuthorBook)).toBe(true);
    });
  });
});

describe("FinderTest", () => {
  const { customers } = fixtures(["customers"]);
  const Customer = CanonicalCustomer;

  it("exists with aggregate having three mappings", async () => {
    const existingAddress = (
      customers("david") as InstanceType<typeof Customer> & { address: Address }
    ).address;
    expect(await Customer.exists({ address: existingAddress })).toBe(true);
  });

  it("exists with aggregate having three mappings with one difference", async () => {
    const existingAddress = (
      customers("david") as InstanceType<typeof Customer> & { address: Address }
    ).address;
    expect(
      await Customer.exists({
        address: new Address(
          existingAddress.street,
          existingAddress.city,
          existingAddress.country + "1",
        ),
      }),
    ).toBe(false);
    expect(
      await Customer.exists({
        address: new Address(
          existingAddress.street,
          existingAddress.city + "1",
          existingAddress.country,
        ),
      }),
    ).toBe(false);
    expect(
      await Customer.exists({
        address: new Address(
          existingAddress.street + "1",
          existingAddress.city,
          existingAddress.country,
        ),
      }),
    ).toBe(false);
  });
});

describe("FinderTest", () => {
  const { topics, authors, developers } = fixtures([
    "topics",
    "authors",
    "posts",
    "comments",
    "categorizations",
    "taggings",
    "subscribers",
    "developers",
    "ratings",
  ]);

  const Topic = CanonicalTopic;
  const Author = CanonicalAuthor;
  const Post = CanonicalPost;
  const Comment = CanonicalComment;
  const Tagging = CanonicalTagging;
  const Subscriber = CanonicalSubscriber;
  const Developer = CanonicalDeveloper;
  registerModel("Topic", Topic);
  registerModel("Reply", CanonicalReply);
  registerModel("Tag", CanonicalTag);
  registerModel("SpecialComment", SpecialComment);

  it("exists", async () => {
    expect(await Topic.exists(1)).toBe(true);
    expect(await Topic.exists("1")).toBe(true);
    expect(await Topic.exists({ title: "The First Topic" })).toBe(true);
    expect(await Topic.exists({ heading: "The First Topic" })).toBe(true);
    expect(await Topic.exists({ author_name: "Mary", approved: true })).toBe(true);
    expect(await Topic.exists(["parent_id = ?", 1])).toBe(true);
    expect(await Topic.exists({ id: [1, 9999] })).toBe(true);

    expect(await Topic.exists(45)).toBe(false);
    expect(await Topic.exists(9999999999999999999999999999999n)).toBe(false);
    expect(await Topic.exists((new Topic() as any).id)).toBe(false);

    await expect(Topic.exists([1, 2])).rejects.toMatchObject({ name: "ArgumentError" });
  });

  it("exists with scope", async () => {
    const davids = Author.where({ name: "David" });
    expect(await davids.exists()).toBe(true);
    expect(await davids.exists(authors("david").id)).toBe(true);
    expect(await davids.exists(authors("mary").id)).toBe(false);
    expect(await davids.exists("42")).toBe(false);
    expect(await davids.exists(42)).toBe(false);
    expect(await davids.exists((davids.new() as any).id)).toBe(false);

    const fake = Author.where({ name: "fake author" });
    expect(await fake.exists()).toBe(false);
    expect(await fake.exists(authors("david").id)).toBe(false);
  });

  it("exists uses existing scope", async () => {
    const post = (await authors("david").posts.first())!;
    const authorsRel = Author.includes(":posts").where({ name: "David", posts: { id: post.id } });
    expect(await authorsRel.exists(authors("david").id)).toBe(true);
  });

  it("exists with polymorphic relation", async () => {
    const post = await Post.createBang({
      title: "Post",
      body: "default",
      taggings: [Tagging.new({ comment: "tagging comment" })],
    });
    const relation = Post.taggedWithComment("tagging comment");

    expect(await relation.exists({ title: ["Post"] })).toBe(true);
    expect(await relation.exists(["title LIKE ?", "Post%"])).toBe(true);
    expect(await relation.exists()).toBe(true);
    expect(await relation.exists(post.id)).toBe(true);
    expect(await relation.exists(String(post.id))).toBe(true);

    expect(await relation.exists(false)).toBe(false);
  });

  it("exists with string", async () => {
    expect(await Subscriber.exists("foo")).toBe(false);
    expect(await Subscriber.exists("   ")).toBe(false);

    await Subscriber.createBang({ id: "foo" });
    await Subscriber.createBang({ id: "   " });

    expect(await Subscriber.exists("foo")).toBe(true);
    expect(await Subscriber.exists("   ")).toBe(true);
  });

  it("exists with strong parameters", async () => {
    expect(await Subscriber.exists(new ProtectedParams({ nick: "foo" }).permitBang())).toBe(false);

    await Subscriber.createBang({ nick: "foo" });

    expect(await Subscriber.exists(new ProtectedParams({ nick: "foo" }).permitBang())).toBe(true);

    await expect(Subscriber.exists(new ProtectedParams({ nick: "foo" }))).rejects.toThrow(
      ForbiddenAttributesError,
    );
  });

  it("exists passing active record object is not permitted", async () => {
    await expect(Topic.exists(new Topic())).rejects.toThrow(
      "You are passing an instance of ActiveRecord::Base to `exists?`. " +
        "Please pass the id of the object by calling `.id`.",
    );
  });

  it("exists does not select columns without alias", async () => {
    await assertQueriesMatch(
      new RegExp(`SELECT 1 AS one FROM ${regexpEscape(quoteTableName("topics"))}`, "i"),
      undefined,
      false,
      async () => {
        await Topic.exists();
      },
    );
  });

  it("exists returns true with one record and no args", async () => {
    expect(await Topic.exists()).toBe(true);
  });

  it("exists returns false with false arg", async () => {
    expect(await Topic.exists(false)).toBe(false);
  });

  it("exists with loaded relation", async () => {
    const relation = await Topic.all().load();
    await assertQueriesMatch(/SELECT 1 AS one/i, 1, false, async () => {
      expect(await relation.exists()).toBe(true);
    });
  });

  it("exists with empty loaded relation", async () => {
    await Topic.deleteAll();
    const relation = await Topic.all().load();
    await assertQueriesMatch(/SELECT 1 AS one/i, 1, false, async () => {
      expect(await relation.exists()).toBe(false);
    });
  });

  it("exists with loaded relation having unsaved records", async () => {
    const author = authors("david");
    const posts = await author.posts.load();
    expect(posts.length).toBeGreaterThan(0);
    for (const post of posts) await post.destroy();

    await assertQueriesMatch(/SELECT 1 AS one/i, undefined, false, async () => {
      expect(await author.posts.exists()).toBe(false);
    });
  });

  it("exists with loaded relation having updated owner record", async () => {
    const author = authors("david");
    expect((await author.posts).length).toBeGreaterThan(0);

    for (const post of await author.posts) {
      post.author = null;
      await post.saveBang();
    }

    await assertQueriesCount(1, false, async () => {
      expect(await author.posts.exists()).toBe(false);
    });
  });

  it("exists with nil arg", async () => {
    expect(await Topic.exists(null)).toBe(false);
    expect(await Topic.exists()).toBe(true);

    expect(await (await Topic.first())!.replies.exists(null)).toBe(false);
    expect(await (await Topic.first())!.replies.exists()).toBe(true);
  });

  it("exists with empty hash arg", async () => {
    expect(await Topic.exists({})).toBe(true);
  });

  it("exists with distinct and offset and joins", async () => {
    expect(await Post.leftJoins(":comments").distinct().offset(10).exists()).toBe(true);
    expect(await Post.leftJoins(":comments").distinct().offset(11).exists()).toBe(false);
  });

  it("exists with distinct and offset and select", async () => {
    expect(await Post.select("body").distinct().offset(4).exists()).toBe(true);
    expect(await Post.select("body").distinct().offset(5).exists()).toBe(false);
  });

  it("exists with distinct and offset and eagerload and order", async () => {
    expect(
      await Post.eagerLoad(":comments")
        .distinct()
        .offset(10)
        .merge(Comment.order({ post_id: "asc" }))
        .exists(),
    ).toBe(true);
    expect(
      await Post.eagerLoad(":comments")
        .distinct()
        .offset(11)
        .merge(Comment.order({ post_id: "asc" }))
        .exists(),
    ).toBe(false);
  });

  it("exists with order and distinct", async () => {
    expect(await Topic.order("id").distinct().exists()).toBe(true);
  });

  it("exists with order", async () => {
    expect(await Topic.order(arelSql("invalid sql here")).exists()).toBe(true);
  });

  it("exists with joins", async () => {
    expect(
      await Topic.joins(":replies")
        .where({ replies_topics: { approved: true } })
        .order("replies_topics.created_at DESC")
        .exists(),
    ).toBe(true);
  });

  it("exists with left joins", async () => {
    expect(
      await Topic.leftJoins(":replies")
        .where({ replies_topics: { approved: true } })
        .order("replies_topics.created_at DESC")
        .exists(),
    ).toBe(true);
  });

  it("exists with eager load", async () => {
    expect(
      await Topic.eagerLoad(":replies")
        .where({ replies_topics: { approved: true } })
        .order("replies_topics.created_at DESC")
        .exists(),
    ).toBe(true);
  });

  it("exists with includes limit and empty result", async () => {
    await assertNoQueries(false, async () => {
      expect(await Topic.includes(":replies").limit(0).exists()).toBe(false);
    });
    await assertQueriesCount(1, false, async () => {
      expect(await Topic.includes(":replies").limit(1).where("0 = 1").exists()).toBe(false);
    });
  });

  it("exists with distinct association includes and limit", async () => {
    const author = (await Author.first())!;
    const uniqueCategorizedPosts = (author as any).uniqueCategorizedPosts.includes(
      ":specialComments",
    );
    await assertNoQueries(false, async () => {
      expect(await uniqueCategorizedPosts.limit(0).exists()).toBe(false);
    });
    await assertQueriesCount(1, false, async () => {
      expect(await uniqueCategorizedPosts.limit(1).exists()).toBe(true);
    });
  });

  it("exists with distinct association includes limit and order", async () => {
    const author = (await Author.first())!;
    const uniqueCategorizedPosts = (author as any).uniqueCategorizedPosts
      .includes(":specialComments")
      .order("comments.tags_count DESC");
    await assertNoQueries(false, async () => {
      expect(await uniqueCategorizedPosts.limit(0).exists()).toBe(false);
    });
    await assertQueriesCount(1, false, async () => {
      expect(await uniqueCategorizedPosts.limit(1).exists()).toBe(true);
    });
  });

  it("exists should reference correct aliases while joining tables of has many through association", async () => {
    const ratings = (developers("david") as any).ratings
      .includes({ ":comment": ":post" })
      .where({ posts: { id: 1 } });
    await assertQueriesCount(1, false, async () => {
      expect(await ratings.limit(1).exists()).toBe(false);
    });
  });

  it("exists with empty table and no args given", async () => {
    await Topic.deleteAll();
    expect(await Topic.exists()).toBe(false);
  });

  it("exists does not instantiate records", async () => {
    const original = (Developer as any).instantiate;
    let called = false;
    (Developer as any).instantiate = function (this: unknown, ...args: unknown[]) {
      called = true;
      return original.apply(this, args);
    };
    try {
      await Developer.exists();
    } finally {
      (Developer as any).instantiate = original;
    }
    expect(called).toBe(false);
  });
});
