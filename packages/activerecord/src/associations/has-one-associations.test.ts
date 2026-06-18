/**
 * Mirrors vendor/rails/activerecord/test/cases/associations/has_one_associations_test.rb
 *
 * Canonical conversion (RFC 0019 canonical-schema-burndown): the bespoke
 * `firms`/`accounts`/`companies` tables and bespoke `Firm`/`Account` classes
 * have been replaced with the real Rails `Company`/`Firm`/`DependentFirm`/
 * `Account` models and the `companies`/`accounts` fixtures. No `defineSchema`.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import {
  Base,
  registerModel,
  enableSti,
  registerSubclass,
  SubclassNotFound,
  AssociationTypeMismatch,
  RecordNotFound,
  DeleteRestrictionError,
  RecordInvalid,
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
import { Bulb } from "../test-helpers/models/bulb.js";
import { Pirate } from "../test-helpers/models/pirate.js";
import { Ship } from "../test-helpers/models/ship.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { Developer } from "../test-helpers/models/developer.js";
import { Room } from "../test-helpers/models/room.js";
import { User } from "../test-helpers/models/user.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import {
  assertQueriesCount,
  assertNoQueries,
  assertQueriesMatch,
  assertNoQueriesMatch,
} from "../testing/query-assertions.js";

/** Load and return a singular association's target (Rails sync reader). */
async function readHasOne(owner: any, name: string): Promise<any> {
  return (await owner.association(name).loadTarget()) as any;
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
  enableSti(Company);
  registerSubclass(Firm);
  registerSubclass(DependentFirm);
  registerSubclass(ExclusivelyDependentFirm);
  registerSubclass(RestrictedWithExceptionFirm);
  registerSubclass(RestrictedWithErrorFirm);
  registerSubclass(Client);
}

