import { describe, it, expect } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import {
  IrreversibleOrderError,
  Range,
  RecordNotFound,
  registerModel,
  SoleRecordExceeded,
} from "./index.js";
import { sql as arelSql } from "@blazetrails/arel";

import { fixtures } from "./test-fixtures.js";
import { Account } from "./test-helpers/models/account.js";
import { Client } from "./test-helpers/models/company.js";
import "./support/canonical-model-index.js";
import { CpkBook, CpkReview } from "./test-helpers/models/cpk.js";
import { Entrant } from "./test-helpers/models/entrant.js";
import { ClothingItem } from "./test-helpers/models/clothing-item.js";
import { NonPrimaryKey } from "./test-helpers/models/non-primary-key.js";
import { adapterType } from "./test-adapter.js";
import {
  Topic as CanonicalTopic,
  BlankTopic as CanonicalBlankTopic,
} from "./test-helpers/models/topic.js";
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
import {
  Customer as CanonicalCustomer,
  Address,
  Money,
  GpsLocation,
} from "./test-helpers/models/customer.js";
import { Author as CanonicalAuthor } from "./test-helpers/models/author.js";
import { Tagging as CanonicalTagging } from "./test-helpers/models/tagging.js";
import { Subscriber as CanonicalSubscriber } from "./test-helpers/models/subscriber.js";
import { Developer as CanonicalDeveloper } from "./test-helpers/models/developer.js";
import { Tag as CanonicalTag } from "./test-helpers/models/tag.js";
import { Car as CanonicalCar } from "./test-helpers/models/car.js";
import { Toy } from "./test-helpers/models/toy.js";
import { Matey } from "./test-helpers/models/matey.js";
import {
  Company as CanonicalCompany,
  Firm as CanonicalFirm,
  DependentFirm as CanonicalDependentFirm,
} from "./test-helpers/models/company.js";
import { PreparedStatementInvalid, StatementInvalid, UnknownPrimaryKey } from "./index.js";
import { ForbiddenAttributesError, MissingAttributeError } from "@blazetrails/activemodel";
import { assertRespondTo, assertNotEmpty } from "@blazetrails/activesupport";

function assertNotCalledFlag(called: boolean): void {
  if (called) throw new Error("Expected instantiate not to be called");
}
import { ProtectedParams } from "./support/stubs/strong-parameters.js";
import { withTimezoneConfig } from "./test-helper.js";
import { assertAsyncEqual } from "./support/async-helper.js";
import { Time as RubyTime } from "@blazetrails/date";

