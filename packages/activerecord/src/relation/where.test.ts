/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/relation/where_test.rb
 */
import { describe, it, expect } from "vitest";
import "../index.js";
import { Range } from "../index.js";
import { ForbiddenAttributesError } from "@blazetrails/activemodel";
import { registerModel } from "../associations.js";
import { ProtectedParams } from "../test-helpers/protected-params.js";
import { adapterType } from "../test-adapter.js";
import { seconds } from "@blazetrails/activesupport";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Author, AuthorAddress } from "../test-helpers/models/author.js";
import { Essay } from "../test-helpers/models/essay.js";
import { Topic } from "../test-helpers/models/topic.js";
import { Binary } from "../test-helpers/models/binary.js";
import { Edge } from "../test-helpers/models/edge.js";
import { Treasure, HiddenTreasure } from "../test-helpers/models/treasure.js";
import { Car } from "../test-helpers/models/car.js";
import { PriceEstimate } from "../test-helpers/models/price-estimate.js";
import { Chef } from "../test-helpers/models/chef.js";
import { CakeDesigner } from "../test-helpers/models/cake-designer.js";
import { Category } from "../test-helpers/models/category.js";
import { Categorization } from "../test-helpers/models/categorization.js";
import { CpkBook, CpkOrder } from "../test-helpers/models/cpk.js";

registerModel(Post);
registerModel(Comment);
registerModel(Author);
registerModel(AuthorAddress);
registerModel(Essay);
registerModel(Topic);
registerModel(Binary);
registerModel(Edge);
registerModel(Treasure);
registerModel(HiddenTreasure);
registerModel(Car);
registerModel(PriceEstimate);
registerModel(Chef);
registerModel(CakeDesigner);
registerModel(Category);
registerModel(Categorization);
registerModel(CpkBook);
registerModel(CpkOrder);

const ids = (records: unknown[]): unknown[] => records.map((r) => (r as any).id);
const sortedIds = (records: unknown[]): unknown[] => ids(records).slice().sort();

