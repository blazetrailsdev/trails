import { kernelThrow } from "@blazetrails/ruby-compat";
import type { AssociationProxy } from "./collection-proxy.js";
import type { Category } from "../test-helpers/models/category.js";
import { Notifications, type NotificationEvent } from "@blazetrails/activesupport";
import { describe, it, expect } from "vitest";
import {
  SubclassNotFound,
  Base,
  ReadOnlyRecord,
  RecordInvalid,
  registerModel,
  AssociationTypeMismatch,
  modelRegistry,
} from "../index.js";
import {
  assertNoQueries,
  assertQueriesCount,
  assertQueriesMatch,
} from "../testing/query-assertions.js";
import { currentAdapter } from "../support/adapter-helper.js";
import { Treasure } from "../test-helpers/models/treasure.js";
import { captureSql, captureSqlAndBinds } from "../testing/sql-capture.js";
import { MissingAttributeError } from "@blazetrails/activemodel";
import { fixtures } from "../test-fixtures.js";
import { Author, AuthorAddress } from "../test-helpers/models/author.js";
import { Essay } from "../test-helpers/models/essay.js";
import { Account } from "../test-helpers/models/account.js";
import { Client, Firm, Company } from "../test-helpers/models/company.js";
import { Topic, WebTopic } from "../test-helpers/models/topic.js";
import {
  Reply,
  SillyReply,
  UniqueReply,
  SillyUniqueReply,
  WebReply,
} from "../test-helpers/models/reply.js";
import { Car } from "../test-helpers/models/car.js";
import { Wheel } from "../test-helpers/models/wheel.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment, CommentWithAfterCreateUpdate } from "../test-helpers/models/comment.js";
import { Tag } from "../test-helpers/models/tag.js";
import { Tagging } from "../test-helpers/models/tagging.js";
import { Sponsor } from "../test-helpers/models/sponsor.js";
import { Member } from "../test-helpers/models/member.js";
import { Computer } from "../test-helpers/models/computer.js";
import { Developer } from "../test-helpers/models/developer.js";
import { Ship } from "../test-helpers/models/ship.js";
import { Node } from "../test-helpers/models/node.js";
import { Tree } from "../test-helpers/models/tree.js";
import { Book } from "../test-helpers/models/book.js";
import { Citation } from "../test-helpers/models/citation.js";
import { Record } from "../test-helpers/models/record.js";
import { Column } from "../test-helpers/models/column.js";
import { Toy } from "../test-helpers/models/toy.js";
import { Invoice } from "../test-helpers/models/invoice.js";
import { Project } from "../test-helpers/models/project.js";
import { AdminUser } from "../test-helpers/models/admin/user.js";
import { AdminAccount } from "../test-helpers/models/admin/account.js";
import { LineItem } from "../test-helpers/models/line-item.js";
import {
  CpkAuthor,
  CpkBook,
  CpkBrokenBook,
  CpkBrokenBookWithNonCpkOrder,
  CpkComment,
  CpkNonCpkBook,
  CpkNonCpkOrder,
  CpkOrder,
  CpkOrderWithSpecialPrimaryKey,
  CpkPost,
} from "../test-helpers/models/cpk.js";
import { CompositePrimaryKeyMismatchError } from "./errors.js";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import {
  travelTo,
  travelBack,
  assert,
  assertNot,
  assertPredicate,
  assertNotPredicate,
  assertRaises,
  assertNothingRaised,
  assertSame,
  assertDifference,
  assertNoDifference,
  assertEmpty,
} from "@blazetrails/activesupport";

import { ArgumentError } from "@blazetrails/activemodel";
import {
  belongsToRequiredValidatesForeignKey,
  setBelongsToRequiredValidatesForeignKey,
} from "../active-record.js";

class CarPolymorphicName extends Base {
  declare wheels: AssociationProxy<Wheel>;