// ==========================================================================
// HasOneAssociationsTest — mirrors has_one_associations_test.rb
// ==========================================================================
describe("HasOneAssociationsTest", () => {
  const { companies, accounts } = useHandlerFixtures([
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
    registerModel(Ship);
    registerModel(Author);
    registerModel(Post);
    registerModel(Developer);
    registerModel(Room);
    registerModel(User);
    await Company.loadSchema();
    await Account.loadSchema();
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
    expect(Object.keys((account as any).attributes).length).toBe(2);
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

  it.skip("can marshal has one association with nil target", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — marshal
  });

  it("proxy assignment", async () => {
    const company = companies("first_firm") as any;
    const account = await readHasOne(company, "account");
    expect(() => {
      company.account = account;
    }).not.toThrow();
  });

  it("type mismatch", async () => {
    const firm = companies("first_firm") as any;
    expect(() => {
      firm.account = 1;
    }).toThrow(AssociationTypeMismatch);
    const project = await (await import("../test-helpers/models/project.js")).Project.find(1);
    expect(() => {
      firm.account = project;
    }).toThrow(AssociationTypeMismatch);
  });

  it("natural assignment", async () => {
    const apple = await Firm.create({ name: "Apple" });
    const citibank = await Account.create({ credit_limit: 10 });
    (apple as any).account = citibank;
    expect((citibank as any).firm_id).toBe(apple.id);
  });

  it("natural assignment to nil", async () => {
    const firm = companies("first_firm") as any;
    const oldAccountId = (await readHasOne(firm, "account")).id;
    firm.account = null;
    await firm.save();
    expect(await readHasOne(firm, "account")).toBeNull();
    // account is dependent, therefore is destroyed when reference to owner is lost
    await expect(Account.find(oldAccountId)).rejects.toThrow(RecordNotFound);
  });

  it("nullification on association change", async () => {
    const firm = companies("rails_core") as any;
    const oldAccountId = (await readHasOne(firm, "account")).id;
    firm.account = new Account({ credit_limit: 5 });
    await firm.save();
    // account is dependent with nullify, therefore its firm_id should be nil
    expect((await Account.find(oldAccountId)).firm_id).toBeNull();
  });

  it.skip("nullify on polymorphic association", () => {
    // BLOCKED: polymorphic dependent: :nullify on Department/Chef/DrinkDesigner
    // (employable) — polymorphic has_one feature gap.
  });

  it.skip("nullification on destroyed association", () => {
    // BLOCKED: Developer.create triggers a before_create that builds an
    // `auditLogs` association whose `AuditLog` model is not ported/registered.
  });

  it.skip("nullification on cpk association", () => {
    // BLOCKED: Cpk::Book / Cpk::OrderWithNullifiedBook composite-PK has_one — gap.
  });

  it("natural assignment to nil after destroy", async () => {
    const firm = companies("rails_core") as any;
    const account = await readHasOne(firm, "account");
    const oldAccountId = account.id;
    await account.destroy();
    firm.account = null;
    expect(await readHasOne(companies("rails_core"), "account")).toBeNull();
    await expect(Account.find(oldAccountId)).rejects.toThrow(RecordNotFound);
  });

  it("association change calls delete", async () => {
    const firm = companies("first_firm") as any;
    firm.deletableAccount = new Account({ credit_limit: 5 });
    await firm.save();
    expect(Account.destroyedAccountIds().get(firm.id) ?? []).toEqual([]);
  });

  it.skip("association change calls destroy", () => {
    // BLOCKED: the displaced Account's `firm` belongs_to inverse is not set
    // during the has_one writer's dependent-destroy, so the Account
    // before_destroy can't record into `destroyed_account_ids`. Needs
    // automatic inverse_of detection between Firm#account and Account#firm.
  });

  it("natural assignment to already associated record", async () => {
    const company = companies("first_firm") as any;
    const account = accounts("signals37") as any;
    expect((await readHasOne(company, "account")).id).toBe(account.id);
    company.account = account;
    await company.reload();
    await account.reload();
    expect((await readHasOne(company, "account")).id).toBe(account.id);
  });

  it.skip("dependence", () => {
    // BLOCKED: the dependent-destroyed Account's `firm` belongs_to inverse is
    // not set during cascade, so the Account before_destroy can't record into
    // `destroyed_account_ids`. Needs automatic inverse_of detection between
    // Firm#account and Account#firm.
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

  it.skip("restrict with error with locale", () => {
    // BLOCKED: requires I18n backend translation lookup.
  });

  it("successful build association", async () => {
    const firm = new Firm({ name: "GlobalMegaCorp" });
    await (firm as any).save();
    const account = (firm as any).buildAccount({ credit_limit: 1000 });
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

  it.skip("build and create should not happen within scope", () => {
    // BLOCKED: pirate.build_foo_bulb scope_after_initialize — scope/unscope gap.
  });

  it("create association", async () => {
    const firm = await Firm.create({ name: "GlobalMegaCorp" });
    const account = await (firm as any).createAccount({ credit_limit: 1000 });
    await firm.reload();
    expect((await readHasOne(firm, "account")).id).toBe(account.id);
  });

  it.skip("clearing an association clears the associations inverse", () => {
    // BLOCKED: `post.update({ author: null })` does not nullify the belongs_to
    // foreign key — belongs_to association assignment via update is a gap.
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

  it.skip("create with inexistent foreign key failing", () => {
    // BLOCKED: building an Account through `account_with_inexistent_foreign_key`
    // does not raise UnknownAttributeError for the bad foreign key column.
  });

  it.skip("create when parent is new raises", () => {
    // BLOCKED: `create_account` on an unsaved parent does not raise
    // RecordNotSaved ("You cannot call create unless the parent is saved").
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

  it.skip("reload association with query cache", () => {
    // BLOCKED: requires connection query cache (enable_query_cache!).
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
    (firm as any).account = account;
    expect((await readHasOne(firm, "account")).id).toBe(account.id ?? account.id);
    expect(await account.save()).toBeTruthy();
    await firm.reload();
    expect((await readHasOne(firm, "account")).id).toBe(account.id);
  });

  it("create", async () => {
    const firm = new Firm({ name: "GlobalMegaCorp" });
    await (firm as any).save();
    const account = await Account.create({ credit_limit: 1000 });
    (firm as any).account = account;
    await firm.save();
    expect((await readHasOne(firm, "account")).id).toBe(account.id);
  });

  it("create before save", async () => {
    const firm = new Firm({ name: "GlobalMegaCorp" });
    const account = await Account.create({ credit_limit: 1000 });
    (firm as any).account = account;
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

  it.skip("finding with interpolated condition", () => {
    // BLOCKED: clients_with_interpolated_conditions uses runtime-interpolated scope.
  });

  it.skip("assignment before child saved", () => {
    // BLOCKED: trails defers has_one writer persistence to the owner's save,
    // so `firm.account = Account.new(...)` does not immediately persist the
    // child (Rails persists on assignment to a saved owner).
  });

  it("save still works after accessing nil has one", async () => {
    const jp = new Company({ name: "Jaded Pixel" });
    expect(await readHasOne(jp, "dummyAccount")).toBeNull();
    await expect((jp as any).save()).resolves.toBeTruthy();
  });

  it.skip("cant save readonly association", () => {
    // BLOCKED: readonly scope + ReadOnlyRecord enforcement on has_one — gap.
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
    await expect((await Firm.find(firm.id)).save()).resolves.toBeTruthy();
    await (await readHasOne(firm, "account")).destroy();
    await expect((await Firm.find(firm.id)).save()).resolves.toBeTruthy();
  });

  it("build respects hash condition", async () => {
    const firm = companies("first_firm") as any;
    const account = firm.buildAccountLimit500WithHashConditions();
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
    const newAccount = (companies("first_firm") as any).buildAccount({ firm_name: "Account" });
    expect(newAccount.firm_name).toBe("Account");
  });

  it.skip("creation failure replaces existing without dependent option", () => {
    // BLOCKED: pirate.create_ship validation-failure replacement — gap.
  });

  it.skip("creation failure replaces existing with dependent option", () => {
    // BLOCKED: becomes(DestructivePirate) + dependent replacement — gap.
  });

  it.skip("creation failure due to new record should raise error", () => {
    // BLOCKED: the RecordNotSaved is raised correctly, but the failed has_one
    // assignment leaves the invalid Ship cached as the target instead of
    // resetting `pirate.ship` to nil — post-failure target reset is a gap.
  });

  it.skip("replacement failure due to existing record should raise error", () => {
    // BLOCKED: replacement-failure error path on existing record — gap.
  });

  it.skip("replacement failure due to new record should raise error", () => {
    // BLOCKED: replacement-failure error path on new record — gap.
  });

  it.skip("association keys bypass attribute protection", () => {
    // BLOCKED: canonical Bulb after_create / color= callbacks call public
    // readAttribute/writeAttribute aliases that are declared but never assigned;
    // creating any Bulb throws. Tracked: canonical-bulb-public-attribute-accessors.
  });

  it("association protect foreign key", async () => {
    const pirate = await Pirate.create({ catchphrase: "Don' botharrr talkin' like one, savvy?" });
    let ship = (pirate.association("ship") as any).build();
    expect((ship as any).pirate_id).toBe(pirate.id);
    ship = (pirate.association("ship") as any).build({ pirate_id: (pirate.id as number) + 1 });
    expect((ship as any).pirate_id).toBe(pirate.id);
    ship = await (pirate.association("ship") as any).create({ name: "s1" });
    expect((ship as any).pirate_id).toBe(pirate.id);
    ship = await (pirate.association("ship") as any).create({
      name: "s2",
      pirate_id: (pirate.id as number) + 1,
    });
    expect((ship as any).pirate_id).toBe(pirate.id);
  });

  it.skip("build with block", () => {
    // BLOCKED: canonical Bulb color= callback gap (see association keys bypass).
  });

  it.skip("create with block", () => {
    // BLOCKED: canonical Bulb color= callback gap (see association keys bypass).
  });

  it.skip("create bang with block", () => {
    // BLOCKED: canonical Bulb color= callback gap (see association keys bypass).
  });

  it.skip("association attributes are available to after initialize", () => {
    // BLOCKED: canonical Bulb attributes_after_initialize gap.
  });

  it("has one transaction", async () => {
    const company = companies("first_firm") as any;
    const account = await Account.find(1);
    await readHasOne(company, "account"); // force loading
    await assertNoQueries(false, async () => {
      company.account = account;
    });
    company.account = null;
    await company.save();
    await assertNoQueries(false, async () => {
      company.account = null;
    });
  });

  it("has one assignment dont trigger save on change of same object", async () => {
    const pirate = await Pirate.create({ catchphrase: "Don' botharrr talkin' like one, savvy?" });
    const ship = (pirate.association("ship") as any).build({ name: "old name" });
    await ship.save();

    ship.name = "new name";
    expect((ship as any).changed).toBe(true);
    await assertQueriesCount(3, false, async () => {
      (pirate.association("ship") as any).writer(ship);
      await pirate.save();
    });
    expect((await (pirate.association("ship") as any).forceReloadReader()).name).toBe("new name");
  });

  it("has one assignment triggers save on change on replacing object", async () => {
    const pirate = await Pirate.create({ catchphrase: "Don' botharrr talkin' like one, savvy?" });
    const ship = (pirate.association("ship") as any).build({ name: "old name" });
    await ship.save();

    const newShip = await Ship.create({ name: "new name" });
    await assertQueriesCount(4, false, async () => {
      (pirate.association("ship") as any).writer(newShip);
      await pirate.save();
    });
    expect((await (pirate.association("ship") as any).forceReloadReader()).name).toBe("new name");
  });

  it.skip("has one autosave with primary key manually set", () => {
    // BLOCKED: manual-PK autosave on Author/Post — gap.
  });

  it.skip("has one loading for new record", () => {
    // BLOCKED: a new (unsaved) Author with a manually-set id does not load its
    // has_one post — has_one read on a new record short-circuits to null.
  });

  it("has one relationship cannot have a counter cache", () => {
    class CcThingOwner extends Base {}
    expect(() => {
      Associations.hasOne.call(CcThingOwner, "thing", { counterCache: true } as any);
    }).toThrow(ArgumentError);
  });

  it.skip("with polymorphic has one with custom columns name", () => {
    // BLOCKED: Image polymorphic has_one with custom column names — gap.
  });

  it("dangerous association name raises ArgumentError", () => {
    for (const name of ["errors", "save"]) {
      class DangerFirm extends Base {}
      expect(() => {
        Associations.hasOne.call(DangerFirm, name, {});
      }).toThrow(ArgumentError);
    }
  });

  it.skip("has one with touch option on create", () => {
    // BLOCKED: Club/Membership touch via nested attributes — query-count gap.
  });

  it.skip("polymorphic has one with touch option on create wont cache association so fetching after transaction commit works", () => {
    // BLOCKED: polymorphic touch + transaction commit — gap.
  });

  it.skip("polymorphic has one with touch option on update will touch record by fetching from database if needed", () => {
    // BLOCKED: polymorphic touch on update — gap.
  });

  it.skip("has one with touch option on update", () => {
    // BLOCKED: Club/Membership touch — query-count gap.
  });

  it.skip("has one with touch option on touch", () => {
    // BLOCKED: touch propagation chain — gap.
  });

  it.skip("has one with touch option on destroy", () => {
    // BLOCKED: Club/Membership touch on destroy — query-count gap.
  });

  it.skip("has one with touch option on empty update", () => {
    // BLOCKED: no-op save detection — gap.
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

  it.skip("association enum works properly", () => {
    // BLOCKED: SpecialBook enum + has_one join — gap.
  });

  it.skip("association enum works properly with nested join", () => {
    // BLOCKED: SpecialBook enum + nested join — gap.
  });

  // Mirrors Rails' DestroyByParentBook/DestroyByParentAuthor: the child aborts
  // its own destroy UNLESS destroyed_by_association is set.
  it("destroyed_by_association set in child destroy callback on parent destroy", async () => {
    class DestroyByParentBook extends Base {
      static {
        this._tableName = "books";
        this.belongsTo("author", { className: "DestroyByParentAuthor" });
        this.beforeDestroy((record: any) => {
          if (!record.destroyedByAssociation) return false;
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
          if (!record.destroyedByAssociation) return false;
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
        this.beforeDestroy(() => false);
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

  it.skip("composite primary key malformed association class", () => {
    // BLOCKED: Cpk::BrokenOrder CompositePrimaryKeyMismatchError — Cpk gap.
  });

  it.skip("composite primary key malformed association owner class", () => {
    // BLOCKED: Cpk::BrokenOrderWithNonCpkBooks mismatch error — Cpk gap.
  });
});

// ==========================================================================
// AsyncHasOneAssociationsTest — mirrors AsyncHasOneAssociationsTest
// ==========================================================================
describe("AsyncHasOneAssociationsTest", () => {
  const { companies } = useHandlerFixtures(["companies", "accounts"]);

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
