import { kernelThrow } from "@blazetrails/ruby-compat";
import { Notifications, type NotificationEvent } from "@blazetrails/activesupport";
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { SingularAssociation } from "./singular-association.js";
import { ArgumentError, I18n, UnknownAttributeError } from "@blazetrails/activemodel";
import {
  Base,
  registerModel,
  registerSubclass,
  SubclassNotFound,
  AssociationTypeMismatch,
  RecordNotFound,
  DeleteRestrictionError,
  RecordInvalid,
  RecordNotSaved,
  ReadOnlyRecord,
} from "../index.js";
import { Associations } from "../associations.js";
import {
  Company,
  Firm,
  DependentFirm,
  ExclusivelyDependentFirm,
  RestrictedWithExceptionFirm,
  RestrictedWithErrorFirm,
  Client,
} from "../test-helpers/models/company.js";
import { Account } from "../test-helpers/models/account.js";
import { Car } from "../test-helpers/models/car.js";
import "../test-helpers/models/person.js";
import { Bulb } from "../test-helpers/models/bulb.js";
import { Club } from "../test-helpers/models/club.js";
import { Membership } from "../test-helpers/models/membership.js";
import { Chef } from "../test-helpers/models/chef.js";
import {
  DrinkDesignerWithPolymorphicTouchChef,
  DrinkDesignerWithPolymorphicDependentNullifyChef,
} from "../test-helpers/models/drink-designer.js";
import { Pirate, DestructivePirate } from "../test-helpers/models/pirate.js";
import { Ship } from "../test-helpers/models/ship.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { Developer, AuditLog } from "../test-helpers/models/developer.js";
import { Room } from "../test-helpers/models/room.js";
import { User } from "../test-helpers/models/user.js";
import { Image } from "../test-helpers/models/image.js";
import { Department } from "../test-helpers/models/department.js";
import {
  CpkBook,
  CpkOrder,
  CpkOrderWithNullifiedBook,
  CpkBrokenOrder,
  CpkBrokenOrderWithNonCpkBooks,
  CpkNonCpkBook,
} from "../test-helpers/models/cpk.js";
import { CompositePrimaryKeyMismatchError } from "./errors.js";
import { fixtures } from "../test-fixtures.js";
import { resetI18n } from "../test-helpers/i18n.js";
import {
  assertQueriesCount,
  assertNoQueries,
  assertQueriesMatch,
} from "../testing/query-assertions.js";
import { captureSql } from "../testing/sql-capture.js";
import {
  assert,
  assertNot,
  assertPredicate,
  assertNotPredicate,
  assertRaises,
  assertNothingRaised,
  assertNoDifference,
  assertNotEmpty,
  isPresent,
} from "@blazetrails/activesupport";

async function readHasOne(owner: any, name: string): Promise<any> {
  return await owner.association(name).loadTarget();
}

function registerCompanyModels(): void {
  registerModel(Company);
  registerModel(Firm);
  registerModel(DependentFirm);
  registerModel(ExclusivelyDependentFirm);
  registerModel(RestrictedWithExceptionFirm);
  registerModel(RestrictedWithErrorFirm);
  registerModel(Client);
  registerModel(Account);
  Company.inheritanceColumn = "type";
  registerSubclass(Firm);
  registerSubclass(DependentFirm);
  registerSubclass(ExclusivelyDependentFirm);
  registerSubclass(RestrictedWithExceptionFirm);
  registerSubclass(RestrictedWithErrorFirm);
  registerSubclass(Client);
}

class SpecialBook extends Base {
  static {
    this._tableName = "books";
    this.belongsTo("author", { className: "SpecialAuthor" });
    this.hasOne("subscription", {
      className: "SpecialSubscription",
      foreignKey: "subscriber_id",
    });
    this.enum("status", { proposed: 0, written: 1, published: 2 });
  }
}
class SpecialAuthor extends Base {
  static {
    this._tableName = "authors";
    this.hasOne("book", { className: "SpecialBook", foreignKey: "author_id" });
  }
}
class SpecialSubscription extends Base {
  static {
    this._tableName = "subscriptions";
    this.belongsTo("book", { className: "SpecialBook" });
  }
}

class SpecialCar extends Base {
  static {
    this._tableName = "cars";
    this.hasOne("specialBulb", {
      inverseOf: "car",
      dependent: "destroy",
      className: "SpecialBulb",
      foreignKey: "car_id",
    });
  }
}
class SpecialBulb extends Base {
  static {
    this._tableName = "bulbs";
    this.belongsTo("car", { inverseOf: "specialBulb", touch: true, className: "SpecialCar" });
  }
}