  declare wheels_count: number;
  declare wheels_owned_at: RubyTime | Temporal.PlainDateTime;
  static {
    this.tableName = "cars";
    this.hasMany("wheels", { as: "wheelable" });
  }
  static polymorphicName(): string {
    return "polymorphic_car";
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class WheelPolymorphicName extends Base {
  declare wheelable_id: number;
  declare wheelable_type: string;
  static {
    this.tableName = "wheels";
    this.belongsTo("wheelable", {
      polymorphic: true,
      counterCache: "wheels_count",
      touch: "wheels_owned_at",
    });
  }
  static polymorphicClassFor(name: string): typeof Base {
    if (name !== "polymorphic_car") throw new Error(`Unexpected name: ${name}`);
    return CarPolymorphicName;
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface WheelPolymorphicName {
  get wheelable(): Base | null | Promise<Base | null>;
  set wheelable(value: Base | null);
}

class EssayDestroy extends Base {
  static _tableName = "essays";
  static {
    this.belongsTo("book", { dependent: "destroy", className: "DestroyableBook" });
  }
}

class DestroyableBook extends Base {
  static _tableName = "books";
  static {
    this.belongsTo("author", { className: "UndestroyableAuthor", dependent: "destroy" });
  }
}

class UndestroyableAuthor extends Base {
  static _tableName = "authors";
  static {
    this.hasOne("book", { className: "DestroyableBook", foreignKey: "author_id" });
    this.beforeDestroy(function () {
      kernelThrow(":abort");
    });
  }
}

for (const m of [
  Author,
  AuthorAddress,
  Essay,
  Client,
  Firm,
  Company,
  Account,
  Topic,
  Reply,
  SillyReply,
  UniqueReply,
  SillyUniqueReply,
  WebTopic,
  WebReply,
  Post,
  Comment,
  CommentWithAfterCreateUpdate,
  Tag,
  Tagging,
  Sponsor,
  Member,
  Computer,
  Developer,
  Ship,
  Node,
  Tree,
  Book,
  Citation,
  Record,
  Column,
  Toy,
  Invoice,
  LineItem,
  Car,
  Wheel,
  CarPolymorphicName,
  WheelPolymorphicName,
  CpkAuthor,
  CpkBook,
  CpkBrokenBook,
  CpkBrokenBookWithNonCpkOrder,
  CpkComment,
  CpkNonCpkBook,
  CpkNonCpkOrder,
  CpkOrder,
  CpkOrderWithSpecialPrimaryKey,
  CpkPost,
  Project,
  AdminUser,
  AdminAccount,
  EssayDestroy,
  DestroyableBook,
  UndestroyableAuthor,
]) {
  registerModel(m as any);
}

class AdminRegion extends Base {
  static _tableName = "admin_regions";
  static moduleName = "Admin";
  static _demodulizedName = "Region";
}

class AdminRegionalUser extends AdminUser {
  static moduleName = "Admin";
  static _demodulizedName = "RegionalUser";

  static {
    this.belongsTo("region");
  }
}
registerModel(AdminRegion as any);
registerModel(AdminRegionalUser as any);

async function withHasManyInversing(fn: () => Promise<void>): Promise<void> {
  const prev = (Base as any).hasManyInversing;
  (Base as any).hasManyInversing = true;
  try {
    await fn();
  } finally {
    (Base as any).hasManyInversing = prev;
  }
}

describe("BelongsToWithForeignKeyTest", () => {
  const { authors, authorAddresses } = fixtures(["authors", "authorAddresses"]);

  it("destroy linked models", async () => {
    const address = await AuthorAddress.create({});
    const author = await Author.create({ name: "Author", author_address_id: address.id });

    await author.destroy();

    assertNot(await AuthorAddress.isExists(address.id));
    assertNot(await Author.isExists(author.id));
  });
});

describe("BelongsToAssociationsTest", () => {
  const {
    accounts,
    companies,
    developers,
    topics,
    authors,
    authorAddresses,
    essays,
    posts,
    tags,
    taggings,
    comments,
    sponsors,
    members,
    nodes,
    cpkBooks,
  } = fixtures([
    "accounts",
    "companies",
    "developers",
    "projects",
    "developersProjects",
    "topics",
    "authors",
    "authorAddresses",
    "essays",
    "posts",
    "tags",
    "taggings",
    "comments",
    "sponsors",
    "members",
    "computers",
    "nodes",
    "trees",
    "cpkAuthors",
    "cpkBooks",
    "cpkOrders",
  ]);

  it("belongs to", async () => {
    const client = await Client.find(3);
    const firstFirm = companies("first_firm");
    await assertQueriesMatch(/LIMIT|ROWNUM <=|FETCH FIRST/, undefined, false, async () => {
      expect((await client.firm)!.id).toBe(firstFirm.id);
      expect((await client.firm)!.name).toBe(firstFirm.name);
    });
  });

  it("where with custom primary key", async () => {
    expect(
      (await Author.where({ ownedEssay: essays("david_modest_proposal") })).map((a) => a.id),
    ).toEqual([authors("david").id]);
  });

  it("find by with custom primary key", async () => {
    const david = authors("david");
    const essay = essays("david_modest_proposal");
    const result = await Author.findBy({ ownedEssay: essay });
    expect(result!.id).toBe(david.id);
  });

  it("where on polymorphic association with nil", async () => {
    const greetings = comments("greetings");
    const result = await Comment.where({ author: null }).first();
    expect(result!.id).toBe(greetings.id);
    const result2 = await Comment.where({ author: [null] }).first();
    expect(result2!.id).toBe(greetings.id);
  });

  it("where on polymorphic association with empty array", async () => {
    assertEmpty(await Comment.where({ author: [] }));
  });

  it("where on polymorphic association with cpk", async () => {
    const post = await CpkPost.create({ title: "Welcome", author: "Mary" });
    await (post as any).comments.push(await CpkComment.create({}));
    expect(await CpkComment.where({ commentable: post }).count()).toBe(1);
  });

  it("assigning belongs to on destroyed object", async () => {
    const client = await Client.create({ name: "Client" });
    await client.destroy();
    expect(() => {
      (client as any).firm = null;
    }).toThrow(/frozen/i);
    expect(() => {
      (client as any).firm = Firm.new({ name: "Firm" });
    }).toThrow(/frozen/i);
  });

  it("eager loading wont mutate owner record", async () => {
    const client = await Client.eagerLoad(":firmWithBasicId").first();
    expect((client as any).firm_idCameFromUser).toBeFalsy();

    const client2 = await Client.preload(":firmWithBasicId").first();
    expect((client2 as any).firm_idCameFromUser).toBeFalsy();
  });

  it("missing attribute error is raised when no foreign key attribute", async () => {
    const client = (await Client.select("id").first())!;
    await expect((async () => client.firm)()).rejects.toThrow(MissingAttributeError);
  });

  it("belongs to does not use order by", async () => {
    const sqlLog = await captureSql(async () => {
      const client = await Client.find(3);
      await client.firm;
    });
    assert(
      sqlLog.every((sql) => !/order by/i.test(sql)),
      `ORDER BY was used in the query: ${sqlLog}`,
    );
  });

  it("belongs to with primary key", async () => {
    const firstFirmName = companies("first_firm").name;
    const client = await Client.create({ name: "Primary key client", firm_name: firstFirmName });
    const firm = await client.firmWithPrimaryKey;
    expect(firm!.name).toBe(firstFirmName);
  });

  it("belongs to with primary key joins on correct column", async () => {
    const sql = Client.joins(":firmWithPrimaryKey").toSql();
    if (currentAdapter("Mysql2Adapter", "TrilogyAdapter")) {
      expect(sql).not.toMatch(/`firm_with_primary_keys_companies`\.`id`/);
      expect(sql).toMatch(/`firm_with_primary_keys_companies`\.`name`/);
    } else {
      expect(sql).not.toMatch(/"firm_with_primary_keys_companies"\."id"/);
      expect(sql).toMatch(/"firm_with_primary_keys_companies"\."name"/);
    }
  });

  it("optional relation can be set per model", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class FirstModel extends Base {
      static _tableName = "accounts";
      static {
        this.belongsToRequiredByDefault = false;
        this.belongsTo("company", { inverseOf: false });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface FirstModel {
      get company(): Company | null | Promise<Company | null>;
      set company(value: Company | null);
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class SecondModel extends Base {
      static _tableName = "accounts";
      static {
        this.belongsToRequiredByDefault = true;
        this.belongsTo("company", { inverseOf: false });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface SecondModel {
      get company(): Company | null | Promise<Company | null>;
      set company(value: Company | null);
    }

    const model1 = new FirstModel({});
    const model2 = new SecondModel({});

    assert(await model1.isValid());
    assertNot(await model2.isValid());
  });

  it("optional relation", async () => {
    const prev = (Base as any).belongsToRequiredByDefault;
    (Base as any).belongsToRequiredByDefault = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
      class TempModel extends Base {
        static _tableName = "accounts";
        static {
          this.belongsTo("company", { optional: true, inverseOf: false });
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
      interface TempModel {
        get company(): Company | null | Promise<Company | null>;
        set company(value: Company | null);
      }
      const account = new TempModel({});
      assert(await account.isValid());
    } finally {
      (Base as any).belongsToRequiredByDefault = prev;
    }
  });

  it("not optional relation", async () => {
    const prev = (Base as any).belongsToRequiredByDefault;
    (Base as any).belongsToRequiredByDefault = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
      class TempModel extends Base {
        static _tableName = "accounts";
        static {
          this.belongsTo("company", { optional: false, inverseOf: false });
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
      interface TempModel {
        get company(): Company | null | Promise<Company | null>;
        set company(value: Company | null);
      }
      const account = new TempModel({});
      assertNot(await account.isValid());
      expect((account as any).errors.details.get("company")).toEqual([{ error: ":blank" }]);
    } finally {
      (Base as any).belongsToRequiredByDefault = prev;
    }
  });

  it("required belongs to config", async () => {
    const prev = (Base as any).belongsToRequiredByDefault;
    (Base as any).belongsToRequiredByDefault = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
      class TempModel extends Base {
        static _tableName = "accounts";
        static {
          this.belongsTo("company", { inverseOf: false });
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
      interface TempModel {
        get company(): Company | null | Promise<Company | null>;
        set company(value: Company | null);
      }
      const account = new TempModel({});
      assertNot(await account.isValid());
      expect((account as any).errors.details.get("company")).toEqual([{ error: ":blank" }]);
    } finally {
      (Base as any).belongsToRequiredByDefault = prev;
    }
  });

  it("default", async () => {
    const david = await Developer.find(developers("david").id);
    const jamis = await Developer.find(developers("jamis").id);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class TempDefault extends Base {
      static _tableName = "ships";
      static {
        this.belongsTo("developer", { default: () => david, inverseOf: false });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface TempDefault {
      get developer(): Developer | null | Promise<Developer | null>;
      set developer(value: Developer | null);
    }

    let ship = await TempDefault.create({});
    expect((await ship.developer)!.id).toBe(david.id);

    ship = await TempDefault.create({ developer: jamis });
    expect((await ship.developer)!.id).toBe(jamis.id);

    await ship.update({ developer: null });
    expect((await ship.developer)!.id).toBe(david.id);
  });

  it("default with lambda", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class TempDefault extends Base {
      static _tableName = "ships";
      static {
        this.belongsTo("developer", {
          default: (owner) => (owner as any).defaultDeveloper(),
          inverseOf: false,
        });
      }
      defaultDeveloper(): Promise<any> {
        return Developer.first();
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface TempDefault {
      get developer(): Developer | null | Promise<Developer | null>;
      set developer(value: Developer | null);
    }

    const david = await Developer.find(developers("david").id);
    const jamis = await Developer.find(developers("jamis").id);

    let ship = await TempDefault.create({});
    expect((await ship.developer)!.id).toBe(david.id);

    ship = await TempDefault.create({ developer: jamis });
    expect((await ship.developer)!.id).toBe(jamis.id);
  });

  it("default with required association", async () => {
    const david = await Developer.find(developers("david").id);
    const jamis = await Developer.find(developers("jamis").id);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class TempDefault extends Base {
      static _tableName = "ships";
      static {
        this.belongsTo("developer", {
          default: () => Developer.first(),
          optional: false,
          inverseOf: false,
        });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface TempDefault {
      get developer(): Developer | null | Promise<Developer | null>;
      set developer(value: Developer | null);
    }

    let ship = await TempDefault.create({});
    expect((await ship.developer)!.id).toBe(david.id);

    ship = await TempDefault.create({ developer: jamis });
    expect((await ship.developer)!.id).toBe(jamis.id);
  });

  it("default scope on relations is not cached", async () => {
    let counter = 0;

    let comments: typeof Base | undefined = undefined;
    comments = class extends Base {
      static {
        this.tableName = "comments";
        this.inheritanceColumn = "not_there";

        const posts = class extends Base {
          static {
            this.tableName = "posts";
            this.inheritanceColumn = "not_there";

            this.defaultScope((q: any) => {
              counter += 1;
              return q.where("id = :inc", { inc: counter });
            });

            this.hasMany("comments", { anonymousClass: comments });
          }
        };
        this.belongsTo("post", { anonymousClass: posts, inverseOf: false });
      }
    };

    expect(counter).toBe(0);
    const comment = (await comments.first()) as any;
    expect(counter).toBe(0);
    const queries = await captureSqlAndBinds(async () => {
      await comment.post;
    });
    await comment.reload();
    expect(
      await captureSqlAndBinds(async () => {
        await comment.post;
      }),
    ).not.toEqual(queries);
  });

  it("proxy assignment", async () => {
    const account = await Account.find(1);
    const firm = await account.firm;
    expect(() => {
      (account as any).firm = firm;
    }).not.toThrow();
  });

  it("type mismatch", async () => {
    const account = await Account.find(1);
    expect(() => {
      (account as any).firm = 1;
    }).toThrow(AssociationTypeMismatch);
    const project = await Project.find(1);
    expect(() => {
      (account as any).firm = project;
    }).toThrow(AssociationTypeMismatch);
  });

  it("raises type mismatch with namespaced class", async () => {
    expect(modelRegistry.get("Region")).toBeUndefined();

    const e = await assertRaises([AssociationTypeMismatch], {}, () => {
      new AdminRegionalUser({ region: "wrong value" });
    });
    expect(e.message).toMatch(
      /^Region expected, got "wrong value" which is an instance of String$/,
    );
  });

  it("natural assignment", async () => {
    const apple = await Firm.create({ name: "Apple" });
    const citibank = await Account.create({ credit_limit: 10 });
    (citibank as any).firm = apple;
    expect((citibank as any).firm_id).toBe(Number(apple.id));
  });

  it("id assignment", async () => {
    const apple = await Firm.create({ name: "Apple" });
    const citibank = await Account.create({ credit_limit: 10 });
    (citibank as any).firm_id = apple;
    expect((citibank as any).firm_id).toBeNull();
  });

  it("natural assignment with primary key", async () => {
    const apple = await Firm.create({ name: "Apple" });
    const citibank = await Client.create({ name: "Primary key client" });
    (citibank as any).firmWithPrimaryKey = apple;
    expect((citibank as any).firm_name).toBe(apple.name);
  });

  it("eager loading with primary key", async () => {
    await Firm.create({ name: "Apple" });
    await Client.create({ name: "Citibank", firm_name: "Apple" });
    const result = await Client.where({ name: "Citibank" }).includes(":firmWithPrimaryKey").first();
    assertPredicate(result!.association("firmWithPrimaryKey"), (a) => a.loaded);
  });

  it("eager loading with primary key as symbol", async () => {
    await Firm.create({ name: "Apple" });
    await Client.create({ name: "Citibank", firm_name: "Apple" });
    const result = await Client.where({ name: "Citibank" })
      .includes(":firmWithPrimaryKeySymbols")
      .first();
    assertPredicate(result!.association("firmWithPrimaryKeySymbols"), (a) => a.loaded);
  });

  it("creating the belonging object", async () => {
    const citibank = await Account.create({ credit_limit: 10 });
    const apple = await (citibank as any).createFirm({ name: "Apple" });
    expect((citibank as any).firm_id).toBe(Number(apple.id));
    await citibank.save();
    await citibank.reload();
    expect((await citibank.firm)!.id).toBe(apple.id);
  });

  it("creating the belonging object from new record", async () => {
    const citibank = Account.new({ credit_limit: 10 });
    const apple = await (citibank as any).createFirm({ name: "Apple" });
    expect((citibank as any).firm_id).toBe(Number(apple.id));
    await citibank.save();
    await citibank.reload();
    expect((await citibank.firm)!.id).toBe(apple.id);
  });

  it("creating the belonging object with primary key", async () => {
    const client = await Client.create({ name: "Primary key client" });
    const apple = await (client as any).createFirmWithPrimaryKey({ name: "Apple" });
    expect((client as any).firm_name).toBe(apple.name);
    await client.save();
    await client.reload();
    expect((await (client as any).firmWithPrimaryKey)!.name).toBe(apple.name);
  });

  it("building the belonging object", async () => {
    const citibank = await Account.create({ credit_limit: 10 });
    const apple = (citibank as any).buildFirm({ name: "Apple" });
    await citibank.save();
    expect((citibank as any).firm_id).toBe(Number(apple.id));
  });

  it("building the belonging object for composite primary key", async () => {
    const cpkBook = cpkBooks("cpk_great_author_first_book");
    const order = (cpkBook as any).buildOrder();
    await cpkBook.save();
    const [, id] = order.id;
    expect((cpkBook as any).order_id).toBe(Number(id));
  });

  it("belongs to with explicit composite primary key", async () => {
    const cpkBook = cpkBooks("cpk_great_author_first_book");
    const order = (cpkBook as any).buildOrderExplicitFkPk();
    order.shop_id = 123;
    await cpkBook.save();
    const [shopId, id] = order.id;
    expect((cpkBook as any).order_id).toBe(Number(id));
    expect((cpkBook as any).shop_id).toBe(Number(shopId));
    await cpkBook.reload();
    expect((await (cpkBook as any).orderExplicitFkPk)!.id).toEqual(order.id);
  });

  it("belongs to with inverse association for composite primary key", async () => {
    const author = CpkAuthor.new({ name: "John" });
    const book = (author as any).books.build({ id: [null, 1], title: "The Rails Way" });
    const order = CpkOrder.new({ book, status: "paid" });
    await author.save();
    const [, orderId] = order.id as [number, number];
    expect(orderId).toBeTruthy();
    expect(Number(book.order_id)).toBe(Number(orderId));
  });

  it("should set composite foreign key on association when key changes on associated record", async () => {
    const book = await CpkBook.create({ id: [1, 2], title: "The Well-Grounded Rubyist" });
    const order = await CpkOrder.create({ id: [1, 2], book });

    (order as any).shop_id = 3;
    await order.save();

    expect((book as any).shop_id).toBe(3);
  });

  it("building the belonging object with implicit sti base class", async () => {
    const account = Account.new({});
    const company = (account as any).buildFirm();
    expect(company).toBeInstanceOf(Company);
  });

  it("building the belonging object with explicit sti base class", async () => {
    const account = Account.new({});
    const company = (account as any).buildFirm({ type: "Company" });
    expect(company).toBeInstanceOf(Company);
  });

  it("building the belonging object with sti subclass", async () => {
    const account = Account.new({});
    const company = (account as any).buildFirm({ type: "Firm" });
    expect(company).toBeInstanceOf(Firm);
  });

  it("building the belonging object with an invalid type", async () => {
    const account = Account.new({});
    expect(() => (account as any).buildFirm({ type: "InvalidType" })).toThrow(SubclassNotFound);
  });

  it("building the belonging object with an unrelated type", async () => {
    const account = Account.new({});
    expect(() => (account as any).buildFirm({ type: "Account" })).toThrow(SubclassNotFound);
  });

  it("building the belonging object with primary key", async () => {
    const client = await Client.create({ name: "Primary key client" });
    const apple = (client as any).buildFirmWithPrimaryKey({ name: "Apple" });
    await client.save();
    expect((client as any).firm_name).toBe(apple.name);
  });

  it("create!", async () => {
    const client = await Client.create({ name: "Jimmy" });
    const account = await (client as any).createAccount({ credit_limit: 10 });
    expect((await client.account)!.id).toBe(account.id);
    assertPredicate(account, (r: Base) => r.isPersisted());
    await client.save();
    await client.reload();
    expect((await client.account)!.id).toBe(account.id);
  });

  it("failing create!", async () => {
    const client = await Client.create({ name: "Jimmy" });
    await expect(() => (client as any).createAccountBang({ credit_limit: null })).rejects.toThrow(
      RecordInvalid,
    );
    expect((client as any).account).not.toBeNull();
    assertPredicate((client as any).account, (r: Base) => r.isNewRecord());
  });

  it("reloading the belonging object", async () => {
    const odegyAccount = accounts("odegy_account");
    expect((await odegyAccount.firm)!.name).toBe("Odegy");

    await Company.where({ id: (odegyAccount as any).firm_id }).updateAll({ name: "ODEGY" });
    expect((await odegyAccount.firm)!.name).toBe("Odegy");

    await assertQueriesCount(1, false, async () => {
      await (odegyAccount as any).reloadFirm();
    });

    await assertNoQueries(false, async () => {
      await odegyAccount.firm;
    });
    expect((await odegyAccount.firm)!.name).toBe("ODEGY");
  });

  it("reload the belonging object with query cache", async () => {
    const odegyAccountId = accounts("odegy_account").id!;

    const connection = (await Base.leaseConnection()) as any;
    connection.enableQueryCacheBang();
    connection.clearQueryCache();
    try {
      const odegyAccount = await Account.find(odegyAccountId);

      await odegyAccount.firm;

      expect(connection.queryCache.size).toBe(2);

      await assertQueriesCount(1, false, async () => {
        await (odegyAccount as any).reloadFirm();
      });

      await assertQueriesCount(1, false, async () => {
        await Account.find(odegyAccountId);
      });
    } finally {
      connection.disableQueryCacheBang();
    }
  });

  it("resetting the association", async () => {
    const odegyAccount = accounts("odegy_account");
    expect((await odegyAccount.firm)!.name).toBe("Odegy");

    await Company.where({ id: (odegyAccount as any).firm_id }).updateAll({ name: "ODEGY" });
    expect((await odegyAccount.firm)!.name).toBe("Odegy");

    await assertNoQueries(false, async () => {
      await (odegyAccount as any).resetFirm();
    });
    await assertQueriesCount(1, false, async () => {
      await odegyAccount.firm;
    });
    expect((await odegyAccount.firm)!.name).toBe("ODEGY");
  });

  it("natural assignment to nil", async () => {
    const client = await Client.find(3);
    (client as any).firm = null;
    await client.save();
    await client.association("firm").reload();
    expect((client as any).firm).toBeNull();
    expect((client as any).client_of).toBeNull();
  });

  it("natural assignment to nil with primary key", async () => {
    const firstFirmName = companies("first_firm").name;
    const client = await Client.create({ name: "Primary key client", firm_name: firstFirmName });
    (client as any).firmWithPrimaryKey = null;
    await client.save();
    await client.association("firmWithPrimaryKey").reload();
    expect((client as any).firmWithPrimaryKey).toBeNull();
    expect((client as any).client_of).toBeNull();
  });

  it("with different class name", async () => {
    const c1 = await Company.find(1);
    const c3 = (await Company.find(3)) as Client;
    expect((await c3.firmWithOtherName)!.name).toBe(c1.name);
    expect(c3.firmWithOtherName).not.toBeNull();
  });

  it("with condition", async () => {
    const c1 = await Company.find(1);
    const c3 = (await Company.find(3)) as Client;
    expect((await c3.firmWithCondition)!.name).toBe(c1.name);
    expect(c3.firmWithCondition).not.toBeNull();
  });

  it("polymorphic association class", async () => {
    const sponsor = Sponsor.new({});
    expect(sponsor.association("sponsorable").klass).toBeUndefined();
    await sponsor.association("sponsorable").reload();
    expect(await (sponsor as any).sponsorable).toBeNull();

    (sponsor as any).sponsorable_type = "";
    expect(sponsor.association("sponsorable").klass).toBeUndefined();
    await sponsor.association("sponsorable").reload();
    expect(await (sponsor as any).sponsorable).toBeNull();

    (sponsor as any).sponsorable = Member.new({ name: "Bert" });
    expect(sponsor.association("sponsorable").klass).toBe(Member);
  });

  it("with polymorphic and condition", async () => {
    const sponsor = await Sponsor.create({});
    const member = await Member.create({ name: "Bert" });

    (sponsor as any).sponsorable = member;
    await sponsor.save();

    expect((await (sponsor as any).sponsorable)!.id).toBe(member.id);
    expect(await (sponsor as any).sponsorableWithConditions).toBeNull();

    const [sponsorPreloaded] = await Sponsor.includes(
      ":sponsorable",
      ":sponsorableWithConditions",
    ).where({ id: sponsor.id });
    expect((sponsorPreloaded as any).sponsorable!.id).toBe(member.id);
    expect((sponsorPreloaded as any).sponsorableWithConditions).toBeNull();
  });

  it("with select", async () => {
    const author = await ((await Post.find(2)) as any).authorWithSelect;
    expect(Object.keys(author!.attributes).length).toBe(1);
    const included = await ((await Post.includes(":authorWithSelect").find(2)) as any)
      .authorWithSelect;
    expect(Object.keys(included!.attributes).length).toBe(1);
  });

  it("custom attribute with select", async () => {
    const firm = await ((await Company.find(2)) as any).firmWithSelect;
    expect(Object.keys(firm!.attributes).length).toBe(2);
    const included = await ((await Company.includes(":firmWithSelect").find(2)) as any)
      .firmWithSelect;
    expect(Object.keys(included!.attributes).length).toBe(2);
  });

  it("belongs to without counter cache option", async () => {
    const ship = await Ship.create({ name: "Countless" });

    await assertNoDifference(
      async () => (await ship.reload()).treasures_count as number,
      "treasures_count should not be changed unless counter_cache is given on the relation",
      async () => {
        const treasure = Treasure.new({ name: "Gold", ship });
        await treasure.save();
      },
    );

    await assertNoDifference(
      async () => (await ship.reload()).treasures_count as number,
      "treasures_count should not be changed unless counter_cache is given on the relation",
      async () => {
        const treasure = await (ship as any).treasures.first();
        await treasure.destroy();
      },
    );
  });

  it("belongs to counter", async () => {
    const debate = await Topic.create({ title: "debate" });
    expect(debate.readAttribute("replies_count")).toBe(0);

    const trash = await debate.replies.create({ title: "blah!", content: "world around!" });
    expect((await Topic.find(debate.id!)).readAttribute("replies_count")).toBe(1);

    await trash.destroy();
    expect((await Topic.find(debate.id!)).readAttribute("replies_count")).toBe(0);
  });

  it("belongs to counter with assigning nil", async () => {
    const topic = await Topic.create({ title: "debate" });
    const reply = await Reply.create({ title: "blah!", content: "world around!", topic });

    expect((reply as any).parent_id).toBe(Number(topic.id));
    expect(await (await topic.reload()).replies.size()).toBe(1);

    (reply as any).topic = null;
    await reply.reload();
    expect((reply as any).parent_id).toBe(Number(topic.id));
    expect(await (await topic.reload()).replies.size()).toBe(1);

    (reply as any).topic = null;
    await reply.save();
    expect((await topic.reload()).readAttribute("replies_count")).toBe(0);
  });

  it("belongs to counter with assigning new object", async () => {
    const topic = await Topic.create({ title: "debate" });
    const reply = await Reply.create({ title: "blah!", content: "world around!", topic });

    expect((reply as any).parent_id).toBe(Number(topic.id));
    expect((await topic.reload()).replies_count).toBe(1);

    const topic2 = (reply as any).buildTopic({ title: "debate2" });
    await reply.save();

    expect((reply as any).parent_id).not.toBe(Number(topic.id));
    expect((reply as any).parent_id).toBe(Number(topic2.id));

    expect((await topic.reload()).replies_count).toBe(0);
    expect((await topic2.reload()).replies_count).toBe(1);
  });

  it("belongs to with primary key counter", async () => {
    const debate = await Topic.create({ title: "debate" });
    const debate2 = await Topic.create({ title: "debate2" });
    const reply = await Reply.create({
      title: "blah!",
      content: "world around!",
      parent_title: "debate2",
    });

    expect((await debate.reload()).replies_count).toBe(0);
    expect((await debate2.reload()).replies_count).toBe(1);

    (reply as any).parent_title = "debate";
    await reply.save();

    expect((await debate.reload()).replies_count).toBe(1);
    expect((await debate2.reload()).replies_count).toBe(0);

    await assertNoQueries(false, async () => {
      (reply as any).topicWithPrimaryKey = debate;
    });

    expect((await debate.reload()).replies_count).toBe(1);
    expect((await debate2.reload()).replies_count).toBe(0);

    (reply as any).topicWithPrimaryKey = debate2;
    await reply.save();

    expect((await debate.reload()).replies_count).toBe(0);
    expect((await debate2.reload()).replies_count).toBe(1);

    (reply as any).topicWithPrimaryKey = null;
    await reply.save();

    expect((await debate.reload()).replies_count).toBe(0);
    expect((await debate2.reload()).replies_count).toBe(0);
  });

  it("belongs to counter with reassigning", async () => {
    const topic1 = await Topic.create({ title: "t1" });
    const topic2 = await Topic.create({ title: "t2" });
    const reply1 = Reply.new({ title: "r1", content: "r1" });
    (reply1 as any).topic = topic1;

    assert(await reply1.save());
    expect(await (await Topic.find(topic1.id!)).replies.size()).toBe(1);
    expect(await (await Topic.find(topic2.id!)).replies.size()).toBe(0);

    (reply1 as any).topic = await Topic.find(topic2.id!);

    await assertNoQueries(false, async () => {
      (reply1 as any).topic = topic2;
    });

    assert(await reply1.save());
    expect(await (await Topic.find(topic1.id!)).replies.size()).toBe(0);
    expect(await (await Topic.find(topic2.id!)).replies.size()).toBe(1);

    (reply1 as any).topic = null;
    await reply1.save();

    expect(await (await Topic.find(topic1.id!)).replies.size()).toBe(0);
    expect(await (await Topic.find(topic2.id!)).replies.size()).toBe(0);

    (reply1 as any).topic = topic1;
    await reply1.save();

    expect(await (await Topic.find(topic1.id!)).replies.size()).toBe(1);
    expect(await (await Topic.find(topic2.id!)).replies.size()).toBe(0);

    await reply1.destroy();

    expect(await (await Topic.find(topic1.id!)).replies.size()).toBe(0);
    expect(await (await Topic.find(topic2.id!)).replies.size()).toBe(0);
  });

  it("belongs to reassign with namespaced models and counters", async () => {
    const topic1 = await WebTopic.create({ title: "t1" });
    const topic2 = await WebTopic.create({ title: "t2" });
    const reply1 = WebReply.new({ title: "r1", content: "r1" });
    (reply1 as any).topic = topic1;

    assert(await reply1.save());
    expect(await (await WebTopic.find(topic1.id!)).replies.size()).toBe(1);
    expect(await (await WebTopic.find(topic2.id!)).replies.size()).toBe(0);

    (reply1 as any).topic = await WebTopic.find(topic2.id!);

    assert(await reply1.save());
    expect(await (await WebTopic.find(topic1.id!)).replies.size()).toBe(0);
    expect(await (await WebTopic.find(topic2.id!)).replies.size()).toBe(1);
  });

  it("belongs to counter after save", async () => {
    const topic = await Topic.create({ title: "monday night" });

    await assertQueriesCount(4, false, async () => {
      await topic.replies.create({ title: "re: monday night", content: "football" });
    });

    expect((await Topic.find(topic.id!)).readAttribute("replies_count")).toBe(1);

    await topic.save();
    expect((await Topic.find(topic.id!)).readAttribute("replies_count")).toBe(1);
  });

  it("belongs to counter after touch", async () => {
    const topic = await Topic.create({ title: "topic" });

    expect(topic.readAttribute("replies_count")).toBe(0);
    expect((topic as any).afterTouchCalled).toBe(0);

    const reply = await Reply.create({
      title: "blah!",
      content: "world around!",
      topicWithPrimaryKey: topic,
    });

    expect(topic.readAttribute("replies_count")).toBe(1);
    expect((topic as any).afterTouchCalled).toBe(1);

    await reply.destroyBang();

    expect(topic.readAttribute("replies_count")).toBe(0);
    expect((topic as any).afterTouchCalled).toBe(2);
  });

  it("belongs to touch with reassigning", async () => {
    const debate = await Topic.create({ title: "debate" });
    const debate2 = await Topic.create({ title: "debate2" });
    const reply = await Reply.create({
      title: "blah!",
      content: "world around!",
      parent_title: "debate2",
    });

    const time = RubyTime.now().minus(86400) as RubyTime;
    await debate.touch({ time });
    await debate2.touch({ time });

    await assertQueriesCount(5, false, async () => {
      (reply as any).parent_title = "debate";
      await reply.save();
    });

    const debateAt = (await debate.reload()).updated_at as RubyTime;
    const debate2At = (await debate2.reload()).updated_at as RubyTime;
    expect(debateAt.toF()).toBeGreaterThan(time.toF());
    expect(debate2At.toF()).toBeGreaterThan(time.toF());

    await debate.touch({ time });
    await debate2.touch({ time });

    await assertQueriesCount(5, false, async () => {
      (reply as any).topicWithPrimaryKey = debate2;
      await reply.save();
    });

    const debateAt2 = (await debate.reload()).updated_at as RubyTime;
    const debate2At2 = (await debate2.reload()).updated_at as RubyTime;
    expect(debateAt2.toF()).toBeGreaterThan(time.toF());
    expect(debate2At2.toF()).toBeGreaterThan(time.toF());
  });

  it("belongs to with touch option on touch", async () => {
    const lineItem = await LineItem.create({});
    await Invoice.create({ lineItems: [lineItem] });

    await assertQueriesCount(3, false, async () => {
      await lineItem.touch();
    });
  });

  it("belongs to with touch on multiple records", async () => {
    const lineItem = await LineItem.create({ amount: 1 });
    const lineItem2 = await LineItem.create({ amount: 2 });
    await Invoice.create({ lineItems: [lineItem, lineItem2] });

    await assertQueriesCount(3, false, async () => {
      await LineItem.transaction(async () => {
        await lineItem.touch();
        await lineItem2.touch();
      });
    });

    await assertQueriesCount(6, false, async () => {
      await lineItem.touch();
      await lineItem2.touch();
    });
  });

  it("belongs to with touch option on touch without updated at attributes", async () => {
    assertNot(LineItem.columnNames().includes("updated_at"));

    const lineItem = await LineItem.create({});
    const invoice = await Invoice.create({ lineItems: [lineItem] });
    const initial = invoice.updated_at as RubyTime;
    travelTo(new Date(Date.now() + 1000));
    try {
      await lineItem.touch();
    } finally {
      travelBack();
    }

    const reloadedAt = (await invoice.reload()).updated_at as RubyTime;
    expect(reloadedAt).not.toEqual(initial);
  });

  it("belongs to with touch option on touch and removed parent", async () => {
    const lineItem = await LineItem.create({});
    await Invoice.create({ lineItems: [lineItem] });

    (lineItem as any).invoice = null;

    await assertQueriesCount(4, false, async () => {
      await lineItem.touch();
    });
  });

  it("belongs to with touch option on update", async () => {
    const lineItem = await LineItem.create({});
    await Invoice.create({ lineItems: [lineItem] });

    await assertQueriesCount(4, false, async () => {
      await lineItem.update({ amount: 10 });
    });
  });

  it("belongs to with touch option on empty update", async () => {
    const lineItem = await LineItem.create({});
    await Invoice.create({ lineItems: [lineItem] });

    await assertNoQueries(false, async () => {
      await lineItem.save();
    });
  });

  it("belongs to with touch option on destroy", async () => {
    const lineItem = await LineItem.create({});
    await Invoice.create({ lineItems: [lineItem] });

    await assertQueriesCount(4, false, async () => {
      await lineItem.destroy();
    });
  });

  it("belongs to with touch option on destroy with destroyed parent", async () => {
    const lineItem = await LineItem.create({});
    const invoice = await Invoice.create({ lineItems: [lineItem] });
    await invoice.destroy();

    await assertQueriesCount(3, false, async () => {
      await lineItem.destroy();
    });
  });

  it("belongs to with touch option on touch and reassigned parent", async () => {
    const lineItem = await LineItem.create({});
    await Invoice.create({ lineItems: [lineItem] });
    (lineItem as any).invoice = await Invoice.create({});

    await assertQueriesCount(5, false, async () => {
      await lineItem.touch();
    });
  });

  it("belongs to counter after update", async () => {
    const topic = await Topic.create({ title: "37s" });
    await (topic as any).replies.create({ title: "re: 37s", content: "rails" });
    expect((await Topic.find(topic.id!)).readAttribute("replies_count")).toBe(1);

    await topic.update({ title: "37signals" });
    expect((await Topic.find(topic.id!)).readAttribute("replies_count")).toBe(1);
  });

  it("belongs to counter when update columns", async () => {
    const topic = await Topic.create({ title: "37s" });
    await (topic as any).replies.create({ title: "re: 37s", content: "rails" });
    expect((await Topic.find(topic.id!)).readAttribute("replies_count")).toBe(1);

    await topic.updateColumns({ content: "rails is wonderful" });
    expect((await Topic.find(topic.id!)).readAttribute("replies_count")).toBe(1);
  });

  it("assignment before child saved", async () => {
    const finalCut = Client.new({ name: "Final Cut" });
    const firm = await Firm.find(1);
    (finalCut as any).firm = firm;
    assertNotPredicate(finalCut, (r) => r.isPersisted());
    assert(await finalCut.save());
    assertPredicate(finalCut, (r) => r.isPersisted());
    assertPredicate(firm, (r) => r.isPersisted());
    expect((await finalCut.firm)!.id).toBe(firm.id);
    await finalCut.association("firm").reload();
    expect((finalCut as any).firm.id).toBe(firm.id);
  });

  it("assignment before child saved with primary key", async () => {
    const finalCut = Client.new({ name: "Final Cut" });
    const firm = await Firm.find(1);
    (finalCut as any).firmWithPrimaryKey = firm;
    assertNotPredicate(finalCut, (r) => r.isPersisted());
    assert(await finalCut.save());
    assertPredicate(finalCut, (r) => r.isPersisted());
    assertPredicate(firm, (r) => r.isPersisted());
    expect((await (finalCut as any).firmWithPrimaryKey)!.id).toBe(firm.id);
    await finalCut.association("firmWithPrimaryKey").reload();
    expect((finalCut as any).firmWithPrimaryKey.id).toBe(firm.id);
  });

  it("new record with foreign key but no object", async () => {
    const client = Client.new({ firm_id: 1 });
    const firmBasicId = await client.firmWithBasicId;
    expect(firmBasicId!.id).toBe((await Firm.first())!.id);
  });

  it("setting foreign key after nil target loaded", async () => {
    const client = Client.new({});
    await client.firmWithBasicId;
    (client as any).firm_id = 1;
    expect((await client.firmWithBasicId)!.id).toBe(companies("first_firm").id);
  });

  it("polymorphic setting foreign key after nil target loaded", async () => {
    const sponsor = Sponsor.new({});
    await (sponsor as any).sponsorable;
    (sponsor as any).sponsorable_id = 1;
    (sponsor as any).sponsorable_type = "Member";
    expect((await (sponsor as any).sponsorable)!.id).toBe(members("groucho").id);
  });

  it("dont find target when foreign key is null", async () => {
    const tagging = taggings("thinking_general");
    await assertNoQueries(false, async () => {
      await (tagging as any).superTag;
    });
  });

  it("dont find target when saving foreign key after stale association loaded", async () => {
    const client = await Client.create({
      name: "Test client",
      firmWithBasicId: await Firm.find(1),
    });
    (client as any).firm_id = (await Firm.create({ name: "Test firm" })).id;
    await assertQueriesCount(3, false, async () => {
      await client.saveBang();
    });
  });

  it("field name same as foreign key", async () => {
    const computer = await Computer.find(1);
    expect(await computer.developer).not.toBeNull();
  });

  it("counter cache", async () => {
    const topic = await Topic.create({ title: "Zoom-zoom-zoom" });
    expect(topic.readAttribute("replies_count")).toBe(0);

    const reply = Reply.new({ title: "re: zoom", content: "speedy quick!" });
    (reply as any).topic = topic;
    await reply.save();

    expect((await topic.reload()).readAttribute("replies_count")).toBe(1);
    expect(await (await topic.reload()).replies.size()).toBe(1);

    topic.writeAttribute("replies_count", 15);
    expect(await topic.replies.size()).toBe(15);
  });

  it("counter cache double destroy", async () => {
    const topic = await Topic.create({ title: "Zoom-zoom-zoom" });

    for (let i = 0; i < 5; i++) {
      await topic.replies.create({ title: "re: zoom", content: "speedy quick!" });
    }

    expect((await topic.reload()).readAttribute("replies_count")).toBe(5);
    expect(await topic.replies.size()).toBe(5);

    const reply = (await topic.replies)[0];
    await reply.destroy();
    expect((await topic.reload()).readAttribute("replies_count")).toBe(4);

    await reply.destroy();
    expect((await topic.reload()).readAttribute("replies_count")).toBe(4);
    expect(await (await topic.reload()).replies.size()).toBe(4);
  });

  it("concurrent counter cache double destroy", async () => {
    const topic = await Topic.create({ title: "Zoom-zoom-zoom" });

    for (let i = 0; i < 5; i++) {
      await topic.replies.create({ title: "re: zoom", content: "speedy quick!" });
    }

    expect((await topic.reload()).readAttribute("replies_count")).toBe(5);
    expect(await topic.replies.size()).toBe(5);

    const reply = (await topic.replies)[0];
    const replyClone = await Reply.find(reply.id!);

    await reply.destroy();
    expect((await topic.reload()).readAttribute("replies_count")).toBe(4);

    await replyClone.destroy();
    expect((await topic.reload()).readAttribute("replies_count")).toBe(4);
    expect(await (await topic.reload()).replies.size()).toBe(4);
  });

  it("custom counter cache", async () => {
    const reply = await Reply.create({ title: "re: zoom", content: "speedy quick!" });
    expect(reply.readAttribute("replies_count")).toBe(0);

    const silly = SillyReply.new({ title: "gaga", content: "boo-boo" });
    (silly as any).reply = reply;
    await silly.save();

    expect((await reply.reload()).readAttribute("replies_count")).toBe(1);
    expect(await reply.replies.size()).toBe(1);

    reply.writeAttribute("replies_count", 17);
    expect(await reply.replies.size()).toBe(17);
  });

  it("replace counter cache", async () => {
    const topic = await Topic.create({ title: "Zoom-zoom-zoom" });
    const reply = await Reply.create({ title: "re: zoom", content: "speedy quick!" });

    (reply as any).topic = topic;
    await reply.save();
    await topic.reload();

    expect(topic.replies_count).toBe(1);
  });

  it("association assignment sticks", async () => {
    const post = await Post.first();
    const [author1, author2] = await Author.limit(2);
    expect(author1).not.toBeNull();
    expect(author2).not.toBeNull();

    await (post as any).author;
    (post as any).author_id = author2.id;

    await post!.save();
    await post!.reload();

    expect((post as any).author_id).toBe(Number(author2.id));
  });

  it("cant save readonly association", async () => {
    await assertRaises([ReadOnlyRecord], {}, async () =>
      (await (companies("first_client") as any).readonlyFirm).saveBang(),
    );
    assertPredicate(await (companies("first_client") as any).readonlyFirm, (r: Base) =>
      r.isReadonly(),
    );
  });

  it("polymorphic assignment foreign key type string", async () => {
    const comment = await Comment.first();
    const david = authors("david");
    const groucho = members("groucho");

    (comment as any).author = david;
    (comment as any).resource = groucho;
    await comment!.save();

    expect(Number(david.id)).toBe(1);
    expect(Number((comment as any).author_id)).toBe(1);
    expect((await (await Comment.includes(":author").first())!.author)!.id).toBe(david.id);

    expect(Number(groucho.id)).toBe(1);
    expect((comment as any).resource_id).toBe("1");
    expect((await (await Comment.includes(":resource").first())!.resource)!.id).toBe(groucho.id);
  });

  it("polymorphic assignment foreign type field updating", async () => {
    const sponsor = Sponsor.new({});
    const member = await Member.create({});
    (sponsor as any).sponsorable = member;
    expect((sponsor as any).sponsorable_type).toBe("Member");

    const sponsor2 = Sponsor.new({});
    const memberNew = Member.new({});
    (sponsor2 as any).sponsorable = memberNew;
    expect((sponsor2 as any).sponsorable_type).toBe("Member");
  });

  it("polymorphic assignment with primary key foreign type field updating", async () => {
    const essay = Essay.new({});
    const writer = await Author.create({ name: "David" });
    (essay as any).writer = writer;
    expect((essay as any).writer_type).toBe("Author");

    const essay2 = Essay.new({});
    const writerNew = Author.new({});
    (essay2 as any).writer = writerNew;
    expect((essay2 as any).writer_type).toBe("Author");
  });

  it("polymorphic assignment updates foreign id field for new and saved records", async () => {
    const sponsor = Sponsor.new({});
    const savedMember = await Member.create({});
    const newMember = Member.new({});

    (sponsor as any).sponsorable = savedMember;
    expect((sponsor as any).sponsorable_id).toBe(Number(savedMember.id));

    (sponsor as any).sponsorable = newMember;
    expect((sponsor as any).sponsorable_id).toBeNull();
  });

  it("assignment updates foreign id field for new and saved records", async () => {
    const client = Client.new({});
    const savedFirm = await Firm.create({ name: "Saved" });
    const newFirm = Firm.new({});

    (client as any).firm = savedFirm;
    expect(Number((client as any).client_of)).toBe(Number(savedFirm.id));

    (client as any).firm = newFirm;
    expect((client as any).client_of).toBeNull();
  });

  it("polymorphic assignment with primary key updates foreign id field for new and saved records", async () => {
    const essay = Essay.new({});
    const savedWriter = await Author.create({ name: "David" });
    const newWriter = Author.new({});

    (essay as any).writer = savedWriter;
    expect((essay as any).writer_id).toBe(savedWriter.name);

    (essay as any).writer = newWriter;
    expect((essay as any).writer_id).toBeNull();
  });

  it("polymorphic assignment with nil", async () => {
    const essay = Essay.new({});
    expect((essay as any).writer_id).toBeNull();
    expect((essay as any).writer_type).toBeNull();

    (essay as any).writer_id = 1;
    (essay as any).writer_type = "Author";

    (essay as any).writer = null;
    expect((essay as any).writer_id).toBeNull();
    expect((essay as any).writer_type).toBeNull();
  });

  it("belongs to proxy should respond to private methods via send", async () => {
    await assertNothingRaised(async () => {
      (companies("first_firm") as any)["privateMethod"]();
      ((await (companies("second_client") as Client).firm) as any)["privateMethod"]();
    });
  });

  it("save of record with loaded belongs to", async () => {
    const account = (await companies("first_firm").account)!;

    await assertNothingRaised(async () => {
      await (await Account.find(account.id!)).saveBang();
      await (await Account.includes(":firm").find(account.id!)).saveBang();
    });

    await (await account.firm)!.delete();

    await assertNothingRaised(async () => {
      await (await Account.find(account.id!)).saveBang();
      await (await Account.includes(":firm").find(account.id!)).saveBang();
    });
  });

  it("dependent delete and destroy with belongs to", async () => {
    AuthorAddress.destroyedAuthorAddressIds.length = 0;

    const authorAddress = authorAddresses("david_address");
    const authorAddressExtra = authorAddresses("david_address_extra");
    expect(AuthorAddress.destroyedAuthorAddressIds).toEqual([]);

    await assertDifference(
      () => AuthorAddress.count() as Promise<number>,
      -2,
      null,
      async () => {
        await authors("david").destroy();
      },
    );

    expect(await AuthorAddress.where({ id: [authorAddress.id, authorAddressExtra.id] })).toEqual(
      [],
    );
    expect(AuthorAddress.destroyedAuthorAddressIds).toEqual([authorAddress.id]);
  });

  it("belongs to invalid dependent option raises exception", async () => {
    const error = await assertRaises([ArgumentError], {}, () => {
      class SpecialAuthor extends Author {
        static {
          this.belongsTo("specialAuthorAddress", {
            dependent: "nullify" as any,
            className: "AuthorAddress",
          });
        }
      }
      void SpecialAuthor;
    });
    expect(error.message).toEqual(
      "The :dependent option must be one of [:destroy, :delete, :destroyAsync], but is :nullify",
    );
  });

  it("dependency should halt parent destruction", async () => {
    const author = await UndestroyableAuthor.create({ name: "Test" });
    const book = await DestroyableBook.create({ author });

    const authorCount = await UndestroyableAuthor.count();
    await assertNoDifference(
      [
        () => UndestroyableAuthor.count() as Promise<number>,
        () => DestroyableBook.count() as Promise<number>,
      ],
      null,
      async () => {
        assertNot(await book.destroy());
      },
    );
  });

  it("dependency should halt parent destruction with cascaded three levels", async () => {
    const author = await UndestroyableAuthor.create({ name: "Test" });
    const book = await DestroyableBook.create({ author });
    const essay = await EssayDestroy.create({ book });

    await assertNoDifference(
      [
        () => UndestroyableAuthor.count() as Promise<number>,
        () => DestroyableBook.count() as Promise<number>,
        () => EssayDestroy.count() as Promise<number>,
      ],
      null,
      async () => {
        assertNot(await essay.destroy());
        assertNot(essay.isDestroyed());
      },
    );
  });

  it("attributes are being set when initialized from belongs to association with where clause", async () => {
    const acc = accounts("signals37");
    const newFirm = (acc as any).buildFirm({ name: "Apple" });
    expect(newFirm.name).toBe("Apple");
  });

  it("attributes are set without error when initialized from belongs to association with array in where clause", async () => {
    const newAccount = Account.where({ credit_limit: [50, 60] }).new({});
    expect((newAccount as any).credit_limit).toBeNull();
  });

  it("reassigning the parent id updates the object", async () => {
    const client = companies("second_client") as Client;

    await (client as any).firm;
    await (client as any).firmWithCondition;
    const firmProxy = (client as any).association("firm");
    const firmWithConditionProxy = (client as any).association("firmWithCondition");

    assertNotPredicate(firmProxy, (p: any) => p.isStaleTarget());
    assertNotPredicate(firmWithConditionProxy, (p: any) => p.isStaleTarget());
    expect(Number(((await (client as any).firm) as Company).id)).toBe(
      Number(companies("first_firm").id),
    );
    expect(Number(((await (client as any).firmWithCondition) as Company).id)).toBe(
      Number(companies("first_firm").id),
    );

    (client as any).client_of = companies("another_firm").id;

    assertPredicate(firmProxy, (p: any) => p.isStaleTarget());
    assertPredicate(firmWithConditionProxy, (p: any) => p.isStaleTarget());
    expect(Number(((await (client as any).firm) as Company).id)).toBe(
      Number(companies("another_firm").id),
    );
    expect(Number(((await (client as any).firmWithCondition) as Company).id)).toBe(
      Number(companies("another_firm").id),
    );
  });

  it("assigning nil on an association clears the associations inverse", async () => {
    await withHasManyInversing(async () => {
      const book = await Book.create({});
      const citation = await (book as any).citations.create({});

      assertSame(book, citation.book);

      await assertNothingRaised(async () => {
        citation.book = null;
        await citation.save();
      });
    });
  });

  it("clearing an association clears the associations inverse", async () => {
    const author = await Author.create({ name: "Jimmy Tolkien" });
    const post = await (author as any).createPost({ title: "The silly medallion", body: "" });
    expect((author as any).post!.id).toBe(post.id);
    expect(post.author!.id).toBe(author.id);

    await (author as any).setPost(null);
    expect((author as any).post).toBeNull();

    await post.update({ title: "The Silmarillion" });
    expect((author as any).post).toBeNull();
  });

  it("destroying child with unloaded parent and foreign key and touch is possible with has many inversing", async () => {
    await withHasManyInversing(async () => {
      const book = await Book.create({});
      const citation = await (book as any).citations.create({});

      await assertDifference(
        () => Citation.count() as Promise<number>,
        -1,
        null,
        async () => {
          await (await Citation.find(citation.id)).destroy();
        },
      );
    });
  });

  it("polymorphic reassignment of associated id updates the object", async () => {
    const sponsor = sponsors("moustache_club_sponsor_for_groucho");

    await (sponsor as any).sponsorable;
    const proxy = (sponsor as any).association("sponsorable");

    assertNotPredicate(proxy, (p: any) => p.isStaleTarget());
    expect((sponsor as any).sponsorable!.id).toBe(members("groucho").id);

    (sponsor as any).sponsorable_id = members("some_other_guy").id;

    assertPredicate(proxy, (p: any) => p.isStaleTarget());
    expect((await (sponsor as any).sponsorable)!.id).toBe(members("some_other_guy").id);
  });

  it("polymorphic reassignment of associated type updates the object", async () => {
    const sponsor = sponsors("moustache_club_sponsor_for_groucho");

    await (sponsor as any).sponsorable;
    const proxy = (sponsor as any).association("sponsorable");

    assertNotPredicate(proxy, (p: any) => p.isStaleTarget());
    expect((sponsor as any).sponsorable!.id).toBe(members("groucho").id);

    (sponsor as any).sponsorable_type = "Firm";

    assertPredicate(proxy, (p: any) => p.isStaleTarget());
    expect((await (sponsor as any).sponsorable)!.id).toBe(companies("first_firm").id);
  });

  it("reloading association with key change", async () => {
    const client = companies("second_client");
    const firm = (client as any).association("firm");

    (client as any).firm = companies("another_firm");
    await firm.reload();
    expect(firm.target!.id).toBe(companies("another_firm").id);

    (client as any).client_of = companies("first_firm").id;
    await firm.reload();
    expect(firm.target!.id).toBe(companies("first_firm").id);
  });

  it("polymorphic counter cache", async () => {
    const tagging = taggings("welcome_general");
    const post = posts("welcome");
    const comment = comments("greetings");

    expect(post.id).toBe(comment.id);

    await assertDifference(
      async () => (await post.reload()).tags_count as number,
      -1,
      null,
      async () => {
        await assertDifference(
          async () => (await comment.reload()).tags_count as number,
          +1,
          null,
          async () => {
            (tagging as any).taggable = comment;
            await tagging.saveBang();
          },
        );
      },
    );

    await assertDifference(
      async () => (await comment.reload()).tags_count as number,
      -1,
      null,
      async () => {
        await assertDifference(
          async () => (await post.reload()).tags_count as number,
          +1,
          null,
          async () => {
            (tagging as any).taggable_type = (post.constructor as typeof Post).polymorphicName();
            (tagging as any).taggable_id = post.id;
            await tagging.saveBang();
          },
        );
      },
    );
  });

  it("polymorphic with custom foreign type", async () => {
    const sponsor = sponsors("moustache_club_sponsor_for_groucho");
    const groucho = members("groucho");
    const other = members("some_other_guy");

    expect((await (sponsor as any).sponsorable)!.id).toBe(groucho.id);
    expect((await (sponsor as any).thing)!.id).toBe(groucho.id);

    (sponsor as any).thing = other;

    expect((await (sponsor as any).sponsorable)!.id).toBe(other.id);
    expect((await (sponsor as any).thing)!.id).toBe(other.id);

    (sponsor as any).sponsorable = groucho;

    expect((await (sponsor as any).sponsorable)!.id).toBe(groucho.id);
    expect((await (sponsor as any).thing)!.id).toBe(groucho.id);
  });

  it("polymorphic with custom name counter cache", async () => {
    const car = await CarPolymorphicName.create({});
    const wheel = await WheelPolymorphicName.create({
      wheelable_type: "polymorphic_car",
      wheelable_id: car.id,
    });
    expect((await CarPolymorphicName.find(car.id)).wheels_count).toBe(1);

    (wheel as any).wheelable = null;
    await wheel.save();

    expect((await CarPolymorphicName.find(car.id)).wheels_count).toBe(0);
  });

  it("polymorphic with custom name touch old belongs to model", async () => {
    const car = await CarPolymorphicName.create({});
    const wheel = (await WheelPolymorphicName.create({
      wheelable: car,
    } as any)) as unknown as WheelPolymorphicName;

    const touchTime = new Date(Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000) * 1000);

    travelTo(touchTime);
    try {
      (wheel as any).wheelable = null;
      await wheel.save();
    } finally {
      travelBack();
    }

    const reloaded = await CarPolymorphicName.find(car.id);
    expect((reloaded.wheels_owned_at as RubyTime).toF() * 1000).toBe(touchTime.getTime());
  });

  it("build with conditions", async () => {
    const client = companies("second_client");
    const firm = (client as any).buildBobFirm();
    expect(firm.name).toBe("Bob");
  });

  it("create with conditions", async () => {
    const client = companies("second_client");
    const firm = await (client as any).createBobFirm();
    expect(firm.name).toBe("Bob");
  });

  it("create bang with conditions", async () => {
    const client = companies("second_client");
    const firm = await (client as any).createBobFirm();
    expect(firm.name).toBe("Bob");
  });

  it("build with block", async () => {
    const client = await Client.create({ name: "Client Company" });
    const firm = (client as any).buildFirm({ name: "Agency Company" });
    expect(firm.name).toBe("Agency Company");
  });

  it("create with block", async () => {
    const client = await Client.create({ name: "Client Company" });
    const firm = await (client as any).createFirm({ name: "Agency Company" });
    expect(firm.name).toBe("Agency Company");
  });

  it("create bang with block", async () => {
    const client = await Client.create({ name: "Client Company" });
    const firm = await (client as any).createFirm({ name: "Agency Company" });
    expect(firm.name).toBe("Agency Company");
  });

  it("should set foreign key on create association", async () => {
    const client = await Client.create({ name: "fuu" });
    const firm = await (client as any).createFirm({ name: "baa" });
    expect((client as any).client_of).toBe(firm.id);
  });

  it("should set foreign key on create association!", async () => {
    const client = await Client.create({ name: "fuu" });
    const firm = await (client as any).createFirm({ name: "baa" });
    expect((client as any).client_of).toBe(firm.id);
  });

  it("should set foreign key on create association with unpersisted owner", async () => {
    const tagging = Tagging.new({});
    const tag = await (tagging as any).createTag();

    assertNotPredicate(tagging, (r) => r.isPersisted());
    assertPredicate(tag, (r: Base) => r.isPersisted());
    expect(Number((tagging as any).tag_id)).toBe(Number(tag.id));
  });

  it("should set foreign key on save", async () => {
    const client = await Client.create({ name: "fuu" });
    const firm = (client as any).buildFirm({ name: "baa" });

    await firm.save();
    expect((client as any).client_of).toBe(firm.id);
  });

  it("should set foreign key on save!", async () => {
    const client = await Client.create({ name: "fuu" });
    const firm = (client as any).buildFirm({ name: "baa" });

    await firm.saveBang();
    expect((client as any).client_of).toBe(firm.id);
  });

  it("self referential belongs to with counter cache assigning nil", async () => {
    const comment = await Comment.create({ post: posts("thinking"), body: "fuu" });
    (comment as any).parent = null;
    await comment.save();

    expect((await comment.reload()).parent).toBeNull();
    expect((await comments("greetings").reload()).children_count).toBe(0);
  });

  it("belongs to with id assigning", async () => {
    const post = posts("welcome");
    const comment = await Comment.create({ body: "foo", post });
    const parent = comments("greetings");
    expect((await parent.reload()).children_count).toBe(0);
    (comment as any).parent_id = parent.id;

    await comment.save();
    expect((await parent.reload()).children_count).toBe(1);
  });

  it("belongs to with out of range value assigning", async () => {
    class Temp extends Author {
      static {
        this.validates("authorAddress", { presence: true });
      }
    }

    const author = Temp.new();
    author.writeAttribute("author_address_id", 9223372036854775808n);

    expect(await (author as any).authorAddress).toBeNull();
    assertNot(await author.isValid());
    expect(author.errors.details.get("authorAddress")).toEqual([{ error: ":blank" }]);
  });

  it("polymorphic with custom primary key", async () => {
    const toy = await Toy.create({});
    const sponsor = await Sponsor.create({ sponsorable: toy });

    await sponsor.reload();
    expect((await (sponsor as any).sponsorable)!.id).toEqual(toy.toy_id);
  });

  it("destroying polymorphic child with unloaded parent and touch is possible with has many inversing", async () => {
    class SponsorWithTouchInverse extends Sponsor {
      static override _tableName = "sponsors";
      static {
        this.belongsTo("sponsorable", { polymorphic: true, inverseOf: "sponsors", touch: true });
      }
    }
    registerModel(SponsorWithTouchInverse as any);

    try {
      await withHasManyInversing(async () => {
        const toy = await Toy.create({});
        const sponsor = await (toy as any).sponsors.create({});

        await assertDifference(
          () => Sponsor.count() as Promise<number>,
          -1,
          null,
          async () => {
            await ((await SponsorWithTouchInverse.find(sponsor.id)) as any).destroy();
          },
        );
      });
    } finally {
      (Base as any)._modelRegistry?.delete("SponsorWithTouchInverse");
    }
  });

  it("polymorphic with false", async () => {
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
      class TempPost extends Base {
        static _tableName = "posts";
        static {
          this.belongsTo("category", { polymorphic: false } as any);
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
      interface TempPost {
        get category(): Category | null | Promise<Category | null>;
        set category(value: Category | null);
      }
    }).not.toThrow();
  });

  it("stale tracking doesn't care about the type", async () => {
    const apple = await Firm.create({ name: "Apple" });
    const citibank = await Account.create({ credit_limit: 10 });

    (citibank as any).firm_id = apple.id;
    await citibank.firm;

    (citibank as any).firm_id = String(apple.id);

    assertNotPredicate((citibank as any).association("firm"), (a: any) => a.isStaleTarget());
  });

  it("reflect the most recent change", async () => {
    const [author1, author2] = await Author.limit(2);
    const post = Post.new({ title: "foo", body: "bar" });

    (post as any).author = author1;
    (post as any).author_id = author2.id;

    assert(await post.save());
    expect((post as any).author_id).toBe(Number(author2.id));
  });

  it("dangerous association name raises ArgumentError", async () => {
    for (const name of ["errors", "save"]) {
      await assertRaises([ArgumentError], {}, () => {
        class TempModel extends Base {
          static _tableName = "accounts";
          static {
            this.belongsTo(name as any);
          }
        }
        void TempModel;
      });
    }
  });

  it("belongs_to works with model called Record", async () => {
    const record = await Record.create({});
    await Column.create({ record });
    expect(await Column.count()).toBe(1);
  });

  it("multiple counter cache with after create update", async () => {
    const post = posts("welcome");
    const parent = comments("greetings");

    await assertDifference(
      async () => ((await parent.reload()) as any).children_count as number,
      +1,
      null,
      async () => {
        await assertDifference(
          async () => ((await post.reload()) as any).comments_count as number,
          +1,
          null,
          async () => {
            await CommentWithAfterCreateUpdate.create({ body: "foo", post, parent });
          },
        );
      },
    );
  });

  it("assigning an association doesn't result in duplicate objects", async () => {
    const post = await Post.create({ title: "title", body: "body" });
    await post.comments.replace([post.comments.build({ body: "body" })]);
    await post.save();

    expect(await post.comments.size()).toBe(1);
    expect(await Comment.where({ post_id: post.id }).count()).toBe(1);
    const lastComment = await Comment.last();
    expect((await (lastComment as any).post)!.id).toBe(post.id);
  });

  it("tracking change from one persisted record to another", async () => {
    const node = nodes("child_one_of_a");
    expect(node.parent).not.toBeNull();
    expect((node as any).parentChanged?.()).toBeFalsy();
    expect((node as any).parentPreviouslyChanged?.()).toBeFalsy();

    (node as any).parent = nodes("grandparent");
    expect((node as any).parentChanged?.()).toBeTruthy();
    expect((node as any).parentPreviouslyChanged?.()).toBeFalsy();

    await node.save();
    expect((node as any).parentChanged?.()).toBeFalsy();
    expect((node as any).parentPreviouslyChanged?.()).toBeTruthy();
  });

  it("tracking change from persisted record to new record", async () => {
    const node = nodes("child_one_of_a");
    expect(node.parent).not.toBeNull();
    assertNot((node as any).parentChanged());
    assertNot((node as any).parentPreviouslyChanged());

    const newNode = Node.new({ tree_id: nodes("grandparent").tree_id, name: "Child three" });
    (node as any).parent = newNode;
    assertPredicate(node, (n: any) => n.parentChanged());
    assertNot((node as any).parentPreviouslyChanged());

    await node.saveBang();
    assertNot((node as any).parentChanged());
    assertPredicate(node, (n: any) => n.parentPreviouslyChanged());
  });

  it("tracking change from persisted record to nil", async () => {
    const node = nodes("child_one_of_a");
    expect(node.parent).not.toBeNull();
    assertNot((node as any).parentChanged());
    assertNot((node as any).parentPreviouslyChanged());

    (node as any).parent = null;
    assertPredicate(node, (n: any) => n.parentChanged());
    assertNot((node as any).parentPreviouslyChanged());

    await node.saveBang();
    assertNot((node as any).parentChanged());
    assertPredicate(node, (n: any) => n.parentPreviouslyChanged());
  });

  it("tracking change from nil to persisted record", async () => {
    const node = nodes("grandparent");
    expect(node.parent).toBeNull();
    assertNot((node as any).parentChanged());
    assertNot((node as any).parentPreviouslyChanged());

    (node as any).parent = await Node.create({ tree_id: node.tree_id, name: "Great-grandparent" });
    assertPredicate(node, (n: any) => n.parentChanged());
    assertNot((node as any).parentPreviouslyChanged());

    await node.saveBang();
    assertNot((node as any).parentChanged());
    assertPredicate(node, (n: any) => n.parentPreviouslyChanged());
  });

  it("tracking change from nil to new record", async () => {
    const node = nodes("grandparent");
    expect(node.parent).toBeNull();
    assertNot((node as any).parentChanged());
    assertNot((node as any).parentPreviouslyChanged());

    (node as any).parent = Node.new({ tree_id: node.tree_id, name: "Great-grandparent" });
    assertPredicate(node, (n: any) => n.parentChanged());
    assertNot((node as any).parentPreviouslyChanged());

    await node.saveBang();
    assertNot((node as any).parentChanged());
    assertPredicate(node, (n: any) => n.parentPreviouslyChanged());
  });

  it("tracking polymorphic changes", async () => {
    const comment = comments("greetings");
    expect(comment.author).toBeNull();
    expect((comment as any).authorChanged?.()).toBeFalsy();
    expect((comment as any).authorPreviouslyChanged?.()).toBeFalsy();

    (comment as any).author = authors("david");
    expect((comment as any).authorChanged?.()).toBeTruthy();

    await comment.save();
    expect((comment as any).authorChanged?.()).toBeFalsy();
    expect((comment as any).authorPreviouslyChanged?.()).toBeTruthy();

    expect(authors("david").id).toBe(companies("first_firm").id);

    (comment as any).author = companies("first_firm");
    expect((comment as any).authorChanged?.()).toBeTruthy();

    await comment.save();
    expect((comment as any).authorChanged?.()).toBeFalsy();
    expect((comment as any).authorPreviouslyChanged?.()).toBeTruthy();
  });

  it("runs parent presence check if parent changed or nil", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class ShipRequired extends Base {
      declare name: any;

      static _tableName = "ships";
      static {
        this.belongsTo("developer", { required: true, inverseOf: false });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface ShipRequired {
      get developer(): Developer | null | Promise<Developer | null>;
      set developer(value: Developer | null);
    }

    const david = developers("david");
    const jamis = developers("jamis");

    const ship = await ShipRequired.create({ name: "Medusa", developer_id: david.id });
    expect(Number((ship as any).developer_id)).toBe(Number(david.id));

    await assertQueriesCount(4, false, async () => {
      await ship.update({ developer_id: jamis.id });
    });

    await ship.updateColumns({ developer_id: null });
    await ship.reload();

    await assertQueriesCount(4, false, async () => {
      await ship.update({ developer_id: david.id });
    });
  });

  it("skips parent presence check if parent has not changed", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class ShipRequired extends Base {
      declare name: any;

      static _tableName = "ships";
      static {
        this.belongsTo("developer", { required: true, inverseOf: false });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface ShipRequired {
      get developer(): Developer | null | Promise<Developer | null>;
      set developer(value: Developer | null);
    }

    const david = developers("david");
    const ship = await ShipRequired.create({ name: "Medusa", developer_id: david.id });
    await ship.reload();

    await assertQueriesCount(3, false, async () => {
      await ship.update({ name: "Leviathan" });
    });
  });

  it("runs parent presence check if parent has not changed and belongs_to_required_validates_foreign_key is set", async () => {
    const original = belongsToRequiredValidatesForeignKey();
    setBelongsToRequiredValidatesForeignKey(true);

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
      class TempShip extends Base {
        declare name: any;

        static _tableName = "ships";
        static {
          this.belongsTo("developer", { required: true, inverseOf: false });
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
      interface TempShip {
        get developer(): Developer | null | Promise<Developer | null>;
        set developer(value: Developer | null);
      }

      const david = developers("david");
      const ship = await TempShip.create({ name: "Medusa", developer_id: david.id });
      await ship.reload();

      await assertQueriesCount(4, false, async () => {
        await ship.update({ name: "Leviathan" });
      });
    } finally {
      setBelongsToRequiredValidatesForeignKey(original);
    }
  });

  it("composite primary key malformed association class", async () => {
    const error = await assertRaises([CompositePrimaryKeyMismatchError], {}, async () => {
      const book = new CpkBrokenBook({
        title: "Some book",
        order: CpkOrder.new({ id: [1, 2] as any }),
      });
      await (book as any).saveBang();
    });

    expect(error.message).toEqual(
      `Association CpkBrokenBook#order primary key ["shop_id", "status"] doesn't match with foreign key order_id. Please specify query_constraints, or primary_key and foreign_key values.`,
    );
  });

  it("composite primary key malformed association owner class", async () => {
    const error = await assertRaises([CompositePrimaryKeyMismatchError], {}, async () => {
      const book = new CpkBrokenBookWithNonCpkOrder({
        title: "Some book",
        order: CpkNonCpkOrder.new({ id: 1 }),
      });
      await (book as any).saveBang();
    });

    expect(error.message).toEqual(
      `Association CpkBrokenBookWithNonCpkOrder#order primary key ["id"] doesn't match with foreign key ["shop_id", "order_id"]. Please specify query_constraints, or primary_key and foreign_key values.`,
    );
  });

  it("association with query constraints assigns id on replacement", async () => {
    const newOrder = CpkNonCpkOrder.new({});
    const book = await CpkNonCpkBook.create({
      title: "book",
      author_id: 2,
      id: 1,
      nonCpkOrder: newOrder,
    });
    const otherOrder = await CpkNonCpkOrder.create({});
    (book as any).nonCpkOrder = otherOrder;

    expect(Number((book as any).order_id)).toEqual(Number(otherOrder.id));
  });
});

describe("AsyncBelongsToAssociationsTest", () => {
  const { companies } = fixtures(["companies"]);

  // BLOCKED: association-async-load-target-uses-async-executor
  it.skip("async load belongs to", async () => {
    const client = (await Client.find(3)) as any;
    const firstFirm = companies("first_firm");

    await client.association("firm").asyncLoadTarget();

    const events: NotificationEvent[] = [];
    const callback = (event: NotificationEvent) => {
      if (event.payload.name !== "SCHEMA") events.push(event);
    };
    await Notifications.subscribed(callback, "sql.active_record", () => client.firm);

    await assertNoQueries(false, async () => {
      expect((await client.firm).id).toEqual(firstFirm.id);
      expect((await client.firm).name).toEqual(firstFirm.name);
    });

    expect(events.length).toEqual(1);
    expect(events[0].payload.async).toEqual(true);
  });
});
