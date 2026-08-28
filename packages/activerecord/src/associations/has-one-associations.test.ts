import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { ArgumentError, I18n, UnknownAttributeError } from "@blazetrails/activemodel";
import { throwAbort } from "@blazetrails/activesupport";
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
  assertNoQueriesMatch,
} from "../testing/query-assertions.js";

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
    await assertNoQueriesMatch(/order by/i, false, async () => {
      await readHasOne(companies("first_firm"), "account");
    });
  });

  it("has one cache nils", async () => {
    const firm = companies("another_firm") as any;
    await assertQueriesCount(1, false, async () => {
      expect(await readHasOne(firm, "account")).toBeNull();
    });
    await assertNoQueries(false, async () => {
      expect(await readHasOne(firm, "account")).toBeNull();
    });
  });

  it("with select", async () => {
    const firm = await Firm.find(1);
    const account = await readHasOne(firm, "accountWithSelect");
    expect(Object.keys(account.attributes).length).toBe(2);
  });

  it("finding using primary key", async () => {
    const firm = companies("first_firm") as any;
    const account = await readHasOne(firm, "account");
    expect(account.id).toBe((await Account.findBy({ firm_id: firm.id }))!.id);
  });

  it("update with foreign and primary keys", async () => {
    const firm = companies("first_firm") as any;
    const account = await readHasOne(firm, "accountUsingForeignAndPrimaryKeys");
    expect(account.id).toBe((await Account.findBy({ firm_name: firm.name }))!.id);
    await firm.save();
    await firm.reload();
    expect((await readHasOne(firm, "accountUsingForeignAndPrimaryKeys")).id).toBe(account.id);
  });

  it.skip("can marshal has one association with nil target", () => {});

  it("proxy assignment", async () => {
    const company = companies("first_firm") as any;
    const account = await readHasOne(company, "account");
    await expect(company.setAccount(account)).resolves.toBeUndefined();
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
    expect(ship.isPersisted()).toBe(false);
    expect(developer.isPersisted()).toBe(false);
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
    await (firm as any).save();
    await expect((firm as any).destroy()).resolves.toBeTruthy();
  });

  it("restrict with exception", async () => {
    const firm = (await RestrictedWithExceptionFirm.create({ name: "restrict" })) as any;
    await firm.createAccount({ credit_limit: 10 });
    expect(await readHasOne(firm, "account")).not.toBeNull();
    await expect(firm.destroy()).rejects.toThrow(DeleteRestrictionError);
    expect(await RestrictedWithExceptionFirm.exists({ name: "restrict" })).toBe(true);
    expect(await readHasOne(firm, "account")).not.toBeNull();
  });

  it("restrict with error", async () => {
    const firm = (await RestrictedWithErrorFirm.create({ name: "restrict" })) as any;
    await firm.createAccount({ credit_limit: 10 });
    expect(await readHasOne(firm, "account")).not.toBeNull();
    await firm.destroy();
    expect(firm.errors.where("base").length).toBeGreaterThan(0);
    expect(firm.errors.messagesFor("base")[0]).toBe(
      "Cannot delete record because a dependent account exists",
    );
    expect(await RestrictedWithErrorFirm.exists({ name: "restrict" })).toBe(true);
    expect(await readHasOne(firm, "account")).not.toBeNull();
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
      expect(firm.errors.where("base").length).toBeGreaterThan(0);
      expect(firm.errors.messagesFor("base")[0]).toBe(
        "Cannot delete record because a dependent firm account exists",
      );
      expect(await RestrictedWithErrorFirm.exists({ name: "restrict" })).toBe(true);
      expect(await readHasOne(firm, "account")).not.toBeNull();
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
    let error: unknown;
    try {
      await (firm as any).createAccount();
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(RecordNotSaved);
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
    expect(a.isPersisted()).toBe(true);
    expect((await readHasOne(firm, "account")).id).toBe(a.id);
    await firm.association("account").reload();
    expect((await readHasOne(firm, "account")).id).toBe(a.id);
  });

  it("save still works after accessing nil has one", async () => {
    const jp = new Company({ name: "Jaded Pixel" });
    expect(await readHasOne(jp, "dummyAccount")).toBeNull();
    await expect((jp as any).save()).resolves.toBeTruthy();
  });

  it("cant save readonly association", async () => {
    const firm = companies("first_firm") as any;
    const readonlyAccount = await readHasOne(firm, "readonlyAccount");
    await expect(readonlyAccount.saveBang()).rejects.toThrow(ReadOnlyRecord);
    expect((await readHasOne(firm, "readonlyAccount")).isReadonly()).toBe(true);
  });

  it.skip("has one proxy should not respond to private methods", () => {});

  it.skip("has one proxy should respond to private methods via send", () => {});

  it("save of record with loaded has one", async () => {
    const firm = companies("first_firm") as any;
    expect(await readHasOne(firm, "account")).not.toBeNull();
    await expect((await Firm.find(firm.id)).save()).resolves.toBeTruthy();
    await (await readHasOne(firm, "account")).destroy();
    await expect((await Firm.find(firm.id)).save()).resolves.toBeTruthy();
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
    expect(account.isPersisted()).toBe(true);
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
    expect(newShip.equals(ships("black_pearl"))).toBe(false);
    expect((await readHasOne(pirate, "ship")).equals(newShip)).toBe(true);
    expect(newShip.isNewRecord()).toBe(true);
    expect(await newShip.isInvalid()).toBe(true);
    expect(origShip.pirate_id).toBeNull();
    expect(origShip.isChanged).toBe(false);
  });

  it("creation failure replaces existing with dependent option", async () => {
    const pirate = (pirates("blackbeard") as any).becomes(DestructivePirate);
    const origShip = await readHasOne(pirate, "dependentShip");

    const newShip = await pirate.createDependentShip();
    expect(newShip.isNewRecord()).toBe(true);
    expect(await newShip.isInvalid()).toBe(true);
    expect(origShip.isDestroyed()).toBe(true);
  });

  it("creation failure due to new record should raise error", async () => {
    const pirate = pirates("redbeard") as any;
    const newShip = new Ship();

    let error: any;
    try {
      await pirate.association("ship").writer(newShip);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(RecordNotSaved);
    expect(error.message).toBe("Failed to save the new associated ship.");
    expect(error.record).toBe(newShip);
    expect(await readHasOne(pirate, "ship")).toBeNull();
    expect(newShip.pirate_id).toBeNull();
  });

  it("replacement failure due to existing record should raise error", async () => {
    const pirate = pirates("blackbeard") as any;
    const currentShip = await readHasOne(pirate, "ship");
    currentShip.name = null;

    expect(await currentShip.isValid()).toBe(false);
    let error: any;
    try {
      await pirate.association("ship").writer(ships("interceptor"));
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(RecordNotSaved);

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

    let error: any;
    try {
      await pirate.association("ship").writer(newShip);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(RecordNotSaved);

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
    expect(ship.isChanged).toBe(true);
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
    const imageable = await (image as any).loadBelongsTo("imageable");
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
    expect((room as any).isDestroyed()).toBe(true);
    expect((landlord as any).isDestroyed()).toBe(true);
    expect((tenant as any).isDestroyed()).toBe(true);

    landlord = await User.create({});
    tenant = await User.create({});
    room = await Room.create({ landlord, tenant });
    await (tenant as any).destroyBang();
    expect((room as any).isDestroyed()).toBe(true);
    expect((tenant as any).isDestroyed()).toBe(true);
    expect((landlord as any).isDestroyed()).toBe(true);
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
    const relation = (SpecialAuthor as any)
      .joins({ ":book": ":subscription" })
      .where()
      .not(whereClause);
    expect(typeof relation.toSql()).toBe("string");
  });

  it("destroyed_by_association set in child destroy callback on parent destroy", async () => {
    class DestroyByParentBook extends Base {
      static {
        this._tableName = "books";
        this.belongsTo("author", { className: "DestroyByParentAuthor" });
        this.beforeDestroy((record: any) => {
          if (!record.destroyedByAssociation) throwAbort();
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
    expect(await DestroyByParentBook.findBy({ id: book.id })).toBeNull();
  });

  it("destroyed_by_association set in child destroy callback on replace", async () => {
    class DbaReplBook extends Base {
      static {
        this._tableName = "books";
        this.belongsTo("author", { className: "DbaReplAuthor" });
        this.beforeDestroy((record: any) => {
          if (!record.destroyedByAssociation) throwAbort();
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
    (author.association("book") as any).writer(await (DbaReplBook as any).create({}));
    await author.save();
    expect(await DbaReplBook.findBy({ id: book.id })).toBeNull();
  });

  it("dependency should halt parent destruction", async () => {
    class UndestroyableBook extends Base {
      static {
        this._tableName = "books";
        this.belongsTo("author", { className: "DestroyableAuthor" });
        this.beforeDestroy(() => throwAbort());
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
    const authorCount = await DestroyableAuthor.count();
    const bookCount = await UndestroyableBook.count();
    expect(await author.destroy()).toBe(false);
    expect(await DestroyableAuthor.count()).toBe(authorCount);
    expect(await UndestroyableBook.count()).toBe(bookCount);
  });

  it("composite primary key malformed association class", () => {
    registerModel(CpkBook);
    const order = new CpkBrokenOrder();
    let error: Error | undefined;
    try {
      order.association("book");
    } catch (e) {
      error = e as Error;
    }
    expect(error).toBeInstanceOf(CompositePrimaryKeyMismatchError);
    expect(error?.message).toBe(
      `Association CpkBrokenOrder#book primary key ["shop_id", "status"] doesn't match with foreign key broken_order_id. Please specify query_constraints, or primary_key and foreign_key values.`,
    );
  });

  it("composite primary key malformed association owner class", () => {
    registerModel(CpkNonCpkBook);
    const order = new CpkBrokenOrderWithNonCpkBooks();
    let error: Error | undefined;
    try {
      order.association("book");
    } catch (e) {
      error = e as Error;
    }
    expect(error).toBeInstanceOf(CompositePrimaryKeyMismatchError);
    expect(error?.message).toBe(
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

  it("async load has one", async () => {
    const firm = companies("first_firm") as any;
    const firstAccount = await Account.find(1);
    await firm.association("account").loadTarget();
    const account = await readHasOne(firm, "account");
    expect(account.id).toBe(firstAccount.id);
    expect(account.credit_limit).toBe(firstAccount.credit_limit);
  });
});