describe("FinderTest", () => {
  const { topics } = fixtures(["topics", "entrants", "developers", "developersProjects"]);
  const rid = (r: unknown) => (r as { id: number }).id;
  const Topic = CanonicalTopic;
  registerModel("Topic", Topic);
  registerModel("Reply", CanonicalReply);
  registerModel(Entrant);
  registerModel(CanonicalDeveloper);

  it("take", async () => {
    expect(rid(await Topic.where("title = 'The First Topic'").take())).toBe(rid(topics("first")));
  });

  it("take failing", async () => {
    expect(await Topic.where("title = 'This title does not exist'").take()).toBeNull();
  });

  it("take bang present", async () => {
    await expect(
      Topic.where("title = 'The Second Topic of the day'").takeBang(),
    ).resolves.not.toThrow();
    const record = await Topic.where("title = 'The Second Topic of the day'").takeBang();
    expect(rid(record)).toBe(rid(topics("second")));
  });

  it("take bang missing", async () => {
    await expect(Topic.where("title = 'This title does not exist'").takeBang()).rejects.toThrow(
      RecordNotFound,
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
    await expect(Topic.findSoleBy("title = 'This title does not exist'")).rejects.toThrow(
      RecordNotFound,
    );
  });

  it("sole failing many", async () => {
    await expect(Topic.where("author_name = 'Carl'").sole()).rejects.toThrow(SoleRecordExceeded);
    await expect(Topic.findSoleBy("author_name = 'Carl'")).rejects.toThrow(SoleRecordExceeded);
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
    await expect(
      Topic.where("title = 'The Second Topic of the day'").firstBang(),
    ).resolves.not.toThrow();
    const record = await Topic.where("title = 'The Second Topic of the day'").firstBang();
    expect(rid(record)).toBe(rid(topics("second")));
  });

  it("first bang missing", async () => {
    await expect(Topic.where("title = 'This title does not exist'").firstBang()).rejects.toThrow(
      RecordNotFound,
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
    await expect(
      Topic.where("title = 'The Second Topic of the day'").lastBang(),
    ).resolves.not.toThrow();
    const record = await Topic.where("title = 'The Second Topic of the day'").lastBang();
    expect(rid(record)).toBe(rid(topics("second")));
  });

  it("last bang missing", async () => {
    await expect(Topic.where("title = 'This title does not exist'").lastBang()).rejects.toThrow(
      RecordNotFound,
    );
  });

  it("model class responds to last bang", async () => {
    expect(rid(await Topic.lastBang())).toBe(rid(topics("fifth")));
    await Topic.deleteAll();
    await expect(Topic.lastBang()).rejects.toThrow(RecordNotFound);
  });

  it("take and first and last with integer should return an array", async () => {
    expect(await Topic.take(5)).toBeInstanceOf(Array);
    expect(await Topic.first(5)).toBeInstanceOf(Array);
    expect(await Topic.last(5)).toBeInstanceOf(Array);
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
    expect(relation.isLoaded).toBeFalsy();
  });

  it("last with integer and reorder should use sql limit", async () => {
    const relation = Topic.reorder("title");
    await assertQueriesCount(1, false, async () => {
      await relation.last(5);
    });
    expect(relation.isLoaded).toBeFalsy();
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

    expect(await existsWhere(id.gt(bind(negBig)))).toBeTruthy();
    expect(await existsWhere(id.gteq(bind(negBig)))).toBeTruthy();
    expect(await existsWhere(id.lt(bind(big)))).toBeTruthy();
    expect(await existsWhere(id.lteq(bind(big)))).toBeTruthy();

    expect(await existsWhere(id.gt(bind(big)))).toBeFalsy();
    expect(await existsWhere(id.gteq(bind(big)))).toBeFalsy();
    expect(await existsWhere(id.lt(bind(negBig)))).toBeFalsy();
    expect(await existsWhere(id.lteq(bind(negBig)))).toBeFalsy();
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

  it("find passing active record object is not permitted", async () => {
    const last = await Topic.last();
    await expect(Topic.find(last)).rejects.toThrow(ArgumentError);
    const error = await Topic.find(last).catch((e: unknown) => e);
    expect((error as Error).message).toBe(
      "You are passing an instance of ActiveRecord::Base to `find`. " +
        "Please pass the id of the object by calling `.id`.",
    );
  });

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
  const { topics, companies, accounts, entrants, posts, customers, cpkBooks, cpkReviews, authors } =
    fixtures([
      "topics",
      "companies",
      "accounts",
      "entrants",
      "posts",
      "comments",
      "customers",
      "cpkBooks",
      "cpkAuthors",
      "cpkReviews",
      "authors",
      "authorAddresses",
      "clothingItems",
      "developers",
      "categorizations",
      "categories",
    ]);
  registerModel("Topic", CanonicalTopic);
  registerModel("Reply", CanonicalReply);
  registerModel(CanonicalPost);
  registerModel(CanonicalComment);
  registerModel(CanonicalCompany);
  registerModel(CanonicalFirm);
  registerModel(CanonicalDependentFirm);
  registerModel(Account);
  registerModel(Entrant);
  registerModel(CanonicalAuthor);
  registerModel(CanonicalDeveloper);
  registerModel("Cpk::Book", CpkBook);
  registerModel("Cpk::Review", CpkReview);
  registerModel(NonPrimaryKey);
  const Topic = CanonicalTopic;
  const Post = CanonicalPost;
  const Customer = CanonicalCustomer;
  const rid = (r: unknown) => (r as { id: number }).id;

  it("find with custom select excluding id", async () => {
    let found = (await Topic.select("title").find([4, 2, 5])) as unknown[];
    expect(found.map(rid)).toEqual([4, 2, 5]);

    found = (await Topic.select("title").order("id").find([4, 2, 5])) as unknown[];
    expect(found.map(rid)).toEqual([2, 4, 5]);
  });

  it("find with proc parameter and block", async () => {
    const exception = await Topic.all()
      .find(
        () => {
          throw new Error("should happen");
        },
        (e: unknown) => (e as { title: string }).title === "non-existing-title",
      )
      .catch((e: unknown) => e as Error);
    expect(() => {
      throw exception as Error;
    }).toThrow();
    expect((exception as Error).message).toBe("should happen");

    await expect(
      Topic.all().find(
        () => {
          throw new Error("should not happen");
        },
        (e: unknown) => (e as { title: string }).title === topics("first").title,
      ),
    ).resolves.not.toThrow();
  });

  it("find with ids returning ordered", async () => {
    let records = (await Topic.find([4, 2, 5])) as unknown[];
    expect((records[0] as { title: string }).title).toBe("The Fourth Topic of the day");
    expect((records[1] as { title: string }).title).toBe("The Second Topic of the day");
    expect((records[2] as { title: string }).title).toBe("The Fifth Topic of the day");

    records = (await Topic.find(4, 2, 5)) as unknown[];
    expect((records[0] as { title: string }).title).toBe("The Fourth Topic of the day");
    expect((records[1] as { title: string }).title).toBe("The Second Topic of the day");
    expect((records[2] as { title: string }).title).toBe("The Fifth Topic of the day");

    records = (await Topic.find(["4", "2", "5"])) as unknown[];
    expect((records[0] as { title: string }).title).toBe("The Fourth Topic of the day");
    expect((records[1] as { title: string }).title).toBe("The Second Topic of the day");
    expect((records[2] as { title: string }).title).toBe("The Fifth Topic of the day");

    records = (await Topic.find("4", "2", "5")) as unknown[];
    expect((records[0] as { title: string }).title).toBe("The Fourth Topic of the day");
    expect((records[1] as { title: string }).title).toBe("The Second Topic of the day");
    expect((records[2] as { title: string }).title).toBe("The Fifth Topic of the day");
  });

  it("find with ids and order clause", async () => {
    let records = (await Topic.order("author_name").find([5, 3, 1])) as unknown[];
    expect((records[0] as { title: string }).title).toBe("The Third Topic of the day");
    expect((records[1] as { title: string }).title).toBe("The First Topic");
    expect((records[2] as { title: string }).title).toBe("The Fifth Topic of the day");

    records = (await Topic.order("id").find([5, 3, 1])) as unknown[];
    expect((records[0] as { title: string }).title).toBe("The First Topic");
    expect((records[1] as { title: string }).title).toBe("The Third Topic of the day");
    expect((records[2] as { title: string }).title).toBe("The Fifth Topic of the day");
  });

  it("find with ids with limit and order clause", async () => {
    const records = (await Topic.limit(2).order("id").find([5, 3, 1])) as unknown[];
    expect(records.length).toBe(2);
    expect((records[0] as { title: string }).title).toBe("The First Topic");
    expect((records[1] as { title: string }).title).toBe("The Third Topic of the day");
  });

  it("find with ids and limit", async () => {
    const records = (await Topic.limit(3).find([3, 2, 5, 1, 4])) as unknown[];
    expect(records.length).toBe(3);
    expect((records[0] as { title: string }).title).toBe("The Third Topic of the day");
    expect((records[1] as { title: string }).title).toBe("The Second Topic of the day");
    expect((records[2] as { title: string }).title).toBe("The Fifth Topic of the day");
  });

  it("find with ids where and limit", async () => {
    const records = (await Topic.where({ approved: true })
      .limit(3)
      .find([3, 2, 5, 1, 4])) as unknown[];
    expect(records.length).toBe(3);
    expect((records[0] as { title: string }).title).toBe("The Third Topic of the day");
    expect((records[1] as { title: string }).title).toBe("The Second Topic of the day");
    expect((records[2] as { title: string }).title).toBe("The Fifth Topic of the day");
  });

  it("find with ids and offset", async () => {
    const records = (await Topic.offset(2).find([3, 2, 5, 1, 4])) as unknown[];
    expect(records.length).toBe(3);
    expect((records[0] as { title: string }).title).toBe("The Fifth Topic of the day");
    expect((records[1] as { title: string }).title).toBe("The First Topic");
    expect((records[2] as { title: string }).title).toBe("The Fourth Topic of the day");
  });

  it("find with ids with no id passed", async () => {
    const find = Topic.find as (...ids: unknown[]) => Promise<unknown>;
    await expect(find.call(Topic)).rejects.toThrow(RecordNotFound);
    const exception = await find.call(Topic).catch((e: unknown) => e);
    expect((exception as RecordNotFound).model).toBe("Topic");
    expect((exception as RecordNotFound).primaryKey).toBe("id");
  });

  it("find with ids with id out of range", async () => {
    await expect(Topic.find("9999999999999999999999999999999")).rejects.toThrow(RecordNotFound);
    const exception = await Topic.find("9999999999999999999999999999999").catch((e: unknown) => e);
    expect((exception as RecordNotFound).model).toBe("Topic");
    expect((exception as RecordNotFound).primaryKey).toBe("id");
  });

  it("find by ids with limit and offset", async () => {
    expect((await Entrant.limit(2).find([1, 3, 2])).length).toBe(2);
    const limited = (await Entrant.limit(3).offset(2).find([1, 3, 2])) as unknown[];
    expect(limited.length).toBe(1);
    expect((limited[0] as { name: string }).name).toBe("Ruby Guru");

    const devs = await CanonicalDeveloper.all();
    const lastDevs = (await CanonicalDeveloper.limit(3)
      .offset(9)
      .find(devs.map(rid).sort((a, b) => a - b))) as unknown[];
    expect(lastDevs.length).toBe(2);
    expect((lastDevs[0] as { name: string }).name).toBe("fixture_10");
    expect((lastDevs[1] as { name: string }).name).toBe("Jamis");
  });

  it("find with large number", async () => {
    await assertQueriesCount(0, false, async () => {
      await expect(Topic.find("9999999999999999999999999999999")).rejects.toThrow(RecordNotFound);
    });
  });

  it("find by with large number", async () => {
    await assertQueriesCount(0, false, async () => {
      expect(await Topic.findBy({ id: "9999999999999999999999999999999" as never })).toBeNull();
    });
  });

  it("find by id with large number", async () => {
    await assertQueriesCount(0, false, async () => {
      expect(await Topic.findBy({ id: "9999999999999999999999999999999" as never })).toBeNull();
    });
  });

  it("find on relation with large number", async () => {
    await expect(Topic.where("1=1").find(9999999999999999999999999999999n)).rejects.toThrow(
      RecordNotFound,
    );
    expect(rid(await Topic.where({ id: [1, 9999999999999999999999999999999n] }).find(1))).toBe(
      rid(topics("first")),
    );
  });

  it("find by bang on relation with large number", async () => {
    await expect(
      Topic.where("1=1").findByBang({ id: 9999999999999999999999999999999n }),
    ).rejects.toThrow(RecordNotFound);
    expect(
      rid(await Topic.where({ id: [1, 9999999999999999999999999999999n] }).findByBang({ id: 1 })),
    ).toBe(rid(topics("first")));
  });

  it("find doesnt have implicit ordering", async () => {
    await assertQueriesMatch(/^((?!ORDER).)*$/, undefined, false, async () => {
      await Topic.find(1);
    });
  });

  it("find by ids missing one", async () => {
    await expect(Topic.find(1, 2, 45)).rejects.toThrow(RecordNotFound);
  });

  it("find with group and sanitized having method", async () => {
    const developersRel = await CanonicalDeveloper.group("salary")
      .having("sum(salary) > ?", 10000)
      .select("salary");
    expect(developersRel.length).toBe(3);
    expect(new Set(developersRel.map((d) => (d as { salary: number }).salary)).size).toBe(3);
    expect(developersRel.every((d) => (d as { salary: number }).salary > 10000)).toBeTruthy();
  });

  it("find with entire select statement", async () => {
    const topicsResult = await Topic.findBySql("SELECT * FROM topics WHERE author_name = 'Mary'");

    expect(topicsResult.length).toBe(1);
    expect((topicsResult[0] as { title: string }).title).toBe(topics("second").title);

    await assertAsyncEqual(
      topicsResult,
      Topic.asyncFindBySql("SELECT * FROM topics WHERE author_name = 'Mary'"),
    );
  });

  it("find with prepared select statement", async () => {
    const topicsResult = await Topic.findBySql([
      "SELECT * FROM topics WHERE author_name = ?",
      "Mary",
    ]);

    expect(topicsResult.length).toBe(1);
    expect((topicsResult[0] as { title: string }).title).toBe(topics("second").title);
  });

  it("find by sql with sti on joined table", async () => {
    const accountsResult = await Account.findBySql(
      "SELECT * FROM accounts INNER JOIN companies ON companies.id = accounts.firm_id",
    );
    expect(new Set(accountsResult.map((a) => a.constructor))).toEqual(new Set([Account]));
  });

  it("find by association subquery", async () => {
    const firm = companies("first_firm");
    expect(rid((await (firm as any).account) as unknown)).toBe(
      rid(await Account.findBy({ firm: CanonicalFirm.where({ id: rid(firm) }) as never })),
    );
    expect(rid((await (firm as any).account) as unknown)).toBe(
      rid(await Account.findBy({ firm_id: CanonicalFirm.where({ id: rid(firm) }) as never })),
    );
  });

  it("find by and where consistency with active record instance", async () => {
    const firm = companies("first_firm");
    expect(rid(await Account.where({ firm_id: rid(firm) }).take())).toBe(
      rid(await Account.findBy({ firm_id: rid(firm) })),
    );
  });

  it("find by with alias", async () => {
    const account = accounts("last_account");
    expect(rid(await Account.findBy({ available_credit: (account as any).available_credit }))).toBe(
      rid(account),
    );
  });

  it("find one message with custom primary key", async () => {
    class MercedesCar extends Toy {
      static _primaryKey = "name";
    }
    await expect(MercedesCar.find("Hello World!")).rejects.toThrow(RecordNotFound);
    const e = await MercedesCar.find("Hello World!").catch((err: unknown) => err);
    expect((e as Error).message).toBe("Couldn't find MercedesCar with 'name'=Hello World!");
  });

  it("find some message with custom primary key", async () => {
    class MercedesCar extends Toy {
      static _primaryKey = "name";
    }
    await expect(MercedesCar.find("Hello", "World!")).rejects.toThrow(RecordNotFound);
    const e = await MercedesCar.find("Hello", "World!").catch((err: unknown) => err);
    expect((e as Error).message).toBe(
      "Couldn't find all MercedesCars with 'name': (Hello, World!) (found 0 results, but was looking for 2).",
    );
  });

  it("implicit order column is configurable", async () => {
    const oldImplicitOrderColumn = Topic.implicitOrderColumn;
    Topic.implicitOrderColumn = "title";
    try {
      expect(rid(await Topic.first())).toBe(rid(topics("fifth")));
      expect(rid(await Topic.last())).toBe(rid(topics("third")));

      await assertQueriesMatch(
        new RegExp(
          `ORDER BY ${regexpEscape(quoteTableName("topics.title"))} DESC, ${regexpEscape(quoteTableName("topics.id"))} DESC LIMIT`,
          "i",
        ),
        undefined,
        false,
        async () => {
          await Topic.last();
        },
      );
    } finally {
      Topic.implicitOrderColumn = oldImplicitOrderColumn;
    }
  });

  it("implicit order for model without primary key", async () => {
    const oldImplicitOrderColumn = NonPrimaryKey.implicitOrderColumn;
    NonPrimaryKey.implicitOrderColumn = "created_at";
    try {
      await assertQueriesMatch(
        new RegExp(
          `ORDER BY ${regexpEscape(quoteTableName("non_primary_keys.created_at"))} DESC LIMIT`,
          "i",
        ),
        undefined,
        false,
        async () => {
          await NonPrimaryKey.last();
        },
      );
    } finally {
      NonPrimaryKey.implicitOrderColumn = oldImplicitOrderColumn;
    }
  });

  it("implicit order column reorders query constraints", async () => {
    ClothingItem.implicitOrderColumn = "color";
    const quotedType = regexpEscape(quoteTableName("clothing_items.clothing_type"));
    const quotedColor = regexpEscape(quoteTableName("clothing_items.color"));

    try {
      await assertQueriesMatch(
        new RegExp(`ORDER BY ${quotedColor} ASC, ${quotedType} ASC LIMIT`, "i"),
        undefined,
        false,
        async () => {
          expect(await ClothingItem.first()).toBeInstanceOf(ClothingItem);
        },
      );
    } finally {
      ClothingItem.implicitOrderColumn = null as never;
    }
  });

  it("implicit order column prepends query constraints", async () => {
    ClothingItem.implicitOrderColumn = "description";
    const quotedType = regexpEscape(quoteTableName("clothing_items.clothing_type"));
    const quotedColor = regexpEscape(quoteTableName("clothing_items.color"));
    const quotedDescription = regexpEscape(quoteTableName("clothing_items.description"));

    try {
      await assertQueriesMatch(
        new RegExp(
          `ORDER BY ${quotedDescription} ASC, ${quotedType} ASC, ${quotedColor} ASC LIMIT`,
          "i",
        ),
        undefined,
        false,
        async () => {
          expect(await ClothingItem.first()).toBeInstanceOf(ClothingItem);
        },
      );
    } finally {
      ClothingItem.implicitOrderColumn = null as never;
    }
  });

  it("find only some columns", async () => {
    const topic = await Topic.select("author_name").find(1);
    expect(() => (topic as any).title).toThrow(MissingAttributeError);
    expect(() => (topic as any).queryAttribute("title")).toThrow(MissingAttributeError);
    expect((topic as any).readAttribute("title")).toBeNull();
    expect((topic as any).author_name).toBe("David");
    expect((topic as any).attributePresent("title")).toBeFalsy();
    expect((topic as any).attributePresent("title")).toBeFalsy();
    expect((topic as any).attributePresent("author_name")).toBeTruthy();
    assertRespondTo(topic, "author_name");
  });

  it("find on array conditions", async () => {
    expect(await Topic.where(["approved = ?", false]).find(1)).toBeTruthy();
    await expect(Topic.where(["approved = ?", true]).find(1)).rejects.toThrow(RecordNotFound);
  });

  it("find with hash conditions on joined table", async () => {
    const firms = CanonicalFirm.joins(":account").where({ accounts: { credit_limit: 50 } });
    expect((await firms).length).toBe(1);
    expect(rid(await firms.first())).toBe(rid(companies("first_firm")));
  });

  it("find with hash conditions on joined table and with range", async () => {
    const firms = CanonicalDependentFirm.joins(":account").where({
      name: "RailsCore",
      accounts: { credit_limit: new Range(55, 60) },
    });
    expect((await firms).length).toBe(1);
    expect(rid(await firms.first())).toBe(rid(companies("rails_core")));
  });

  it("find on association proxy conditions", async () => {
    const david = authors("david");
    expect(
      (await CanonicalComment.where({ post_id: (david as any).posts }))
        .map(rid)
        .sort((a, b) => a - b),
    ).toEqual([1, 2, 3, 5, 6, 7, 8, 9, 10, 12, 13]);
  });

  it("hash condition find with aggregate having one mapping", async () => {
    const balance = (customers("david") as any).balance as Money;
    expect(balance).toBeInstanceOf(Money);
    const foundCustomer = await Customer.where({ balance }).first();
    expect(rid(foundCustomer)).toBe(rid(customers("david")));
  });

  it("hash condition find with aggregate having three mappings array", async () => {
    const davidAddress = (customers("david") as any).address as Address;
    const zaphodAddress = (customers("zaphod") as any).address as Address;
    const barneyAddress = (customers("barney") as any).address as Address;
    expect(davidAddress).toBeInstanceOf(Address);
    expect(zaphodAddress).toBeInstanceOf(Address);
    const found = await Customer.where({
      address: [davidAddress, zaphodAddress, barneyAddress],
    });
    expect((found as unknown[]).map(rid).sort((a, b) => a - b)).toEqual(
      [customers("david"), customers("zaphod"), customers("barney")].map(rid).sort((a, b) => a - b),
    );
  });

  it("hash condition find with aggregate having one mapping array", async () => {
    const davidBalance = (customers("david") as any).balance as Money;
    const zaphodBalance = (customers("zaphod") as any).balance as Money;
    expect(davidBalance).toBeInstanceOf(Money);
    expect(zaphodBalance).toBeInstanceOf(Money);
    const found = await Customer.where({ balance: [davidBalance, zaphodBalance] });
    expect((found as unknown[]).map(rid).sort((a, b) => a - b)).toEqual(
      [customers("david"), customers("zaphod")].map(rid).sort((a, b) => a - b),
    );
    expect(Customer.where({ balance: [davidBalance.amount, zaphodBalance.amount] }).toSql()).toBe(
      Customer.where({ balance: [davidBalance, zaphodBalance] }).toSql(),
    );
  });

  it("hash condition find with aggregate attribute having same name as field and key value being aggregate", async () => {
    const gpsLocation = (customers("david") as any).gpsLocation as GpsLocation;
    expect(gpsLocation).toBeInstanceOf(GpsLocation);
    const foundCustomer = await Customer.where({ gpsLocation }).first();
    expect(rid(foundCustomer)).toBe(rid(customers("david")));
  });

  it("hash condition find with aggregate having one mapping and key value being attribute value", async () => {
    const balance = (customers("david") as any).balance as Money;
    expect(balance).toBeInstanceOf(Money);
    const foundCustomer = await Customer.where({ balance: balance.amount }).first();
    expect(rid(foundCustomer)).toBe(rid(customers("david")));
  });

  it("hash condition find with aggregate attribute having same name as field and key value being attribute value", async () => {
    const gpsLocation = (customers("david") as any).gpsLocation as GpsLocation;
    expect(gpsLocation).toBeInstanceOf(GpsLocation);
    const foundCustomer = await Customer.where({ gpsLocation: gpsLocation.gpsLocation }).first();
    expect(rid(foundCustomer)).toBe(rid(customers("david")));
  });

  it("hash condition find with aggregate having three mappings", async () => {
    const address = (customers("david") as any).address as Address;
    expect(address).toBeInstanceOf(Address);
    const customersRel = Customer.where({ address }).order("id");
    expect((await customersRel).map(rid)).toEqual([rid(customers("david"))]);
    expect(
      (await customersRel.unscope({ where: ["address_city", "address_country"] })).map(rid),
    ).toEqual([customers("david"), customers("mary")].map(rid));
  });

  it("hash condition find with one condition being aggregate and another not", async () => {
    const address = (customers("david") as any).address as Address;
    expect(address).toBeInstanceOf(Address);
    const foundCustomer = await Customer.where({
      address,
      name: (customers("david") as any).name,
    }).first();
    expect(rid(foundCustomer)).toBe(rid(customers("david")));
  });

  it("hash condition find nil with aggregate having one mapping", async () => {
    expect((customers("zaphod") as any).gpsLocation).toBeNull();
    const foundCustomer = await Customer.where({
      gpsLocation: null,
      name: (customers("zaphod") as any).name,
    }).first();
    expect(rid(foundCustomer)).toBe(rid(customers("zaphod")));
  });

  it("hash condition find nil with aggregate having multiple mappings", async () => {
    await (customers("david") as any).update({ address: null });
    expect((customers("david") as any).address_street).toBeNull();
    expect((customers("david") as any).address_city).toBeNull();
    const foundCustomer = await Customer.where({
      address: null,
      name: (customers("david") as any).name,
    }).first();
    expect(rid(foundCustomer)).toBe(rid(customers("david")));
  });

  it("hash condition find empty array with aggregate having multiple mappings", async () => {
    expect(await Customer.where({ address: [] }).first()).toBeNull();
  });

  it("find by one attribute that is an aggregate", async () => {
    const address = (customers("david") as any).address as Address;
    expect(address).toBeInstanceOf(Address);
    const foundCustomer = await Customer.findBy({ address });
    expect(rid(foundCustomer)).toBe(rid(customers("david")));
  });

  it("find by one attribute that is an aggregate with one attribute difference", async () => {
    const address = (customers("david") as any).address as Address;
    expect(address).toBeInstanceOf(Address);
    let missing = new Address(address.street, address.city, address.country + "1");
    expect(await Customer.findBy({ address: missing })).toBeNull();
    missing = new Address(address.street, address.city + "1", address.country);
    expect(await Customer.findBy({ address: missing })).toBeNull();
    missing = new Address(address.street + "1", address.city, address.country);
    expect(await Customer.findBy({ address: missing })).toBeNull();
  });

  it("find by two attributes that are both aggregates", async () => {
    const balance = (customers("david") as any).balance as Money;
    const address = (customers("david") as any).address as Address;
    expect(balance).toBeInstanceOf(Money);
    expect(address).toBeInstanceOf(Address);
    const foundCustomer = await Customer.findBy({ balance, address });
    expect(rid(foundCustomer)).toBe(rid(customers("david")));
  });

  it("find by two attributes with one being an aggregate", async () => {
    const balance = (customers("david") as any).balance as Money;
    expect(balance).toBeInstanceOf(Money);
    const foundCustomer = await Customer.findBy({
      balance,
      name: (customers("david") as any).name,
    });
    expect(rid(foundCustomer)).toBe(rid(customers("david")));
  });

  it("find by invalid method syntax", async () => {
    expect(() => (Topic as any).failToFindByTitle("The First Topic")).toThrow();
    expect(() => (Topic as any).isFindByTitle("The First Topic")).toThrow();
    expect(() => (Topic as any).failToFindOrCreateByTitle("Nonexistent Title")).toThrow();
    expect(() => (Topic as any).isFindOrCreateByTitle("Nonexistent Title")).toThrow();
  });

  it("with limiting with custom select", async () => {
    const postsResult = (await Post.references(":authors").merge({
      includes: ":author",
      select: 'posts.*, authors.id as "author_id"',
      limit: 3,
      order: "posts.id",
    } as never)) as unknown[];
    expect(postsResult.length).toBe(3);
    expect(postsResult.map((p) => (p as { author_id: number | null }).author_id)).toEqual([
      1,
      1,
      null,
    ]);
  });

  it("eager load for no has many with limit and joins for has many", async () => {
    const relation = Post.eagerLoad(":author").joins({ ":comments": ":post" });
    expect((await relation).length).toBe(5);
    expect((await relation.limit(5)).length).toBe(5);
  });

  it("eager load for no has many with limit and left joins for has many", async () => {
    const relation = Post.eagerLoad(":author").leftJoins({ ":comments": ":post" });
    expect((await relation).length).toBe(11);
    expect((await relation.limit(11)).length).toBe(11);
  });

  it("find with order on included associations with construct finder sql for association limiting and is distinct", async () => {
    expect(
      (
        await Post.includes({ ":authors": ":authorAddress" })
          .where()
          .not({ author_addresses: { id: null } })
          .order("author_addresses.id DESC")
          .limit(2)
      ).length,
    ).toBe(2);

    expect(
      (
        await Post.includes({ ":author": ":authorAddress", ":authors": ":authorAddress" })
          .where()
          .not({ author_addresses_authors: { id: null } })
          .order("author_addresses_authors.id DESC")
          .limit(3)
      ).length,
    ).toBe(3);
  });

  it("find with eager loading collection and ordering by collection primary key", async () => {
    expect(rid(await Post.first())).toBe(
      rid(
        await Post.eagerLoad({ ":comments": ":ratings" })
          .order("posts.id, ratings.id, comments.id")
          .first(),
      ),
    );
  });

  it("#skip_query_cache! for #exists?", async () => {
    await Topic.cache(async () => {
      await assertQueriesCount(1, false, async () => {
        await Topic.exists();
        await Topic.exists();
      });

      await assertQueriesCount(2, false, async () => {
        await Topic.all().skipQueryCacheBang().exists();
        await Topic.all().skipQueryCacheBang().exists();
      });
    });
  });

  it("#skip_query_cache! for #exists? with a limited eager load", async () => {
    await Topic.cache(async () => {
      await assertQueriesCount(1, false, async () => {
        await Topic.eagerLoad(":replies").limit(1).exists();
        await Topic.eagerLoad(":replies").limit(1).exists();
      });

      await assertQueriesCount(2, false, async () => {
        await Topic.eagerLoad(":replies").limit(1).skipQueryCacheBang().exists();
        await Topic.eagerLoad(":replies").limit(1).skipQueryCacheBang().exists();
      });
    });
  });

  it("#last for a model with composite query constraints", async () => {
    const quotedType = regexpEscape(quoteTableName("clothing_items.clothing_type"));
    const quotedColor = regexpEscape(quoteTableName("clothing_items.color"));

    await assertQueriesMatch(
      new RegExp(`ORDER BY ${quotedType} DESC, ${quotedColor} DESC LIMIT`, "i"),
      undefined,
      false,
      async () => {
        expect(await ClothingItem.last()).toBeInstanceOf(ClothingItem);
      },
    );
  });

  it("#first for a model with composite query constraints", async () => {
    const quotedType = regexpEscape(quoteTableName("clothing_items.clothing_type"));
    const quotedColor = regexpEscape(quoteTableName("clothing_items.color"));

    await assertQueriesMatch(
      new RegExp(`ORDER BY ${quotedType} ASC, ${quotedColor} ASC LIMIT`, "i"),
      undefined,
      false,
      async () => {
        expect(await ClothingItem.first()).toBeInstanceOf(ClothingItem);
      },
    );
  });

  it("#find_by with composite primary key", async () => {
    const book = cpkBooks("cpk_book_with_generated_pk");
    expect(rid(await CpkReview.findBy({ book }))).toBe(rid(cpkReviews("first_book_review")));
  });

  it("#find_by with composite primary key and query caching", async () => {
    const book = cpkBooks("cpk_book_with_generated_pk");

    await CpkReview.cache(async () => {
      await assertQueriesCount(1, false, async () => {
        await CpkReview.findBy({ book });
        await CpkReview.findBy({ book });
      });
    });
  });
});

describe("FinderTest", () => {
  const { posts, topics, accounts, companies, cars, authors } = fixtures([
    "posts",
    "topics",
    "accounts",
    "companies",
    "cars",
    "authors",
  ]);
  registerModel(CanonicalPost);
  registerModel("Topic", CanonicalTopic);
  registerModel(Account);
  registerModel(CanonicalCompany);
  registerModel(Client);
  registerModel(CanonicalAuthor);
  registerModel(CanonicalCar);
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
    expect(rid(await (await Post.findBy({ author: authors("david") }))!.author)).toBe(
      rid(authors("david")),
    );
    expect(rid(await (await Post.findBy({ author: authors("mary") }))!.author)).toBe(
      rid(authors("mary")),
    );
  });

  it("first have determined order by default", async () => {
    const expected = [companies("second_client"), companies("another_client")];
    const clients = Client.where({ name: expected.map((c) => (c as { name: string }).name) });

    expect((await clients.first(2)).map(rid)).toEqual(expected.map(rid));
    expect((await clients.limit(5).first(2)).map(rid)).toEqual(expected.map(rid));
    expect((await clients.order(null).first(2)).map(rid)).toEqual(expected.map(rid));
  });

  it("find without primary key", async () => {
    await expect(Matey.find(1)).rejects.toThrow(UnknownPrimaryKey);
  });

  it("finder with offset string", async () => {
    await expect(CanonicalTopic.offset("3" as unknown as number)).resolves.not.toThrow();
  });

  it("find on a scope does not perform statement caching", async () => {
    const honda = cars("honda");
    const zyke = cars("zyke");
    const tyre = await (honda as any).tyres.createBang();
    const tyre2 = await (zyke as any).tyres.createBang();

    expect(rid(await (honda as any).tyres.customFind(rid(tyre)))).toBe(rid(tyre));
    expect(rid(await (zyke as any).tyres.customFind(rid(tyre2)))).toBe(rid(tyre2));
  });

  it("find_by on a scope does not perform statement caching", async () => {
    const honda = cars("honda");
    const zyke = cars("zyke");
    const tyre = await (honda as any).tyres.createBang();
    const tyre2 = await (zyke as any).tyres.createBang();

    expect(rid(await (honda as any).tyres.customFindBy({ id: rid(tyre) }))).toBe(rid(tyre));
    expect(rid(await (zyke as any).tyres.customFindBy({ id: rid(tyre2) }))).toBe(rid(tyre2));
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
    await expect(Post.findByBang("1 = 0")).rejects.toThrow(RecordNotFound);
    const error = await Post.findByBang("1 = 0").catch((e: unknown) => e);
    expect((error as Error).message).toBe("Couldn't find Post with [WHERE (1 = 0)]");
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
    const blankTopic = await CanonicalBlankTopic.create({ title: "The Blank One" });
    expect(rid(await CanonicalBlankTopic.findByBang({ title: "The Blank One" }))).toBe(
      rid(blankTopic),
    );
  });

  it("select rows", async () => {
    const conn = await CanonicalCompany.leaseConnection();
    const stringify = (rows: unknown[][]) =>
      rows.map((row) => row.map((v) => (v == null ? v : String(v))));

    expect(
      stringify(
        await conn.selectRows(
          "SELECT id, firm_id, client_of, name FROM companies WHERE id IN (1,2,3) ORDER BY id",
        ),
      ),
    ).toEqual([
      ["1", "1", null, "37signals"],
      ["2", "1", "2", "Summit"],
      ["3", "1", "1", "Microsoft"],
    ]);
    expect(
      stringify(
        await conn.selectRows("SELECT id, name FROM companies WHERE id IN (1,2,3) ORDER BY id"),
      ),
    ).toEqual([
      ["1", "37signals"],
      ["2", "Summit"],
      ["3", "Microsoft"],
    ]);
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
  const { posts } = fixtures(["posts"]);
  registerModel(CanonicalPost);
  const rid = (r: unknown) => (r as { id: number }).id;

  it("find_by with non-hash conditions returns the first matching record", async () => {
    expect(rid(await CanonicalPost.findBy(`id = ${rid(posts("eager_other"))}` as never))).toBe(
      rid(posts("eager_other")),
    );
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
    expect(await Topic.where({ approved: false }).find(1)).toBeTruthy();
    await expect(Topic.where({ approved: true }).find(1)).rejects.toThrow(RecordNotFound);
  });

  it("find on hash conditions with qualified attribute dot notation string", async () => {
    expect(await Topic.where({ "topics.approved": false }).find(1)).toBeTruthy();
    await expect(Topic.where({ "topics.approved": true }).find(1)).rejects.toThrow(RecordNotFound);
  });

  it("find on hash conditions with qualified attribute dot notation symbol", async () => {
    expect(await Topic.where({ "topics.approved": false }).find(1)).toBeTruthy();
    await expect(Topic.where({ "topics.approved": true }).find(1)).rejects.toThrow(RecordNotFound);
  });

  it("find on hash conditions with hashed table name", async () => {
    expect(await Topic.where({ topics: { approved: false } }).find(1)).toBeTruthy();
    await expect(Topic.where({ topics: { approved: true } }).find(1)).rejects.toThrow(
      RecordNotFound,
    );
  });

  it("find on combined explicit and hashed table names", async () => {
    expect(
      await Topic.where({ "topics.approved": false, topics: { author_name: "David" } }).find(1),
    ).toBeTruthy();
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
    ).toBeTruthy();
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
    expect(writtenOn).toBeInstanceOf(RubyTime);
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

  it("condition interpolation", async () => {
    expect(await Company.where("name = '%s'", "37signals").first()).toBeInstanceOf(CanonicalFirm);
    expect(await Company.where(["name = '%s'", "37signals!"]).first()).toBeNull();
    expect(await Company.where(["name = '%s'", "37signals!' OR 1=1"]).first()).toBeNull();
    const topic = await Topic.where(["id = %d", 1]).first();
    expect((topic as { written_on: unknown }).written_on).toBeInstanceOf(RubyTime);
  });

  it("condition array interpolation", async () => {
    expect(await Company.where(["name = '%s'", "37signals"]).first()).toBeInstanceOf(CanonicalFirm);
    expect(await Company.where(["name = '%s'", "37signals!"]).first()).toBeNull();
    expect(await Company.where(["name = '%s'", "37signals!' OR 1=1"]).first()).toBeNull();
    const topic = await Topic.where(["id = %d", 1]).first();
    expect((topic as { written_on: unknown }).written_on).toBeInstanceOf(RubyTime);
  });

  it("bind variables", async () => {
    expect(await Company.where(["name = ?", "37signals"]).first()).toBeInstanceOf(CanonicalFirm);
    expect(await Company.where(["name = ?", "37signals!"]).first()).toBeNull();
    expect(await Company.where(["name = ?", "37signals!' OR 1=1"]).first()).toBeNull();
    const topic = await Topic.where(["id = ?", 1]).first();
    expect((topic as { written_on: unknown }).written_on).toBeInstanceOf(RubyTime);
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
    expect((topic as { written_on: unknown }).written_on).toBeInstanceOf(RubyTime);
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
    expect(await Customer.exists(topic.id)).toBeTruthy();

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
      expect(await CpkBook.where({ title: "The first book" }).include(book)).toBeTruthy();
    });
  });

  it("include on loaded relation with composite primary key", async () => {
    const books = await CpkBook.where({ title: "The first book" }).load();
    const greatAuthorBook = cpkBooks("cpk_great_author_first_book");

    await assertNoQueries(false, async () => {
      expect(await books.include(greatAuthorBook)).toBeTruthy();
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
    expect(await Customer.exists(topic.id)).toBeTruthy();

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
      expect(await CpkBook.where({ title: "The first book" }).member(book)).toBeTruthy();
    });
  });

  it("member on loaded relation with composite primary key", async () => {
    const books = await CpkBook.where({ title: "The first book" }).load();
    const greatAuthorBook = cpkBooks("cpk_great_author_first_book");

    await assertNoQueries(false, async () => {
      expect(await books.member(greatAuthorBook)).toBeTruthy();
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

    await expect(Topic.exists([1, 2])).rejects.toThrow(ArgumentError);
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
    await expect(Topic.exists(new Topic())).rejects.toThrow(ArgumentError);
    const error = await Topic.exists(new Topic()).catch((e: unknown) => e);
    expect((error as Error).message).toBe(
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
      expect(await relation.exists()).toBeTruthy();
    });
  });

  it("exists with empty loaded relation", async () => {
    await Topic.deleteAll();
    const relation = await Topic.all().load();
    await assertQueriesMatch(/SELECT 1 AS one/i, 1, false, async () => {
      expect(await relation.exists()).toBeFalsy();
    });
  });

  it("exists with loaded relation having unsaved records", async () => {
    const author = authors("david");
    const posts = await author.posts.load();
    assertNotEmpty(await posts.records());
    for (const post of await posts.records()) await post.destroy();

    await assertQueriesMatch(/SELECT 1 AS one/i, undefined, false, async () => {
      expect(await author.posts.exists()).toBeFalsy();
    });
  });

  it("exists with loaded relation having updated owner record", async () => {
    const author = authors("david");
    assertNotEmpty(await author.posts);

    for (const post of await author.posts) {
      post.author = null;
      await post.saveBang();
    }

    await assertQueriesCount(1, false, async () => {
      expect(await author.posts.exists()).toBeFalsy();
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
    expect(await Post.leftJoins(":comments").distinct().offset(10).exists()).toBeTruthy();
    expect(await Post.leftJoins(":comments").distinct().offset(11).exists()).toBeFalsy();
  });

  it("exists with distinct and offset and select", async () => {
    expect(await Post.select("body").distinct().offset(4).exists()).toBeTruthy();
    expect(await Post.select("body").distinct().offset(5).exists()).toBeFalsy();
  });

  it("exists with distinct and offset and eagerload and order", async () => {
    expect(
      await Post.eagerLoad(":comments")
        .distinct()
        .offset(10)
        .merge(Comment.order({ post_id: "asc" }))
        .exists(),
    ).toBeTruthy();
    expect(
      await Post.eagerLoad(":comments")
        .distinct()
        .offset(11)
        .merge(Comment.order({ post_id: "asc" }))
        .exists(),
    ).toBeFalsy();
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
      expect(await ratings.limit(1).exists()).toBeFalsy();
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
    assertNotCalledFlag(called);
  });
});