describe("WhereTest", () => {
  const {
    authors,
    authorAddresses,
    posts,
    comments,
    categories,
    treasures,
    cars,
    priceEstimates,
    essays,
    topics,
  } = useHandlerFixtures(
    [
      "authors",
      "authorAddresses",
      "categories",
      "categorizations",
      "cars",
      "treasures",
      "priceEstimates",
      "binaries",
      "edges",
      "vertices",
      "essays",
      "posts",
      "comments",
      "topics",
    ],
    { schema: canonicalSchema },
  );

  it("type casting nested joins", async () => {
    const comment = comments("eager_other_comment1");
    const result = await Comment.joins({ post: "author" }).where({ authors: { id: "2-foo" } });
    expect(ids(result)).toStrictEqual([(comment as any).id]);
  });

  it("where with through association", async () => {
    const r1 = await Author.joins("comments").where({ comments: comments("greetings") });
    expect(ids(r1)).toStrictEqual([(authors("david") as any).id]);

    const r2 = await Author.joins("categories").where({ categories: categories("technology") });
    expect(ids(r2)).toStrictEqual([(authors("bob") as any).id]);
  });

  it("type cast is not evaluated at relation build time", async () => {
    // PARTIAL: Rails wraps each `where` in `assert_not_called_on_instance_of(
    // Type::Value, :cast)` to assert the cast is deferred to query time. There is
    // no TS equivalent of that mock without a spy, so only the result equality is
    // ported — the lazy-cast timing invariant is NOT covered here.
    const welcome = posts("welcome");
    expect(ids(await Post.where({ id: "1-foo" }))).toStrictEqual([(welcome as any).id]);
    expect(ids(await Post.where({ id: ["1-foo", "bar"] }))).toStrictEqual([(welcome as any).id]);
  });

  it("where copies bind params", async () => {
    const author = authors("david") as any;
    const davidPosts = author.posts.where("posts.id != 1");
    const joined = await Post.where({ id: davidPosts });

    expect(joined.length).toBeGreaterThan(0);
    for (const post of joined) {
      const a = await (post as any).loadBelongsTo("author");
      expect(a.id).toBe(author.id);
      expect((post as any).id).not.toBe(1);
    }
  });

  it("where copies bind params in the right order", async () => {
    const author = authors("david") as any;
    const davidPosts = author.posts.whereNot({ id: 1 });
    const first = await davidPosts.first();
    const joined = await Post.where({ id: davidPosts, title: first.title });
    expect(ids(joined)).toStrictEqual([first.id]);
  });

  it("where copies arel bind params", async () => {
    const chef = await Chef.create({});
    await CakeDesigner.create({ chef });

    const cakeDesigners = CakeDesigner.joins("chef").where({ chefs: { id: (chef as any).id } });
    const chefs = await Chef.where({ employable: cakeDesigners });

    expect(ids(chefs)).toStrictEqual([(chef as any).id]);
  });

  it.skip("where with invalid value", async () => {
    // BLOCKED: predicate-builder — an un-castable query value (non-numeric string
    // for an integer column, "" for date/time) casts to `null` and emits `IS NULL`,
    // so the query matches NULL rows instead of nothing.
    // ROOT-CAUSE: relation/predicate-builder.ts not implementing Rails'
    // QueryAttribute#boundable? contradiction (`1=0`) for un-boundable values.
    // SCOPE: convergence tracked by RFC 0023
    // predicate-builder-blank-and-unboundable-contradiction.
    const first = topics("first") as any;
    await first.update({ parent_id: 0, written_on: null, bonus_time: null, last_read: null });
    expect(await Topic.where({ parent_id: "not-a-number" })).toHaveLength(0);
    expect(await Topic.where({ written_on: "" })).toHaveLength(0);
    expect(await Topic.where({ bonus_time: "" })).toHaveLength(0);
    expect(await Topic.where({ last_read: "" })).toHaveLength(0);
  });

  it("rewhere on root", async () => {
    const welcome = posts("welcome");
    const result = await Post.rewhere({ title: "Welcome to the weblog" }).first();
    expect((result as any).id).toBe((welcome as any).id);
  });

  it("where with tuple syntax", async () => {
    const first = topics("first") as any;
    const third = topics("third") as any;

    const r1 = await Topic.where(["id"], [[first.id]]);
    expect(ids(r1)).toStrictEqual([first.id]);

    const key = ["title", "author_name"];
    const conditions = [
      [first.title, first.author_name],
      [third.title, third.author_name],
    ];
    const r2 = await Topic.where(key, conditions);
    expect(sortedIds(r2)).toStrictEqual([first.id, third.id].slice().sort());
  });

  it("where with tuple syntax on composite models", async () => {
    const bookOne = await CpkBook.create({ author_id: 1, id: 2 });
    const bookTwo = await CpkBook.create({ author_id: 3, id: 4 });

    const r1 = await CpkBook.where(["author_id", "id"], [[1, 2]]);
    expect(ids(r1)).toStrictEqual([(bookOne as any).id]);

    const r2 = await CpkBook.where(
      ["author_id", "id"],
      [
        [1, 2],
        [3, 4],
      ],
    );
    expect(sortedIds(r2)).toStrictEqual([(bookOne as any).id, (bookTwo as any).id].slice().sort());

    const r3 = await CpkBook.where(
      ["author_id", "id"],
      [
        [1, 4],
        [3, 2],
      ],
    );
    expect(r3).toHaveLength(0);
  });

  it("where with tuple syntax with incorrect arity", () => {
    expect(() => CpkBook.where(["one", "two", "three"], [1, 2, 3] as any)).toThrow();
    expect(() => CpkBook.where(["one", "two"], 1 as any)).toThrow();
  });

  it("where with tuple syntax and regular syntax combined", async () => {
    const bookOne = await CpkBook.create({ author_id: 1, id: 2, title: "The Alchemist" });
    const bookTwo = await CpkBook.create({ author_id: 3, id: 4, title: "The Alchemist" });

    const r1 = await CpkBook.where({ title: "The Alchemist" });
    expect(sortedIds(r1)).toStrictEqual([(bookOne as any).id, (bookTwo as any).id].slice().sort());

    const r2 = await CpkBook.where({ title: "The Alchemist" }).where(
      ["author_id", "id"],
      [
        [1, 2],
        [3, 4],
      ],
    );
    expect(sortedIds(r2)).toStrictEqual([(bookOne as any).id, (bookTwo as any).id].slice().sort());

    const r3 = await CpkBook.where({ title: "The Alchemist" }).where(["author_id", "id"], [[3, 4]]);
    expect(ids(r3)).toStrictEqual([(bookTwo as any).id]);
  });

  it.skipIf(adapterType === "sqlite")("with tuple syntax and large values list", () => {
    const tupleIds: [number, number][] = [];
    for (let i = 0; i < 1500; i++) tupleIds.push([1, 2]);
    expect(() => CpkBook.where(["author_id", "id"], tupleIds).toSql()).not.toThrow();
  });

  it("where with nil cpk association", async () => {
    const order = await CpkOrder.create({ shop_id: 1, id: 2 });
    // Rails: order.books.create!(id: [3, 4]) — composite Book PK [author_id, id]
    // plus the order FK [shop_id, order_id] inherited from the order.
    const book = await CpkBook.create({
      author_id: 3,
      id: 4,
      shop_id: (order as any).readAttribute("shop_id"),
      order_id: (order as any).readAttribute("id"),
    });
    const hasBook = (recs: unknown[]): boolean =>
      recs.some(
        (r) => (r as any).readAttribute("author_id") === 3 && (r as any).readAttribute("id") === 4,
      );

    const found = await CpkBook.where({ order });
    expect(hasBook(found)).toBe(true);

    await book.update({ shop_id: null, order_id: null });
    const foundNil = await CpkBook.where({ order: null });
    expect(hasBook(foundNil)).toBe(true);
  });

  it("belongs to shallow where", () => {
    const author = new Author();
    (author as any).id = 1;
    expect(Post.where({ author_id: 1 }).toSql()).toEqual(Post.where({ author }).toSql());
  });

  it("belongs to nil where", () => {
    expect(Post.where({ author_id: null }).toSql()).toEqual(Post.where({ author: null }).toSql());
  });

  it("belongs to array value where", () => {
    expect(Post.where({ author_id: [1, 2] }).toSql()).toEqual(
      Post.where({ author: [1, 2] }).toSql(),
    );
  });

  it("belongs to nested relation where", () => {
    const expected = Post.where({ author_id: Author.where({ id: [1, 2] }) }).toSql();
    const actual = Post.where({ author: Author.where({ id: [1, 2] }) }).toSql();
    expect(actual).toEqual(expected);
  });

  it("belongs to nested where", () => {
    const parent = new Comment();
    (parent as any).id = 1;
    const expected = Post.where({ comments: { parent_id: 1 } }).joins("comments");
    const actual = Post.where({ comments: { parent } }).joins("comments");
    expect(actual.toSql()).toEqual(expected.toSql());
  });

  it("belongs to nested where with relation", async () => {
    const author = authors("david") as any;
    const expected = await Author.where({ id: author }).joins("posts");
    const actual = await Author.where({
      posts: { author_id: Author.where({ id: author.id }) },
    }).joins("posts");
    expect(sortedIds(actual)).toStrictEqual(sortedIds(expected));
  });

  it("polymorphic shallow where", () => {
    const treasure = new Treasure();
    (treasure as any).id = 1;
    const expected = PriceEstimate.where({ estimate_of_type: "Treasure", estimate_of_id: 1 });
    const actual = PriceEstimate.where({ estimateOf: treasure });
    expect(actual.toSql()).toEqual(expected.toSql());
  });

  it("where not polymorphic association", async () => {
    const sapphire = treasures("sapphire") as any;
    const actual = await PriceEstimate.whereNot({ estimateOf: sapphire });
    const only = await PriceEstimate.where({ estimateOf: sapphire });

    const sapphireEstimateIds = [
      (priceEstimates("sapphire_1") as any).id,
      (priceEstimates("sapphire_2") as any).id,
    ];
    const allIds = [
      (priceEstimates("diamond") as any).id,
      (priceEstimates("honda") as any).id,
      ...sapphireEstimateIds,
    ];
    const expected = allIds.filter((id) => !sapphireEstimateIds.includes(id));
    expect(sortedIds(actual)).toStrictEqual(expected.slice().sort());
    expect(sortedIds(only)).toStrictEqual(sapphireEstimateIds.slice().sort());
  });

  it("where not polymorphic id and type as nand", async () => {
    const sapphire = treasures("sapphire") as any;
    const actual = await PriceEstimate.whereNot({
      estimate_of_type: "Treasure",
      estimate_of_id: sapphire.id,
    });
    const only = await PriceEstimate.where({
      estimate_of_type: "Treasure",
      estimate_of_id: sapphire.id,
    });

    const sapphireEstimateIds = [
      (priceEstimates("sapphire_1") as any).id,
      (priceEstimates("sapphire_2") as any).id,
    ];
    const allIds = [
      (priceEstimates("diamond") as any).id,
      (priceEstimates("honda") as any).id,
      ...sapphireEstimateIds,
    ];
    const expected = allIds.filter((id) => !sapphireEstimateIds.includes(id));
    expect(sortedIds(actual)).toStrictEqual(expected.slice().sort());
    expect(sortedIds(only)).toStrictEqual(sapphireEstimateIds.slice().sort());
  });

  it("where not association as nand", async () => {
    const treasure = await Treasure.create({ name: "my_treasure" });
    await PriceEstimate.create({ estimateOf: treasure, price: 2, currency: "USD" });

    const actual = await Treasure.joins("priceEstimates").whereNot({
      price_estimates: { price: 2, currency: "USD" },
    });
    const expected = [
      (treasures("diamond") as any).id,
      (treasures("sapphire") as any).id,
      (treasures("sapphire") as any).id,
    ];
    expect(sortedIds(actual)).toStrictEqual(expected.slice().sort());
  });

  it("polymorphic nested array where", () => {
    const treasure = new Treasure();
    (treasure as any).id = 1;
    const hidden = new HiddenTreasure();
    (hidden as any).id = 2;

    const expected = PriceEstimate.where({
      estimate_of_type: "Treasure",
      estimate_of_id: [treasure, hidden],
    });
    const actual = PriceEstimate.where({ estimateOf: [treasure, hidden] });
    expect(actual.toSql()).toEqual(expected.toSql());
  });

  it("polymorphic nested array where not", async () => {
    const treasure = treasures("diamond") as any;
    const car = cars("honda") as any;
    const actual = await PriceEstimate.whereNot({ estimateOf: [treasure, car] });
    const expected = [
      (priceEstimates("sapphire_1") as any).id,
      (priceEstimates("sapphire_2") as any).id,
    ];
    expect(sortedIds(actual)).toStrictEqual(expected.slice().sort());
  });

  it("polymorphic array where multiple types", async () => {
    const treasure1 = treasures("diamond") as any;
    const treasure2 = treasures("sapphire") as any;
    const car = cars("honda") as any;

    const expected = [
      (priceEstimates("diamond") as any).id,
      (priceEstimates("sapphire_1") as any).id,
      (priceEstimates("sapphire_2") as any).id,
      (priceEstimates("honda") as any).id,
    ];
    const actual = await PriceEstimate.where({ estimateOf: [treasure1, treasure2, car] });
    expect(sortedIds(actual)).toStrictEqual(expected.slice().sort());
  });

  it("polymorphic nested relation where", () => {
    const expected = PriceEstimate.where({
      estimate_of_type: "Treasure",
      estimate_of_id: Treasure.where({ id: [1, 2] }),
    });
    const actual = PriceEstimate.where({ estimateOf: Treasure.where({ id: [1, 2] }) });
    expect(actual.toSql()).toEqual(expected.toSql());
  });

  it("polymorphic sti shallow where", () => {
    const treasure = new HiddenTreasure();
    (treasure as any).id = 1;
    const expected = PriceEstimate.where({ estimate_of_type: "Treasure", estimate_of_id: 1 });
    const actual = PriceEstimate.where({ estimateOf: treasure });
    expect(actual.toSql()).toEqual(expected.toSql());
  });

  it("polymorphic nested where", () => {
    const thing = new Post();
    (thing as any).id = 1;
    const expected = Treasure.where({
      priceEstimates: { thing_type: "Post", thing_id: 1 },
    }).joins("priceEstimates");
    const actual = Treasure.where({ priceEstimates: { thing } }).joins("priceEstimates");
    expect(actual.toSql()).toEqual(expected.toSql());
  });

  it("polymorphic sti nested where", () => {
    const treasure = new HiddenTreasure();
    (treasure as any).id = 1;
    const expected = Treasure.where({
      priceEstimates: { estimate_of_type: "Treasure", estimate_of_id: 1 },
    }).joins("priceEstimates");
    const actual = Treasure.where({ priceEstimates: { estimateOf: treasure } }).joins(
      "priceEstimates",
    );
    expect(actual.toSql()).toEqual(expected.toSql());
  });

  it("decorated polymorphic where", () => {
    const treasure = new Treasure();
    (treasure as any).id = 1;
    // Rails decorates with a Struct that delegates class/id via method_missing.
    // The JS analog is a prototype-delegating wrapper so polymorphic_name/id
    // resolve through to the wrapped record.
    const decoratedTreasure = Object.create(treasure);
    const expected = PriceEstimate.where({ estimate_of_type: "Treasure", estimate_of_id: 1 });
    const actual = PriceEstimate.where({ estimateOf: decoratedTreasure });
    expect(actual.toSql()).toEqual(expected.toSql());
  });

  it("aliased attribute", () => {
    const expected = Topic.where({ heading: "The First Topic" });
    const actual = Topic.where({ title: "The First Topic" });
    expect(actual.toSql()).toEqual(expected.toSql());
  });

  it("where error", async () => {
    let raised = false;
    try {
      await Post.where({ id: { "posts.author_id": 10 } }).first();
    } catch {
      raised = true;
    }
    expect(raised).toBe(false);
  });

  it("where with table name", async () => {
    const post = await Post.first();
    const found = await Post.where({ posts: { id: (post as any).id } }).first();
    expect((found as any).id).toBe((post as any).id);
  });

  it.skip("where with table name and empty hash", async () => {
    // BLOCKED: predicate-builder — `where(posts: {})` should match nothing.
    // ROOT-CAUSE: relation/predicate-builder.ts buildFromHashInternal expands an
    // empty nested hash to zero predicate nodes (condition dropped → all rows),
    // vs Rails expand_from_hash returning `["1=0"]` (predicate_builder.rb:85).
    // SCOPE: convergence tracked by RFC 0023
    // predicate-builder-blank-and-unboundable-contradiction.
    expect(await Post.where({ posts: {} }).count()).toBe(0);
  });

  it("where with table name and empty array", async () => {
    expect(await Post.where({ id: [] }).count()).toBe(0);
  });

  it.skip("where with empty hash and no foreign key", async () => {
    // BLOCKED: predicate-builder — `where(sink: {})` should match nothing.
    // ROOT-CAUSE: same empty-nested-hash gap as "where with table name and empty
    // hash"; relation/predicate-builder.ts drops the empty hash instead of
    // emitting Rails' `["1=0"]`.
    // SCOPE: convergence tracked by RFC 0023
    // predicate-builder-blank-and-unboundable-contradiction.
    expect(await Edge.where({ sink: {} }).count()).toBe(0);
  });

  it.skip("where with blank conditions", async () => {
    // BLOCKED: predicate-builder — an empty array `[]` should be a blank condition
    // (all rows), like `{}`/`null`/`""` (which already behave Rails-faithfully).
    // ROOT-CAUSE: relation/query-methods.ts routes `where([])` into the
    // composite-key tuple form and raises ArgumentError instead of treating it
    // as blank.
    // SCOPE: convergence tracked by RFC 0023
    // predicate-builder-blank-and-unboundable-contradiction.
    for (const blank of [[], {}, null, ""]) {
      const result = await Edge.where(blank as any).order("sink_id");
      expect(result).toHaveLength(4);
    }
  });

  it("where with integer for string column", async () => {
    expect(await Post.where({ title: 0 }).count()).toBe(0);
  });

  it("where with float for string column", async () => {
    expect(await Post.where({ title: 0.0 }).count()).toBe(0);
  });

  it("where with boolean for string column", async () => {
    expect(await Post.where({ title: false }).count()).toBe(0);
  });

  it("where with decimal for string column", async () => {
    // SUBSTITUTION: Rails uses `BigDecimal(0)`; JS has no built-in BigDecimal, so
    // the numeric literal `0` stands in. The cast-to-string behaviour under test
    // (a numeric query value never matches a string column) is identical for
    // either, unlike the Rational case which has no JS analog at all (skipped).
    expect(await Post.where({ title: 0 }).count()).toBe(0);
  });

  it.skip("where with rational for string column", () => {
    // PERMANENTLY BLOCKED: Ruby Rational has no JavaScript equivalent.
    // Rails: Post.where(title: Rational(0)).count == 0 (Rational cast to "0/1").
  });

  it("where with duration for string column", async () => {
    expect(await Post.where({ title: seconds(0) }).count()).toBe(0);
  });

  it("where with integer for binary column", async () => {
    expect(await Binary.where({ data: 0 }).count()).toBe(0);
  });

  it("where with emoji for binary column", async () => {
    await Binary.create({ data: "🥦" });
    const sql = Binary.where({ data: ["🥦", "🍦"] }).toSql();
    expect(sql).toContain("f09fa5a6");
    expect(sql).toContain("f09f8da6");
  });

  it("where on association with custom primary key", async () => {
    const author = authors("david") as any;
    const essay = await Essay.where({ writer: author }).first();
    expect((essay as any).id).toBe((essays("david_modest_proposal") as any).id);
  });

  it("where on association with custom primary key with relation", async () => {
    const author = authors("david") as any;
    const essay = await Essay.where({ writer: Author.where({ id: author.id }) }).first();
    expect((essay as any).id).toBe((essays("david_modest_proposal") as any).id);
  });

  it("where on association with relation performs subselect not two queries", async () => {
    const author = authors("david") as any;
    const sql = Essay.where({ writer: Author.where({ id: author.id }) }).toSql();
    expect(sql).toContain("IN");
    expect(sql).toContain("SELECT");
    const result = await Essay.where({ writer: Author.where({ id: author.id }) });
    expect(result.length).toBeGreaterThan(0);
  });

  it("where on association with custom primary key with array of base", async () => {
    const author = authors("david") as any;
    const essay = await Essay.where({ writer: [author] }).first();
    expect((essay as any).id).toBe((essays("david_modest_proposal") as any).id);
  });

  it("where on association with custom primary key with array of ids", async () => {
    const essay = await Essay.where({ writer: ["David"] }).first();
    expect((essay as any).id).toBe((essays("david_modest_proposal") as any).id);
  });

  it("where with relation on has many association", async () => {
    const essay = essays("david_modest_proposal") as any;
    const author = await Author.where({ essays: Essay.where({ id: essay.id }) }).first();
    expect((author as any).id).toBe((authors("david") as any).id);
  });

  it("where with relation on has one association", async () => {
    const author = authors("david") as any;
    const authorAddress = await AuthorAddress.where({
      author: Author.where({ id: author.id }),
    }).first();
    // Rails: assert_equal author_addresses(:david_address), author_address.
    // Coerce ids — MariaDB/PG return bigint PKs as BigInt, sqlite as number.
    expect(Number((authorAddress as any).id)).toBe(
      Number((authorAddresses("david_address") as any).id),
    );
  });

  it("where on association with select relation", async () => {
    const essay = await Essay.where({
      author: Author.where({ name: "David" }).select("name"),
    }).take();
    expect((essay as any).id).toBe((essays("david_modest_proposal") as any).id);
  });

  it("where on association with collection polymorphic relation", async () => {
    const result = await Treasure.where({
      name: ["diamond", "emerald"],
      priceEstimates: PriceEstimate.all(),
    });
    expect(ids(result)).toStrictEqual([(treasures("diamond") as any).id]);
  });

  it("where with strong parameters", async () => {
    const author = authors("david") as any;
    const params = new ProtectedParams({ name: author.name });
    expect(() => Author.where(params as any)).toThrow(ForbiddenAttributesError);
    const found = await Author.where(params.permit() as any).first();
    expect((found as any).id).toBe(author.id);
  });

  it.skip("where with large number", async () => {
    // BLOCKED: predicate-builder — Rails treats `9223372036854775808` (2^63, one
    // past signed-bigint max) as an un-boundable query value, so `where(id: [3,
    // 2^63])` matches only id 3 → [bob]. trails' MysqlBigInteger/PG integer type
    // raises ActiveModelRangeError when casting the out-of-range query bind
    // (passes on sqlite, which has no range enforcement, hence the adapter split).
    // ROOT-CAUSE: same un-boundable-query-value gap as "where with invalid value"
    // — relation/predicate-builder.ts should bind a contradiction, not raise.
    // SCOPE: convergence tracked by RFC 0023
    // predicate-builder-blank-and-unboundable-contradiction.
    const bob = authors("bob") as any;
    const r1 = await Author.where({ id: [3, 9223372036854775808n] });
    expect(ids(r1)).toStrictEqual([bob.id]);
    const r2 = await Author.where({ id: new Range(3, 9223372036854775808n) });
    expect(ids(r2)).toStrictEqual([bob.id]);
  });

  it.skip("to sql with large number", async () => {
    // BLOCKED: same out-of-range / un-boundable query-value gap as "where with
    // large number" — `9223372036854775808` raises on MariaDB/PG instead of
    // binding a contradiction.
    // SCOPE: convergence tracked by RFC 0023
    // predicate-builder-blank-and-unboundable-contradiction.
    const bob = authors("bob") as any;
    const sql1 = Author.where({ id: [3, 9223372036854775808n] }).toSql();
    expect(ids(await Author.findBySql(sql1))).toStrictEqual([bob.id]);
    const sql2 = Author.where({ id: new Range(3, 9223372036854775808n) }).toSql();
    expect(ids(await Author.findBySql(sql2))).toStrictEqual([bob.id]);
  });

  it("where with unsupported arguments", () => {
    expect(() => Author.where(42 as any)).toThrow();
  });

  it("invert where", async () => {
    const author = authors("david") as any;
    const davidPosts = author.posts.whereNot({ id: 1 });
    const result = await davidPosts.invertWhere().first();
    expect(Number(result.id)).toBe(1);
  });

  it("nested conditional on enum", async () => {
    const post = await Post.first();
    await Comment.create({ label: "default", post, body: "Nice weather today" });
    const result = await Post.joins("comments").where({
      comments: { label: "default", body: "Nice weather today" },
    });
    expect(ids(result)).toStrictEqual([(post as any).id]);
  });
});