describe("HasOneAssociationsTest", () => {
  const { companies, accounts, pirates, ships } = fixtures([
    "companies",
    "accounts",
    "developers",
    "projects",
    "ships",
    "pirates",
    "authors",
    "authorAddresses",
    "books",
  ]);

  beforeAll(async () => {
    registerCompanyModels();
    registerModel(Car);
    registerModel(Bulb);
    registerModel(Pirate);
    registerModel(DestructivePirate);
    registerModel(Ship);
    registerModel(Author);
    registerModel(Post);
    registerModel(Developer);
    registerModel(AuditLog);
    registerModel(Room);
    registerModel(User);
    registerModel("SpecialBook", SpecialBook);
    registerModel("SpecialAuthor", SpecialAuthor);
    registerModel("SpecialSubscription", SpecialSubscription);
    registerModel(Image);
    registerModel(Department);
    registerModel(Chef);
    registerModel(DrinkDesignerWithPolymorphicDependentNullifyChef);
    registerModel(CpkBook);
    registerModel(CpkOrder);
    registerModel(CpkOrderWithNullifiedBook);
    registerModel(CpkBrokenOrder);
    registerModel(CpkBrokenOrderWithNonCpkBooks);
    registerModel(CpkNonCpkBook);
    registerModel("SpecialCar", SpecialCar);
    registerModel("SpecialBulb", SpecialBulb);
    registerModel(Club);
    registerModel(Membership);
    registerModel(DrinkDesignerWithPolymorphicTouchChef);
    await Company.loadSchema();
    await Account.loadSchema();
    await Car.loadSchema();
    await Bulb.loadSchema();
    await Image.loadSchema();
    await Department.loadSchema();
    await Chef.loadSchema();
    await DrinkDesignerWithPolymorphicDependentNullifyChef.loadSchema();
    await CpkBook.loadSchema();
    await CpkOrderWithNullifiedBook.loadSchema();
    await Club.loadSchema();
    await Membership.loadSchema();
    await DrinkDesignerWithPolymorphicTouchChef.loadSchema();
  });

  beforeEach(() => {
    Account.destroyedAccountIds().clear();
  });

  it("has one", async () => {
    const firm = companies("first_firm") as any;
    const firstAccount = await Account.find(1);
    await assertQueriesMatch(/LIMIT|ROWNUM <=|FETCH FIRST/, undefined, false, async () => {
      const account = await readHasOne(firm, "account");
      expect(account.id).toBe(firstAccount.id);
      expect(account.credit_limit).toBe(firstAccount.credit_limit);
    });
  });

  it("has one does not use order by", async () => {
    const sqlLog = await captureSql(async () => {
      await readHasOne(companies("first_firm"), "account");
    });
    assert(
      sqlLog.every((sql) => !/order by/i.test(sql)),
      `ORDER BY was used in the query: ${sqlLog}`,
    );
  });

  it("has one cache nils", async () => {
    const firm = companies("another_firm") as any;
    await assertQueriesCount(1, false, async () => {
      expect(await readHasOne(firm, "account")).toBeNull();
    });
    await assertNoQueries(false, async () => {
      expect(await readHasOne(firm, "account")).toBeNull();
    });

    const firms = await Firm.includes(":account");
    await assertNoQueries(false, async () => {
      for (const f of firms) await readHasOne(f, "account");
    });
  });

  it("with select", async () => {
    expect(
      Object.keys((await readHasOne(await Firm.find(1), "accountWithSelect")).attributes).length,
    ).toBe(2);
    expect(
      Object.keys(
        (await readHasOne(await Firm.includes(":accountWithSelect").find(1), "accountWithSelect"))
          .attributes,
      ).length,
    ).toBe(2);
  });

  it("finding using primary key", async () => {
    const firm = companies("first_firm") as any;
    expect((await (Account as any).findByFirmId(firm.id))!.id).toBe(
      (await readHasOne(firm, "account")).id,
    );
    firm.firm_id = companies("rails_core").id;
    expect((await readHasOne(firm, "accountUsingPrimaryKey")).id).toBe(
      accounts("rails_core_account").id,
    );
  });

  it("update with foreign and primary keys", async () => {
    const firm = companies("first_firm") as any;
    const account = await readHasOne(firm, "accountUsingForeignAndPrimaryKeys");
    expect(account.id).toBe((await (Account as any).findByFirmName(firm.name))!.id);
    await firm.save();
    await firm.reload();
    expect((await readHasOne(firm, "accountUsingForeignAndPrimaryKeys")).id).toBe(account.id);
  });

  it.skip("can marshal has one association with nil target", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — marshal
  });

  it("proxy assignment", async () => {
    const company = companies("first_firm") as any;
    await assertNothingRaised(async () => company.setAccount(await readHasOne(company, "account")));
  });

  it("type mismatch", async () => {
    const firm = companies("first_firm") as any;
    await expect(firm.setAccount(1)).rejects.toThrow(AssociationTypeMismatch);
    const project = await (await import("../test-helpers/models/project.js")).Project.find(1);
    await expect(firm.setAccount(project)).rejects.toThrow(AssociationTypeMismatch);
  });

  it("natural assignment", async () => {
    const apple = await Firm.create({ name: "Apple" });
    const citibank = await Account.create({ credit_limit: 10 });
    await (apple as any).setAccount(citibank);
    expect((citibank as any).firm_id).toBe(Number(apple.id));
  });

  it("natural assignment to nil", async () => {
    const firm = companies("first_firm") as any;
    const oldAccountId = (await readHasOne(firm, "account")).id;
    await firm.setAccount(null);
    await firm.save();
    expect(await readHasOne(firm, "account")).toBeNull();
    await expect(Account.find(oldAccountId)).rejects.toThrow(RecordNotFound);
  });

  it("nullification on association change", async () => {
    const firm = companies("rails_core") as any;
    const oldAccountId = (await readHasOne(firm, "account")).id;
    await firm.setAccount(new Account({ credit_limit: 5 }));
    expect((await Account.find(oldAccountId)).firm_id).toBeNull();
  });

  it("nullify on polymorphic association", async () => {
    const department = await Department.create();
    const designer = await DrinkDesignerWithPolymorphicDependentNullifyChef.create();
    const chef = await (department as any).chefs.create({ employable: designer });

    expect(chef.employable_id).toBe(designer.id);
    expect(chef.employable_type).toBe((designer.constructor as typeof Base).name);

    await designer.destroy();
    await chef.reload();

    expect(chef.employable_id).toBeNull();
    expect(chef.employable_type).toBeNull();
  });

  it("nullification on destroyed association", async () => {
    const developer = await Developer.create({ name: "Someone" });
    const ship = await Ship.create({ name: "Planet Caravan", developer });
    await ship.destroy();
    assertNotPredicate(ship, (r) => r.isPersisted());
    assertNotPredicate(developer, (r) => r.isPersisted());
  });

  it("nullification on cpk association", async () => {
    const book = await CpkBook.create({ id: [1, 2] });
    const otherBook = await CpkBook.create({ id: [3, 4] });
    const order = await CpkOrderWithNullifiedBook.create({ book });

    await (order as any).setBook(otherBook);

    expect(book.order_id).toBeNull();
    expect(book.shop_id).toBeNull();
  });

  it("natural assignment to nil after destroy", async () => {
    const firm = companies("rails_core") as any;
    const account = await readHasOne(firm, "account");
    const oldAccountId = account.id;
    await account.destroy();
    await firm.setAccount(null);
    expect(await readHasOne(companies("rails_core"), "account")).toBeNull();
    await expect(Account.find(oldAccountId)).rejects.toThrow(RecordNotFound);
  });

  it("association change calls delete", async () => {
    const firm = companies("first_firm") as any;
    await firm.setDeletableAccount(new Account({ credit_limit: 5 }));
    expect(Account.destroyedAccountIds().get(firm.id) ?? []).toEqual([]);
  });

  it("association change calls destroy", async () => {
    const firm = companies("first_firm") as any;
    await firm.setAccount(new Account({ credit_limit: 5 }));
    expect(Account.destroyedAccountIds().get(firm.id) ?? []).toEqual([firm.id]);
  });

  it("natural assignment to already associated record", async () => {
    const company = companies("first_firm") as any;
    const account = accounts("signals37") as any;
    expect((await readHasOne(company, "account")).id).toBe(account.id);
    await company.setAccount(account);
    await company.reload();
    await account.reload();
    expect((await readHasOne(company, "account")).id).toBe(account.id);
  });

  it("dependence", async () => {
    const numAccounts = (await Account.count()) as number;
    const firm = (await Firm.find(1)) as any;
    expect(await readHasOne(firm, "account")).not.toBeNull();
    const accountId = (await readHasOne(firm, "account")).id;
    expect(Account.destroyedAccountIds().get(firm.id) ?? []).toEqual([]);
    await firm.destroy();
    expect(await Account.count()).toBe(numAccounts - 1);
    expect(Account.destroyedAccountIds().get(firm.id) ?? []).toEqual([accountId]);
  });

  it("direct destroy records destroyed account id via unloaded belongs_to", async () => {
    const account = (await Account.find(1)) as any;
    expect(account.association("firm").isLoaded()).toBe(false);
    const firm = (await Company.find(account.firm_id)) as any;
    expect(Account.destroyedAccountIds().get(firm.id) ?? []).toEqual([]);
    await account.destroy();
    expect(Account.destroyedAccountIds().get(firm.id) ?? []).toEqual([account.id]);
  });

  it("direct destroy only preloads the belongs_to the callback references", async () => {
    const account = (await Account.find(1)) as any;
    expect(account.association("firm").isLoaded()).toBe(false);
    expect(account.association("unautosavedFirm").isLoaded()).toBe(false);
    await assertQueriesMatch(/FROM\s+.?companies.?/i, 1, false, async () => {
      await account.destroy();
    });
  });

  it("exclusive dependence", async () => {
    const numAccounts = (await Account.count()) as number;
    const firm = (await ExclusivelyDependentFirm.find(9)) as any;
    expect(await readHasOne(firm, "account")).not.toBeNull();
    expect(Account.destroyedAccountIds().get(firm.id) ?? []).toEqual([]);
    await firm.destroy();
    expect(await Account.count()).toBe(numAccounts - 1);
    expect(Account.destroyedAccountIds().get(firm.id) ?? []).toEqual([]);
  });

  it("dependence with nil associate", async () => {
    const firm = new DependentFirm({ name: "nullify" });
    await (firm as any).saveBang();
    await assertNothingRaised(() => (firm as any).destroy());
  });

  it("restrict with exception", async () => {
    const firm = (await RestrictedWithExceptionFirm.create({ name: "restrict" })) as any;
    await firm.createAccount({ credit_limit: 10 });
    expect(await readHasOne(firm, "account")).not.toBeNull();

    await assertRaises([DeleteRestrictionError], {}, () => firm.destroy());
    assert(await RestrictedWithExceptionFirm.isExists({ name: "restrict" }));
    assertPredicate(await readHasOne(firm, "account"), isPresent);
  });

  it("restrict with error", async () => {
    const firm = (await RestrictedWithErrorFirm.create({ name: "restrict" })) as any;
    await firm.createAccount({ credit_limit: 10 });

    expect(await readHasOne(firm, "account")).not.toBeNull();

    await firm.destroy();

    assertNotEmpty(firm.errors);
    expect(firm.errors.messagesFor("base")[0]).toBe(
      "Cannot delete record because a dependent account exists",
    );
    assert(await RestrictedWithErrorFirm.isExists({ name: "restrict" }));
    assertPredicate(await readHasOne(firm, "account"), isPresent);
  });

  it("restrict with error with locale", async () => {
    I18n.backend().storeTranslations("en", {
      activerecord: { attributes: { restricted_with_error_firm: { account: "firm account" } } },
    });
    try {
      const firm = (await RestrictedWithErrorFirm.create({ name: "restrict" })) as any;
      await firm.createAccount({ credit_limit: 10 });
      expect(await readHasOne(firm, "account")).not.toBeNull();

      await firm.destroy();

      assertNotEmpty(firm.errors);
      expect(firm.errors.messagesFor("base")[0]).toBe(
        "Cannot delete record because a dependent firm account exists",
      );
      assert(await RestrictedWithErrorFirm.isExists({ name: "restrict" }));
      assertPredicate(await readHasOne(firm, "account"), isPresent);
    } finally {
      resetI18n();
    }
  });

  it("successful build association", async () => {
    const firm = new Firm({ name: "GlobalMegaCorp" });
    await (firm as any).save();
    const account = await (firm as any).buildAccount({ credit_limit: 1000 });
    expect(await account.save()).toBeTruthy();
    expect((await readHasOne(firm, "account")).id).toBe(account.id);
  });

  it("build association dont create transaction", async () => {
    const firm = new Firm();
    await assertQueriesCount(0, false, async () => {
      (firm as any).buildAccount();
    });
  });

  it("building the associated object with implicit sti base class", () => {
    const firm = new DependentFirm();
    const company = (firm as any).buildCompany();
    expect(company).toBeInstanceOf(Company);
  });

  it("building the associated object with explicit sti base class", () => {
    const firm = new DependentFirm();
    const company = (firm as any).buildCompany({ type: "Company" });
    expect(company).toBeInstanceOf(Company);
  });

  it("building the associated object with sti subclass", () => {
    const firm = new DependentFirm();
    const company = (firm as any).buildCompany({ type: "Client" });
    expect(company).toBeInstanceOf(Client);
  });

  it("building the associated object with an invalid type", () => {
    const firm = new DependentFirm();
    expect(() => (firm as any).buildCompany({ type: "Invalid" })).toThrow(SubclassNotFound);
  });

  it("building the associated object with an unrelated type", () => {
    const firm = new DependentFirm();
    expect(() => (firm as any).buildCompany({ type: "Account" })).toThrow(SubclassNotFound);
  });

  it("build and create should not happen within scope", async () => {
    const pirate = pirates("blackbeard") as any;
    const scope = pirate.association("fooBulb").scope().whereValuesHash();

    let bulb = await pirate.buildFooBulb();
    expect(bulb.scopeAfterInitialize.whereValuesHash()).not.toEqual(scope);

    bulb = await pirate.createFooBulb();
    expect(bulb.scopeAfterInitialize.whereValuesHash()).not.toEqual(scope);

    bulb = await pirate.createFooBulbBang();
    expect(bulb.scopeAfterInitialize.whereValuesHash()).not.toEqual(scope);
  });

  it("create association", async () => {
    const firm = await Firm.create({ name: "GlobalMegaCorp" });
    const account = await (firm as any).createAccount({ credit_limit: 1000 });
    await firm.reload();
    expect((await readHasOne(firm, "account")).id).toBe(account.id);
  });

  it("create over a loaded target nullifies the prior account", async () => {
    const company = (await Company.create({ name: "NewCo" })) as any;
    const original = await Account.create({ firm_id: Number(company.id), credit_limit: 50 });
    const found = (await Company.find(company.id)) as any;
    await readHasOne(found, "account");
    const created = await found.createAccount({ credit_limit: 70 });
    expect((await Account.find(original.id)).firm_id).toBeNull();
    expect(await Account.where({ firm_id: Number(company.id) }).count()).toBe(1);
    expect((await readHasOne(found, "account")).id).toBe(created.id);
  });

  it("create over a loaded target destroys the prior dependent account", async () => {
    const firm = companies("first_firm") as any;
    const originalId = (await readHasOne(firm, "account")).id;
    const created = await firm.createAccount({ credit_limit: 70 });
    await expect(Account.find(originalId)).rejects.toThrow(RecordNotFound);
    expect((await readHasOne(firm, "account")).id).toBe(created.id);
  });

  it("create over an unloaded target nullifies the prior account", async () => {
    const company = (await Company.create({ name: "UnloadedCo" })) as any;
    const original = await Account.create({ firm_id: Number(company.id), credit_limit: 50 });
    const found = (await Company.find(company.id)) as any;
    const created = await found.createAccount({ credit_limit: 70 });
    expect((await Account.find(original.id)).firm_id).toBeNull();
    expect(await Account.where({ firm_id: Number(company.id) }).count()).toBe(1);
    expect((await readHasOne(found, "account")).id).toBe(created.id);
  });

  it("create over an unloaded target destroys the prior dependent account", async () => {
    const firm = (await Firm.find(Number((companies("first_firm") as any).id))) as any;
    const originalId = Number((await Account.where({ firm_id: Number(firm.id) }).first())!.id);
    const created = await firm.createAccount({ credit_limit: 70 });
    await expect(Account.find(originalId)).rejects.toThrow(RecordNotFound);
    expect((await readHasOne(firm, "account")).id).toBe(created.id);
  });

  it("create re-raises a deferred target-load error after a successful build", async () => {
    const company = (await Company.create({ name: "DeferredLoadCo" })) as any;
    const found = (await Company.find(company.id)) as any;
    const association = found.association("account");
    expect(association.isLoaded()).toBe(false);
    const loadError = new Error("connection lost while loading the displaced target");
    vi.spyOn(association, "loadTargetForBuild").mockRejectedValue(loadError);

    await expect(found.createAccount({ credit_limit: 70 })).rejects.toBe(loadError);
    expect(await Account.where({ firm_id: Number(company.id) }).count()).toBe(1);
  });

  it("build over a loaded target nullifies the prior account", async () => {
    const company = (await Company.create({ name: "BuildCo" })) as any;
    const original = await Account.create({ firm_id: Number(company.id), credit_limit: 50 });
    const found = (await Company.find(company.id)) as any;
    await readHasOne(found, "account");
    const built = await found.buildAccount({ credit_limit: 70 });
    expect((await Account.find(original.id)).firm_id).toBeNull();
    expect(built.isPersisted()).toBe(false);
  });

  it("create when parent is new raises", async () => {
    const firm = new Firm();
    const error = await assertRaises([RecordNotSaved], {}, async () => {
      await (firm as any).createAccount();
    });

    expect((error as RecordNotSaved).message).toBe(
      "You cannot call create unless the parent is saved",
    );
    expect((error as RecordNotSaved).record).toBe(firm);
  });

  it("clearing an association clears the associations inverse", async () => {
    const author = (await Author.create({ name: "Jimmy Tolkien" })) as any;
    const post = await author.createPost({ title: "The silly medallion", body: "" });
    expect((await readHasOne(author, "post")).id).toBe(post.id);
    expect((await post.association("author").loadTarget()).id).toBe(author.id);

    await post.update({ author: null });
    expect(await post.association("author").loadTarget()).toBeNull();

    await author.update({ name: "J.R.R. Tolkien" });
    expect(await post.association("author").loadTarget()).toBeNull();
  });

  it("create association with bang", async () => {
    const firm = await Firm.create({ name: "GlobalMegaCorp" });
    const account = await (firm as any).createAccountBang({ credit_limit: 1000 });
    await firm.reload();
    expect((await readHasOne(firm, "account")).id).toBe(account.id);
  });

  it("create association with bang failing", async () => {
    const firm = await Firm.create({ name: "GlobalMegaCorp" });
    await expect((firm as any).createAccountBang()).rejects.toThrow(RecordInvalid);
    const account = await readHasOne(firm, "account");
    expect(account).not.toBeNull();
    account.credit_limit = 5;
    await account.save();
    await firm.reload();
    expect((await readHasOne(firm, "account")).id).toBe(account.id);
  });

  it("create with inexistent foreign key failing", async () => {
    const firm = await Firm.create({ name: "GlobalMegaCorp" });
    await expect((firm as any).createAccountWithInexistentForeignKey()).rejects.toThrow(
      UnknownAttributeError,
    );
  });

  it("reload association", async () => {
    const odegy = companies("odegy") as any;
    expect((await readHasOne(odegy, "account")).credit_limit).toBe(53);
    await Account.where({ id: (await readHasOne(odegy, "account")).id }).updateAll({
      credit_limit: 80,
    });
    expect((await readHasOne(odegy, "account")).credit_limit).toBe(53);
    await assertQueriesCount(1, false, async () => {
      await odegy.reloadAccount();
    });
    await assertNoQueries(false, async () => {
      void odegy.account;
    });
    expect((await readHasOne(odegy, "account")).credit_limit).toBe(80);
  });

  it("reload association with query cache", async () => {
    const odegyId = (companies("odegy") as any).id;

    const connection = (await Base.leaseConnection()) as any;
    connection.enableQueryCacheBang();
    connection.clearQueryCache();
    try {
      const odegy = (await Company.find(odegyId)) as any;
      await readHasOne(odegy, "account");

      expect(connection.queryCache!.size).toBe(2);

      await assertQueriesCount(1, false, async () => {
        await odegy.reloadAccount();
      });

      await assertQueriesCount(1, false, async () => {
        await Company.find(odegyId);
      });
    } finally {
      connection.disableQueryCacheBang();
    }
  });

  it("reset association", async () => {
    const odegy = companies("odegy") as any;
    expect((await readHasOne(odegy, "account")).credit_limit).toBe(53);
    await Account.where({ id: (await readHasOne(odegy, "account")).id }).updateAll({
      credit_limit: 80,
    });
    expect((await readHasOne(odegy, "account")).credit_limit).toBe(53);
    await assertNoQueries(false, async () => {
      odegy.resetAccount();
    });
    await assertQueriesCount(1, false, async () => {
      await readHasOne(odegy, "account");
    });
    expect((await readHasOne(odegy, "account")).credit_limit).toBe(80);
  });

  it("build", async () => {
    const firm = new Firm({ name: "GlobalMegaCorp" });
    await (firm as any).save();
    const account = new Account({ credit_limit: 1000 });
    await (firm as any).setAccount(account);
    expect((await readHasOne(firm, "account")).id).toBe(account.id ?? account.id);
    expect(await account.save()).toBeTruthy();
    await firm.reload();
    expect((await readHasOne(firm, "account")).id).toBe(account.id);
  });

  it("create", async () => {
    const firm = new Firm({ name: "GlobalMegaCorp" });
    await (firm as any).save();
    const account = await Account.create({ credit_limit: 1000 });
    await (firm as any).setAccount(account);
    expect((await readHasOne(firm, "account")).id).toBe(account.id);
  });

  it("create before save", async () => {
    const firm = new Firm({ name: "GlobalMegaCorp" });
    const account = await Account.create({ credit_limit: 1000 });
    await (firm as any).setAccount(account);
    await (firm as any).save();
    expect((await readHasOne(firm, "account")).id).toBe(account.id);
  });

  it("dependence with missing association", async () => {
    await Account.destroyAll();
    const firm = await Firm.find(1);
    expect(await readHasOne(firm, "account")).toBeNull();
    await firm.destroy();
  });

  it("dependence with missing association and nullify", async () => {
    await Account.destroyAll();
    const firm = (await DependentFirm.first()) as any;
    expect(await readHasOne(firm, "account")).toBeNull();
    await firm.destroy();
  });

  it("finding with interpolated condition", async () => {
    const firm = (await Firm.first()) as any;
    const superior = await firm.clients.create({ name: "SuperiorCo" });
    superior.rating = 10;
    await superior.save();
    const found = await firm.clientsWithInterpolatedConditions.first();
    expect(found.rating).toBe(10);
  });

  it("assignment before child saved", async () => {
    const firm = (await Firm.find(1)) as any;
    const a = new Account({ credit_limit: 1000 });
    await firm.association("account").writer(a);
    assertPredicate(a, (r) => r.isPersisted());
    expect((await readHasOne(firm, "account")).id).toBe(a.id);
    expect((await readHasOne(firm, "account")).id).toBe(a.id);
    await firm.association("account").reload();
    expect((await readHasOne(firm, "account")).id).toBe(a.id);
  });

  it("save still works after accessing nil has one", async () => {
    const jp = new Company({ name: "Jaded Pixel" });
    await readHasOne(jp, "dummyAccount");

    await assertNothingRaised(() => (jp as any).saveBang());
  });

  it("cant save readonly association", async () => {
    const firm = companies("first_firm") as any;
    await assertRaises([ReadOnlyRecord], {}, async () =>
      (await readHasOne(firm, "readonlyAccount")).saveBang(),
    );
    assertPredicate(await readHasOne(firm, "readonlyAccount"), (r: any) => r.isReadonly());
  });

  it.skip("has one proxy should not respond to private methods", () => {
    // PERMANENT-SKIP: Ruby private-method visibility has no TypeScript equivalent.
  });

  it.skip("has one proxy should respond to private methods via send", () => {
    // PERMANENT-SKIP: Ruby `send` private dispatch has no TypeScript equivalent.
  });

  it("save of record with loaded has one", async () => {
    const firm = companies("first_firm") as any;
    expect(await readHasOne(firm, "account")).not.toBeNull();

    await assertNothingRaised(async () => {
      await ((await Firm.find(firm.id)) as any).saveBang();
      await ((await Firm.includes(":account").find(firm.id)) as any).saveBang();
    });

    await (await readHasOne(firm, "account")).destroy();

    await assertNothingRaised(async () => {
      await ((await Firm.find(firm.id)) as any).saveBang();
      await ((await Firm.includes(":account").find(firm.id)) as any).saveBang();
    });
  });

  it("build respects hash condition", async () => {
    const firm = companies("first_firm") as any;
    const account = await firm.buildAccountLimit500WithHashConditions();
    expect(await account.save()).toBeTruthy();
    expect(account.credit_limit).toBe(500);
  });

  it("create respects hash condition", async () => {
    const firm = companies("first_firm") as any;
    const account = await firm.createAccountLimit500WithHashConditions();
    assertPredicate(account, (r: any) => r.isPersisted());
    expect(account.credit_limit).toBe(500);
  });

  it("attributes are being set when initialized from has one association with where clause", async () => {
    const newAccount = await (companies("first_firm") as any).buildAccount({
      firm_name: "Account",
    });
    expect(newAccount.firm_name).toBe("Account");
  });

  it("creation failure replaces existing without dependent option", async () => {
    const pirate = pirates("blackbeard") as any;
    const origShip = await readHasOne(pirate, "ship");

    expect(origShip.equals(ships("black_pearl"))).toBe(true);
    const newShip = await pirate.createShip();
    expect(newShip.equals(ships("black_pearl"))).not.toBe(true);
    expect((await readHasOne(pirate, "ship")).equals(newShip)).toBe(true);
    assertPredicate(newShip, (r: any) => r.isNewRecord());
    assert(await newShip.isInvalid());
    expect(origShip.pirate_id).toBeNull();
    assertNot(origShip.isChanged);
  });

  it("creation failure replaces existing with dependent option", async () => {
    const pirate = (pirates("blackbeard") as any).becomes(DestructivePirate);
    const origShip = await readHasOne(pirate, "dependentShip");

    const newShip = await pirate.createDependentShip();
    assertPredicate(newShip, (r: any) => r.isNewRecord());
    assert(await newShip.isInvalid());
    assertPredicate(origShip, (r: any) => r.isDestroyed());
  });

  it("creation failure due to new record should raise error", async () => {
    const pirate = pirates("redbeard") as any;
    const newShip = new Ship();

    const error: any = await assertRaises([RecordNotSaved], {}, async () => {
      await pirate.association("ship").writer(newShip);
    });

    expect(error.message).toBe("Failed to save the new associated ship.");
    expect(error.record).toBe(newShip);
    expect(await readHasOne(pirate, "ship")).toBeNull();
    expect(newShip.pirate_id).toBeNull();
  });

  it("replacement failure due to existing record should raise error", async () => {
    const pirate = pirates("blackbeard") as any;
    const currentShip = await readHasOne(pirate, "ship");
    currentShip.name = null;

    assertNot(await currentShip.isValid());
    const error: any = await assertRaises([RecordNotSaved], {}, async () => {
      await pirate.association("ship").writer(ships("interceptor"));
    });

    expect((await readHasOne(pirate, "ship")).equals(ships("black_pearl"))).toBe(true);
    expect((await readHasOne(pirate, "ship")).pirate_id).toBe(pirate.id);
    expect(error.message).toBe(
      "Failed to remove the existing associated ship. " +
        "The record failed to save after its foreign key was set to nil.",
    );
    expect(error.record).toBe(currentShip);
  });

  it("replacement failure due to new record should raise error", async () => {
    const pirate = pirates("blackbeard") as any;
    const newShip = new Ship();

    const error: any = await assertRaises([RecordNotSaved], {}, async () => {
      await pirate.association("ship").writer(newShip);
    });

    expect(error.message).toBe("Failed to save the new associated ship.");
    expect(error.record).toBe(newShip);
    expect((await readHasOne(pirate, "ship")).equals(ships("black_pearl"))).toBe(true);
    expect((await readHasOne(pirate, "ship")).pirate_id).toBe(pirate.id);
    expect((await ships("black_pearl").reload()).pirate_id).toBe(pirate.id);
    expect(newShip.pirate_id).toBeNull();
  });

  it("association keys bypass attribute protection", async () => {
    const car = (await Car.create({ name: "honda" })) as any;

    let bulb = await car.association("bulb").build();
    expect(bulb.car_id).toBe(Number(car.id));

    bulb = await car.association("bulb").build({ car_id: Number(car.id) + 1 });
    expect(bulb.car_id).toBe(Number(car.id));

    bulb = await car.association("bulb").create();
    expect(bulb.car_id).toBe(Number(car.id));

    bulb = await car.association("bulb").create({ car_id: Number(car.id) + 1 });
    expect(bulb.car_id).toBe(Number(car.id));
  });

  it("association protect foreign key", async () => {
    const pirate = await Pirate.create({ catchphrase: "Don' botharrr talkin' like one, savvy?" });
    let ship = await (pirate.association("ship") as any).build();
    expect(ship.pirate_id).toBe(Number(pirate.id));
    ship = await (pirate.association("ship") as any).build({ pirate_id: Number(pirate.id) + 1 });
    expect(ship.pirate_id).toBe(Number(pirate.id));
    ship = await (pirate.association("ship") as any).create({ name: "s1" });
    expect(ship.pirate_id).toBe(Number(pirate.id));
    ship = await (pirate.association("ship") as any).create({
      name: "s2",
      pirate_id: Number(pirate.id) + 1,
    });
    expect(ship.pirate_id).toBe(Number(pirate.id));
  });

  it("build with block", async () => {
    const car = (await Car.create({ name: "honda" })) as any;
    const bulb = await car.buildBulb(undefined, (b: any) => {
      b.color = "Red";
    });
    expect(bulb.color).toBe("RED!");
  });

  it("create with block", async () => {
    const car = (await Car.create({ name: "honda" })) as any;
    const bulb = await car.createBulb(undefined, (b: any) => {
      b.color = "Red";
    });
    expect(bulb.color).toBe("RED!");
  });

  it("create bang with block", async () => {
    const car = (await Car.create({ name: "honda" })) as any;
    const bulb = await car.createBulbBang(undefined, (b: any) => {
      b.color = "Red";
    });
    expect(bulb.color).toBe("RED!");
  });

  it("association attributes are available to after initialize", async () => {
    const car = (await Car.create({ name: "honda" })) as any;
    const bulb = await car.createBulb();
    expect(bulb.attributesAfterInitialize["car_id"]).toBe(Number(car.id));
  });

  it("has one transaction", async () => {
    const company = companies("first_firm") as any;
    const account = await Account.find(1);
    await readHasOne(company, "account");
    await assertNoQueries(false, async () => {
      await company.setAccount(account);
    });

    await company.association("account").writer(null);
    await assertNoQueries(false, async () => {
      await company.setAccount(null);
    });

    const account2 = await Account.find(2);
    await assertQueriesCount(3, false, async () => {
      await company.association("account").writer(account2);
    });

    await assertNoQueries(false, async () => {
      await (new Firm() as any).setAccount(account2);
    });
  });

  it("has one assignment dont trigger save on change of same object", async () => {
    const pirate = await Pirate.create({ catchphrase: "Don' botharrr talkin' like one, savvy?" });
    const ship = await (pirate.association("ship") as any).build({ name: "old name" });
    await ship.save();

    ship.name = "new name";
    assertPredicate(ship, (r: any) => r.isChanged);
    await assertQueriesCount(3, false, async () => {
      await (pirate as any).setShip(ship);
    });
    expect((await (pirate.association("ship") as any).forceReloadReader()).name).toBe("new name");
  });

  it("has one assignment triggers save on change on replacing object", async () => {
    const pirate = await Pirate.create({ catchphrase: "Don' botharrr talkin' like one, savvy?" });
    const ship = await (pirate.association("ship") as any).build({ name: "old name" });
    await ship.save();

    const newShip = await Ship.create({ name: "new name" });
    await assertQueriesCount(4, false, async () => {
      await (pirate as any).setShip(newShip);
    });
    expect((await (pirate.association("ship") as any).forceReloadReader()).name).toBe("new name");
  });

  it("has one loading for new record", async () => {
    const post = await Post.createBang({ author_id: 42, title: "foo", body: "bar" });
    const author = new Author({ id: 42 });
    expect((await readHasOne(author, "post")).id).toBe(post.id);
  });

  it("has one autosave with primary key manually set", async () => {
    const post = await Post.create({ id: 1234, title: "Some title", body: "Some content" });
    const author = new Author({ id: 33, name: "Hank Moody" });

    await (author as any).setPost(post);
    await (author as any).save();
    await author.reload();

    expect(await readHasOne(author, "post")).not.toBeNull();
    expect((await readHasOne(author, "post")).id).toBe(post.id);
  });

  it("has one relationship cannot have a counter cache", () => {
    class CcThingOwner extends Base {}
    expect(() => {
      Associations.hasOne.call(CcThingOwner, "thing", { counterCache: true } as any);
    }).toThrow(ArgumentError);
  });

  it("with polymorphic has one with custom columns name", async () => {
    const post = await Post.create({ title: "foo", body: "bar" });
    const image = await Image.create();

    await (post as any).setMainImage(image);
    await post.reload();

    const mainImage = await readHasOne(post, "mainImage");
    expect(mainImage.id).toBe(image.id);
    const imageable = await (image as any).imageable;
    expect(imageable.id).toBe(post.id);
  });

  it("dangerous association name raises ArgumentError", () => {
    for (const name of ["errors", "save"]) {
      class DangerFirm extends Base {}
      expect(() => {
        Associations.hasOne.call(DangerFirm, name, {});
      }).toThrow(ArgumentError);
    }
  });

  it("has one with touch option on create", async () => {
    await assertQueriesCount(5, false, async () => {
      await Club.create({ name: "1000 Oaks", membershipAttributes: { favorite: true } });
    });
  });

  it("polymorphic has one with touch option on create wont cache association so fetching after transaction commit works", async () => {
    await assertQueriesCount(6, false, async () => {
      const chef = await Chef.create({ employable: new DrinkDesignerWithPolymorphicTouchChef() });
      const employable = await chef.association("employable").loadTarget();
      expect((await readHasOne(employable, "chef")).id).toBe(chef.id);
    });
  });

  it("polymorphic has one with touch option on update will touch record by fetching from database if needed", async () => {
    await DrinkDesignerWithPolymorphicTouchChef.create({ chef: new Chef() });
    const designer = (await DrinkDesignerWithPolymorphicTouchChef.last()) as any;

    await assertQueriesCount(5, false, async () => {
      await designer.update({ name: "foo" });
    });
  });

  it("has one with touch option on update", async () => {
    const newClub = (await Club.create({ name: "1000 Oaks" })) as any;
    await newClub.createMembership();

    await assertQueriesCount(4, false, async () => {
      await newClub.update({ name: "Effingut" });
    });
  });

  it("has one with touch option on touch", async () => {
    const newClub = (await Club.create({ name: "1000 Oaks" })) as any;
    await newClub.createMembership();

    await assertQueriesCount(3, false, async () => {
      await newClub.touch();
    });
  });

  it("has one with touch option on destroy", async () => {
    const newClub = (await Club.create({ name: "1000 Oaks" })) as any;
    await newClub.createMembership();

    await assertQueriesCount(4, false, async () => {
      await newClub.destroy();
    });
  });

  it("has one with touch option on empty update", async () => {
    const newClub = (await Club.create({ name: "1000 Oaks" })) as any;
    await newClub.createMembership();

    await assertNoQueries(false, async () => {
      await newClub.save();
    });
  });

  it("has one with touch option on nonpersisted built associations doesnt update parent", async () => {
    const car = await (SpecialCar as any).create({ name: "honda" });
    await assertQueriesCount(1, false, async () => {
      await car.buildSpecialBulb();
      await car.buildSpecialBulb();
    });
  });

  it("has one double belongs to destroys both from either end", async () => {
    let landlord = await User.create({});
    let tenant = await User.create({});
    let room = await Room.create({ landlord, tenant });
    await (landlord as any).destroyBang();

    assertPredicate(room, (r: any) => r.isDestroyed());
    assertPredicate(landlord, (r: any) => r.isDestroyed());
    assertPredicate(tenant, (r: any) => r.isDestroyed());

    landlord = await User.create({});
    tenant = await User.create({});
    room = await Room.create({ landlord, tenant });
    await (tenant as any).destroyBang();

    assertPredicate(room, (r: any) => r.isDestroyed());
    assertPredicate(tenant, (r: any) => r.isDestroyed());
    assertPredicate(landlord, (r: any) => r.isDestroyed());
  });

  it("association enum works properly", async () => {
    const author = await (SpecialAuthor as any).createBang({ name: "Test" });
    const book = await (SpecialBook as any).createBang({ status: "published" });
    await author.setBook(book);

    expect(book.status).toBe("published");
    expect(
      await (SpecialAuthor as any)
        .joins(":book")
        .where({ books: { status: "published" } })
        .count(),
    ).not.toBe(0);
  });

  it("association enum works properly with nested join", async () => {
    const author = await (SpecialAuthor as any).createBang({ name: "Test" });
    const book = await (SpecialBook as any).createBang({ status: "published" });
    await author.setBook(book);

    const whereClause = { books: { subscriptions: { subscriber_id: null } } };
    await assertNothingRaised(() => {
      (SpecialAuthor as any).joins({ ":book": ":subscription" }).where().not(whereClause).toSql();
    });
  });

  it("destroyed_by_association set in child destroy callback on parent destroy", async () => {
    class DestroyByParentBook extends Base {
      static {
        this._tableName = "books";
        this.belongsTo("author", { className: "DestroyByParentAuthor" });
        this.beforeDestroy((record: any) => {
          if (!record.destroyedByAssociation) kernelThrow(":abort");
        });
      }
    }
    class DestroyByParentAuthor extends Base {
      static {
        this._tableName = "authors";
        this.hasOne("book", {
          className: "DestroyByParentBook",
          foreignKey: "author_id",
          dependent: "destroy",
        });
      }
    }
    registerModel("DestroyByParentBook", DestroyByParentBook);
    registerModel("DestroyByParentAuthor", DestroyByParentAuthor);
    const author = await DestroyByParentAuthor.create({ name: "Test" });
    const book = await (DestroyByParentBook as any).create({ author });
    await author.destroy();

    assertNot(await DestroyByParentBook.isExists(book.id));
  });

  it("destroyed_by_association set in child destroy callback on replace", async () => {
    class DbaReplBook extends Base {
      static {
        this._tableName = "books";
        this.belongsTo("author", { className: "DbaReplAuthor" });
        this.beforeDestroy((record: any) => {
          if (!record.destroyedByAssociation) kernelThrow(":abort");
        });
      }
    }
    class DbaReplAuthor extends Base {
      static {
        this._tableName = "authors";
        this.hasOne("book", {
          className: "DbaReplBook",
          foreignKey: "author_id",
          dependent: "destroy",
        });
      }
    }
    registerModel("DbaReplBook", DbaReplBook);
    registerModel("DbaReplAuthor", DbaReplAuthor);
    const author = await DbaReplAuthor.create({ name: "Test" });
    const book = await (DbaReplBook as any).create({ author });
    await (author.association("book") as any).loadTarget();
    await (author.association("book") as SingularAssociation).writer(
      await (DbaReplBook as any).create({}),
    );
    await author.save();

    assertNot(await DbaReplBook.isExists(book.id));
  });

  it("dependency should halt parent destruction", async () => {
    class UndestroyableBook extends Base {
      static {
        this._tableName = "books";
        this.belongsTo("author", { className: "DestroyableAuthor" });
        this.beforeDestroy(() => kernelThrow(":abort"));
      }
    }
    class DestroyableAuthor extends Base {
      static {
        this._tableName = "authors";
        this.hasOne("book", {
          className: "UndestroyableBook",
          foreignKey: "author_id",
          dependent: "destroy",
        });
      }
    }
    registerModel("UndestroyableBook", UndestroyableBook);
    registerModel("DestroyableAuthor", DestroyableAuthor);
    const author = await DestroyableAuthor.create({ name: "Test" });
    await (UndestroyableBook as any).create({ author });
    await assertNoDifference(
      [
        () => DestroyableAuthor.count() as Promise<number>,
        () => UndestroyableBook.count() as Promise<number>,
      ],
      null,
      async () => {
        assertNot(await author.destroy());
      },
    );
  });

  it("composite primary key malformed association class", async () => {
    registerModel(CpkBook);
    const order = new CpkBrokenOrder();
    const error = await assertRaises([CompositePrimaryKeyMismatchError], {}, () => {
      order.association("book");
    });

    expect(error.message).toBe(
      `Association CpkBrokenOrder#book primary key ["shop_id", "status"] doesn't match with foreign key broken_order_id. Please specify query_constraints, or primary_key and foreign_key values.`,
    );
  });

  it("composite primary key malformed association owner class", async () => {
    registerModel(CpkNonCpkBook);
    const order = new CpkBrokenOrderWithNonCpkBooks();
    const error = await assertRaises([CompositePrimaryKeyMismatchError], {}, () => {
      order.association("book");
    });

    expect(error.message).toBe(
      `Association CpkBrokenOrderWithNonCpkBooks#book primary key ["shop_id", "status"] doesn't match with foreign key broken_order_with_non_cpk_books_id. Please specify query_constraints, or primary_key and foreign_key values.`,
    );
  });
});

describe("AsyncHasOneAssociationsTest", () => {
  const { companies } = fixtures(["companies", "accounts"]);

  beforeAll(async () => {
    registerCompanyModels();
    await Company.loadSchema();
    await Account.loadSchema();
  });

  // BLOCKED: association-async-load-target-uses-async-executor
  it.skip("async load has one", async () => {
    const firm = companies("first_firm") as any;
    const firstAccount = await Account.find(1);

    await firm.association("account").asyncLoadTarget();

    const events: NotificationEvent[] = [];
    const callback = (event: NotificationEvent) => {
      if (event.payload.name !== "SCHEMA") events.push(event);
    };
    await Notifications.subscribed(callback, "sql.active_record", () =>
      readHasOne(firm, "account"),
    );

    await assertNoQueries(false, async () => {
      expect((await readHasOne(firm, "account")).id).toEqual(firstAccount.id);
      expect((await readHasOne(firm, "account")).credit_limit).toEqual(firstAccount.credit_limit);
    });

    expect(events.length).toEqual(1);
    expect(events[0].payload.async).toEqual(true);
  });
});
