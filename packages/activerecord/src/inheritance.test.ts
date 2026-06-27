import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StringType, typeRegistry } from "@blazetrails/activemodel";
import { classify, underscore } from "@blazetrails/activesupport";
import { Base } from "./index.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import {
  stiName,
  isDescendsFromActiveRecord,
  isBaseClass,
  baseClass,
  registerSubclass,
} from "./inheritance.js";
import { registerModel } from "./associations.js";
import { SubclassNotFound, RecordNotFound, NotImplementedError, NameError } from "./errors.js";
import {
  AbstractCompany,
  Company,
  Firm,
  Client,
  NamespacedCompany,
  SpecialCo,
  SpecialClient,
  VerySpecialClient,
} from "./test-helpers/models/company.js";
import {
  Vegetable,
  Cucumber,
  Cabbage,
  GreenCabbage,
  KingCole,
  RedCabbage,
} from "./test-helpers/models/vegetables.js";
import { Subscriber, SpecialSubscriber } from "./test-helpers/models/subscriber.js";
import { SelectedMembership } from "./test-helpers/models/membership.js";
import {
  Post,
  SpecialPost,
  StiPost,
  SubStiPost,
  AbstractStiPost,
  SubAbstractStiPost,
} from "./test-helpers/models/post.js";
import {
  LoosePerson,
  LooseDescendant,
  TightPerson,
  TightDescendant,
} from "./test-helpers/models/person.js";
import { Account } from "./test-helpers/models/account.js";
import { Author } from "./test-helpers/models/author.js";
import { ShopProduct, ShopProductType } from "./test-helpers/models/shop.js";

describe("InheritanceTest", () => {
  const { companies } = useHandlerFixtures([
    "companies",
    "projects",
    "subscribers",
    "accounts",
    "vegetables",
    "memberships",
  ]);

  let _prevStoreFullStiClass: boolean;
  beforeEach(() => {
    _prevStoreFullStiClass = Base.storeFullStiClass;
  });
  afterEach(() => {
    Base.storeFullStiClass = _prevStoreFullStiClass;
  });

  it("class with store full sti class returns full name", () => {
    Base.storeFullStiClass = true;
    expect(stiName(NamespacedCompany)).toBe("Namespaced::Company");
  });

  it("class with blank sti name", async () => {
    let company = await Company.first();
    company = company!.dup() as typeof company;
    await company!.update({ type: "  " });
    company = await Company.find(company!.id);
    expect((company as any).type).toBe("  ");
  });

  it("class without store full sti class returns demodulized name", () => {
    Base.storeFullStiClass = false;
    expect(stiName(NamespacedCompany)).toBe("Company");
  });

  it.skip("compute type success", () => {
    // TRACKED-PENDING-CONVERGENCE: trails computeType enforces a subclass constraint
    // that Rails compute_type does not — cross-hierarchy lookup (e.g. Author from Company)
    // throws SubclassNotFound in trails. Story: compute-type-sibling-lookup (RFC 0019).
    expect(Company.computeType("Author")).toBe(Author);
  });

  it("compute type nonexistent constant", () => {
    expect(() => Company.computeType("NonexistentModel")).toThrow(NameError);
  });

  it.skip("compute type no method error", () => {
    // PERMANENT-SKIP: Ruby-only (scripts/api-compare/unported-files.ts) — ruby-module-semantics
    // Rails uses Object.autoload to trigger NoMethodError during require. JS has no autoload.
  });

  it.skip("compute type on undefined method", () => {
    // PERMANENT-SKIP: Ruby-only (scripts/api-compare/unported-files.ts) — ruby-module-semantics
    // Rails uses Object.autoload to trigger NameError during require. JS has no autoload.
  });

  it.skip("compute type argument error", () => {
    // PERMANENT-SKIP: Ruby-only (scripts/api-compare/unported-files.ts) — ruby-module-semantics
    // Rails uses Object.autoload to trigger ArgumentError during require. JS has no autoload.
  });

  it("should store demodulized class name with store full sti class option disabled", () => {
    Base.storeFullStiClass = false;
    const item = NamespacedCompany.new();
    expect((item as any)._readAttribute("type")).toBe("Company");
  });

  it("should store full class name with store full sti class option enabled", () => {
    Base.storeFullStiClass = true;
    const item = NamespacedCompany.new();
    expect((item as any)._readAttribute("type")).toBe("Namespaced::Company");
  });

  it("different namespace subclass should load correctly with store full sti class option", async () => {
    Base.storeFullStiClass = true;
    const item = await NamespacedCompany.create({ name: "Wolverine 2" });
    expect(await Company.find(item.id)).not.toBeNull();
    expect(await NamespacedCompany.find(item.id)).not.toBeNull();
  });

  it("descends from active record", async () => {
    // TRACKED-PENDING-CONVERGENCE: isDescendsFromActiveRecord(Base) returns true in trails
    // (no type attr → !classHasAttribute). AbstractStiPost/SubAbstractStiPost assertions also
    // require schema loaded. Story: descends-from-active-record-base (RFC 0019).
    expect(isDescendsFromActiveRecord(LoosePerson)).toBe(true);
    expect(isDescendsFromActiveRecord(LooseDescendant)).toBe(true);
    expect(isDescendsFromActiveRecord(TightPerson)).toBe(true);
    expect(isDescendsFromActiveRecord(TightDescendant)).toBe(true);
    expect(isDescendsFromActiveRecord(Post)).toBe(true);
    await Post.loadSchema();
    expect(isDescendsFromActiveRecord(StiPost)).toBe(false);
    expect(isDescendsFromActiveRecord(SubStiPost)).toBe(false);
    expect(isDescendsFromActiveRecord(AbstractStiPost)).toBe(false);
    expect(isDescendsFromActiveRecord(SubAbstractStiPost)).toBe(false);
  });

  it("company descends from active record", async () => {
    // TRACKED-PENDING-CONVERGENCE: isDescendsFromActiveRecord(Base) returns true in trails
    // (no type attr → !classHasAttribute); Story: descends-from-active-record-base (RFC 0019).
    expect(isDescendsFromActiveRecord(AbstractCompany)).toBe(true);
    expect(isDescendsFromActiveRecord(Company)).toBe(true);
    // Rails: assert_not Class.new(Company).descends_from_active_record? — an anonymous
    // subclass of Company is NOT a direct AR descendant once Company has the type col.
    await Company.loadSchema();
    class LocalCompanySubclass extends Company {}
    expect(isDescendsFromActiveRecord(LocalCompanySubclass)).toBe(false);
  });

  it("abstract class", () => {
    expect(Base.abstractClass).toBe(false);
    expect(LoosePerson.abstractClass).toBe(true);
    expect(LooseDescendant.abstractClass).toBe(false);
  });

  it("inheritance base class", () => {
    expect(baseClass.call(Post)).toBe(Post);
    expect(isBaseClass(Post)).toBe(true);
    expect(baseClass.call(SpecialPost)).toBe(Post);
    expect(isBaseClass(SpecialPost)).toBe(false);
    expect(baseClass.call(StiPost)).toBe(Post);
    expect(isBaseClass(StiPost)).toBe(false);
    expect(baseClass.call(SubStiPost)).toBe(Post);
    expect(isBaseClass(SubStiPost)).toBe(false);
    expect(baseClass.call(SubAbstractStiPost)).toBe(SubAbstractStiPost);
    expect(isBaseClass(SubAbstractStiPost)).toBe(true);
  });

  it("abstract inheritance base class", () => {
    expect(baseClass.call(LoosePerson)).toBe(LoosePerson);
    expect(isBaseClass(LoosePerson)).toBe(true);
    expect(baseClass.call(LooseDescendant)).toBe(LooseDescendant);
    expect(isBaseClass(LooseDescendant)).toBe(true);
    expect(baseClass.call(TightPerson)).toBe(TightPerson);
    expect(isBaseClass(TightPerson)).toBe(true);
    expect(baseClass.call(TightDescendant)).toBe(TightPerson);
    expect(isBaseClass(TightDescendant)).toBe(false);
  });

  it.skip("base class activerecord error", () => {
    // PERMANENT-SKIP: Ruby-only (scripts/api-compare/unported-files.ts) — ruby-module-semantics
    // Rails tests that `Class.new { include ActiveRecord::Inheritance }` raises ActiveRecordError.
    // JS has no equivalent of Ruby's module-inclusion hooks on an arbitrary class.
  });

  it("a bad type column", async () => {
    const firmRow = companies("first_firm");
    await Company.where({ id: firmRow.id }).updateAll("type = 'bad_class!'");
    await expect(Company.find(firmRow.id)).rejects.toThrow(SubclassNotFound);
  });

  it("inheritance find", async () => {
    expect(await Company.find(1)).toBeInstanceOf(Firm);
    expect(await Firm.find(1)).toBeInstanceOf(Firm);
    expect(await Company.find(2)).toBeInstanceOf(Client);
    expect(await Client.find(2)).toBeInstanceOf(Client);
  });

  it("alt inheritance find", async () => {
    expect(await Vegetable.find(1)).toBeInstanceOf(Cucumber);
    expect(await Cucumber.find(1)).toBeInstanceOf(Cucumber);
    expect(await Vegetable.find(2)).toBeInstanceOf(Cabbage);
    expect(await Cabbage.find(2)).toBeInstanceOf(Cabbage);
  });

  it("alt becomes works with sti", async () => {
    const vegetable = await Vegetable.find(1);
    expect(vegetable).toBeInstanceOf(Vegetable);
    const cabbage = vegetable.becomes(Cabbage);
    expect(cabbage).toBeInstanceOf(Cabbage);
  });

  it.skip("becomes sets variables before initialization callbacks", () => {
    // TRACKED-PENDING-CONVERGENCE: trails becomes() does not trigger afterInitialize
    // callbacks on the new instance; Rails calls initialize on the becomes() target class
    // so YellingVegetable.afterInitialize fires and upcases the name. Story:
    // becomes-after-initialize (RFC 0019).
  });

  it.skip("becomes and change tracking for inheritance columns", () => {
    // TRACKED-PENDING-CONVERGENCE: change tracking for custom inheritance columns (custom_type
    // on Vegetable) after becomes() is not yet implemented in trails. Story:
    // becomes-custom-type-change-tracking (RFC 0019).
  });

  it.skip("alt becomes bang resets inheritance type column", () => {
    // TRACKED-PENDING-CONVERGENCE: trails stores the base class name in the custom_type column
    // (e.g. "Vegetable") instead of NULL for a base-class instance; Rails stores NULL.
    // Story: becomes-custom-type-null-base (RFC 0019).
  });

  it("inheritance find all", async () => {
    const companies = await Company.all().order("id").toArray();
    expect(companies[0]).toBeInstanceOf(Firm);
    expect(companies[1]).toBeInstanceOf(Client);
  });

  it("alt inheritance find all", async () => {
    const veggies = await Vegetable.all().order("id").toArray();
    expect(veggies[0]).toBeInstanceOf(Cucumber);
    expect(veggies[1]).toBeInstanceOf(Cabbage);
  });

  it("inheritance save", async () => {
    const firm = Firm.new();
    (firm as any).name = "Next Angle";
    await firm.save();

    const nextAngle = await Company.find(firm.id);
    expect(nextAngle).toBeInstanceOf(Firm);
  });

  it("alt inheritance save", async () => {
    const cabbage = Cabbage.new({ name: "Savoy" });
    await cabbage.save();

    const savoy = await Vegetable.find(cabbage.id);
    expect(savoy).toBeInstanceOf(Cabbage);
  });

  it("inheritance new with default class", () => {
    const company = Company.new();
    expect(company.constructor).toBe(Company);
  });

  it("inheritance new with base class", () => {
    const company = Company.new({ type: "Company" });
    expect(company.constructor).toBe(Company);
  });

  it("inheritance new with subclass", () => {
    const firm = Company.new({ type: "Firm" });
    expect(firm.constructor).toBe(Firm);
  });

  it("where new with subclass", async () => {
    const firm = await Company.where({ type: "Firm" }).new();
    expect(firm.constructor).toBe(Firm);
  });

  it("where create with subclass", async () => {
    const firm = await Company.where({ type: "Firm" }).create({ name: "Basecamp" });
    expect(firm.constructor).toBe(Firm);
  });

  it("where create bang with subclass", async () => {
    const firm = await Company.where({ type: "Firm" }).createBang({ name: "Basecamp" });
    expect(firm.constructor).toBe(Firm);
  });

  it("new with abstract class", () => {
    expect(() => AbstractCompany.new()).toThrow(NotImplementedError);
    expect(() => AbstractCompany.new()).toThrow(
      "AbstractCompany is an abstract class and cannot be instantiated.",
    );
  });

  it.skip("new with ar base", () => {
    // TRACKED-PENDING-CONVERGENCE: in trails, Base.abstractClass is false (not an abstract
    // class), so Base.new() does not throw. Rails raises NotImplementedError for
    // ActiveRecord::Base.new. Story: base-class-new-abstract (RFC 0019).
  });

  it("new with invalid type", () => {
    expect(() => Company.new({ type: "InvalidType" })).toThrow(SubclassNotFound);
  });

  it("new with unrelated type", () => {
    expect(() => Company.new({ type: "Account" })).toThrow(SubclassNotFound);
  });

  it("where new with invalid type", () => {
    expect(() => Company.where({ type: "InvalidType" }).new()).toThrow(SubclassNotFound);
  });

  it("where new with unrelated type", () => {
    expect(() => Company.where({ type: "Account" }).new()).toThrow(SubclassNotFound);
  });

  it("where create with invalid type", async () => {
    await expect(Company.where({ type: "InvalidType" }).create()).rejects.toThrow(SubclassNotFound);
  });

  it("where create with unrelated type", async () => {
    await expect(Company.where({ type: "Account" }).create()).rejects.toThrow(SubclassNotFound);
  });

  it("where create bang with invalid type", async () => {
    await expect(Company.where({ type: "InvalidType" }).createBang()).rejects.toThrow(
      SubclassNotFound,
    );
  });

  it("where create bang with unrelated type", async () => {
    await expect(Company.where({ type: "Account" }).createBang()).rejects.toThrow(SubclassNotFound);
  });

  it("new with unrelated namespaced type", () => {
    Base.storeFullStiClass = false;
    expect(() => NamespacedCompany.new({ type: "Firm" })).toThrow(SubclassNotFound);
  });

  it("new with complex inheritance", () => {
    let error: unknown;
    try {
      Client.new({ type: "VerySpecialClient" });
    } catch (e) {
      error = e;
    }
    expect(error).toBeUndefined();
  });

  it("new without storing full sti class", () => {
    Base.storeFullStiClass = false;
    const item = Company.new({ type: "SpecialCo" });
    expect(item).toBeInstanceOf(SpecialCo);
  });

  it.skip("new with autoload paths", () => {
    // PERMANENT-SKIP: Ruby-only (scripts/api-compare/unported-files.ts) — ruby-module-semantics
    // Rails tests Zeitwerk autoloading of AR models at runtime. JS has no equivalent autoload hook.
  });

  it("inheritance condition", async () => {
    expect(await Company.count()).toBe(12);
    expect(await Firm.count()).toBe(3);
    expect(await Client.count()).toBe(5);
  });

  it("alt inheritance condition", async () => {
    expect(await Vegetable.count()).toBe(4);
    expect(await Cucumber.count()).toBe(1);
    expect(await Cabbage.count()).toBe(3);
  });

  it("finding incorrect type data", async () => {
    await expect(Firm.find(2)).rejects.toThrow(RecordNotFound);
    let error: unknown;
    try {
      await Firm.find(1);
    } catch (e) {
      error = e;
    }
    expect(error).toBeUndefined();
  });

  it("alt finding incorrect type data", async () => {
    await expect(Cucumber.find(2)).rejects.toThrow(RecordNotFound);
    let error: unknown;
    try {
      await Cucumber.find(1);
    } catch (e) {
      error = e;
    }
    expect(error).toBeUndefined();
  });

  it("update all within inheritance", async () => {
    await Client.updateAll({ name: "I am a client" });
    expect(((await Client.first()) as any).name).toBe("I am a client");
    expect(((await Firm.all().order("id").toArray())[0] as any).name).toBe("37signals");
  });

  it("alt update all within inheritance", async () => {
    await Cabbage.updateAll({ name: "the cabbage" });
    expect(((await Cabbage.first()) as any).name).toBe("the cabbage");
    const cucumberNames = (await Cucumber.all().toArray()).map((v: any) => v.name);
    expect([...new Set(cucumberNames)]).toEqual(["my cucumber"]);
  });

  it("destroy all within inheritance", async () => {
    await Client.destroyAll();
    expect(await Client.count()).toBe(0);
    expect(await Firm.count()).toBe(3);
  });

  it("alt destroy all within inheritance", async () => {
    await Cabbage.destroyAll();
    expect(await Cabbage.count()).toBe(0);
    expect(await Cucumber.count()).toBe(1);
  });

  it("find first within inheritance", async () => {
    expect(await Company.where({ name: "37signals" }).first()).toBeInstanceOf(Firm);
    expect(await Firm.where({ name: "37signals" }).first()).toBeInstanceOf(Firm);
    expect(await Client.where({ name: "37signals" }).first()).toBeNull();
  });

  it("alt find first within inheritance", async () => {
    expect(await Vegetable.where({ name: "his cabbage" }).first()).toBeInstanceOf(Cabbage);
    expect(await Cabbage.where({ name: "his cabbage" }).first()).toBeInstanceOf(Cabbage);
    expect(await Cucumber.where({ name: "his cabbage" }).first()).toBeNull();
  });

  it("complex inheritance", async () => {
    const verySpecialClient = await VerySpecialClient.create({ name: "veryspecial" });
    expect((await VerySpecialClient.where({ name: "veryspecial" }).first())?.id).toBe(
      verySpecialClient.id,
    );
    expect((await SpecialClient.where({ name: "veryspecial" }).first())?.id).toBe(
      verySpecialClient.id,
    );
    expect((await Company.where({ name: "veryspecial" }).first())?.id).toBe(verySpecialClient.id);
    expect((await Client.where({ name: "veryspecial" }).first())?.id).toBe(verySpecialClient.id);
    expect((await Client.where({ name: "Summit" }).toArray()).length).toBe(1);
    expect((await Client.find(verySpecialClient.id))?.id).toBe(verySpecialClient.id);
  });

  it("alt complex inheritance", async () => {
    const kingCole = await KingCole.create({ name: "uniform heads" });
    expect((await KingCole.where({ name: "uniform heads" }).first())?.id).toBe(kingCole.id);
    expect((await GreenCabbage.where({ name: "uniform heads" }).first())?.id).toBe(kingCole.id);
    expect((await Cabbage.where({ name: "uniform heads" }).first())?.id).toBe(kingCole.id);
    expect((await Vegetable.where({ name: "uniform heads" }).first())?.id).toBe(kingCole.id);
    expect((await Cabbage.where({ name: "his cabbage" }).toArray()).length).toBe(1);
    expect((await Cabbage.find(kingCole.id))?.id).toBe(kingCole.id);
  });

  it("eager load belongs to something inherited", async () => {
    const account = await Account.includes("firm").find(1);
    expect(account.association("firm").loaded).toBe(true);
  });

  it("alt eager loading", async () => {
    const cabbage = await RedCabbage.includes("seller").find(4);
    expect(cabbage.association("seller").loaded).toBe(true);
  });

  it("eager load belongs to primary key quoting", async () => {
    let error: unknown;
    try {
      await Account.includes("firm").find(1);
    } catch (e) {
      error = e;
    }
    expect(error).toBeUndefined();
  });

  it("inherits custom primary key", () => {
    expect(Subscriber.primaryKey).toBe(SpecialSubscriber.primaryKey);
  });

  it("inheritance without mapping", async () => {
    expect(await SpecialSubscriber.find("webster132")).toBeInstanceOf(SpecialSubscriber);
    let error: unknown;
    try {
      const s = SpecialSubscriber.new({ name: "And breaaaaathe!" });
      (s as any).id = "roger";
      await s.save();
    } catch (e) {
      error = e;
    }
    expect(error).toBeUndefined();
  });

  it.skip("scope inherited properly", () => {
    // TRACKED-PENDING-CONVERGENCE: trails' join implementation does not yet support
    // nested association paths ({ account: "firm" }). The ofFirstFirm scope uses
    // q.joins({ account: "firm" }) which throws ArgumentError in trails.
    // Story: scope-inherited-nested-join (RFC 0019).
  });

  it("inheritance with default scope", async () => {
    expect(await SelectedMembership.count()).toBe(1);
  });
});

describe("InheritanceComputeTypeTest", () => {
  useHandlerFixtures(["companies"]);

  it.skip("instantiation doesnt try to require corresponding file", () => {
    // PERMANENT-SKIP: Ruby-only (scripts/api-compare/unported-files.ts) — ruby-module-semantics
    // Rails tests Ruby's constant-lookup / autoload integration: a type stored in the DB without
    // a matching top-level constant raises RecordNotFound (WHERE type IN omits it), then after
    // `self.class.const_set` raises SubclassNotFound, then `Firm.const_set` resolves correctly.
    // JS has no equivalent of Ruby's const_missing / autoload hooks.
  });

  it("sti type from attributes disabled in non sti class", async () => {
    const phone = ShopProductType.new({ name: "Phone" });
    const product = ShopProduct.new({ type: phone } as Record<string, unknown>);
    let error: unknown;
    try {
      await product.save();
    } catch (e) {
      error = e;
    }
    expect(error).toBeUndefined();
  });

  it.skip("inheritance new with subclass as default", () => {
    // PERMANENT-SKIP: requires DDL (change_column_default) at runtime.
    // Rails uses connection.change_column_default + reset_column_information to set a column
    // default mid-test. Trails does not support live DDL column-default changes in tests.
  });
});

describe("InheritanceAttributeTest", () => {
  useHandlerFixtures(["companies"]);

  // Local test classes mapping to the companies table with a type-attribute default.
  // Rails uses module-scoped class names ("InheritanceAttributeTest::Startup"); trails uses
  // JS class names since there is no Ruby module nesting in TypeScript.
  class AttrTestCompany extends Base {
    static {
      this.tableName = "companies";
      this.attribute("type", "string", { default: "AttrTestStartup" });
    }
  }
  class AttrTestStartup extends AttrTestCompany {}
  class AttrTestEmpire extends AttrTestCompany {}

  registerModel([AttrTestCompany, AttrTestStartup, AttrTestEmpire]);
  registerSubclass(AttrTestStartup);
  registerSubclass(AttrTestEmpire);

  it("inheritance new with subclass as default", () => {
    const startup = AttrTestCompany.new();
    expect((startup as any).type).toBe("AttrTestStartup");
    expect(startup).toBeInstanceOf(AttrTestStartup);

    const empire = AttrTestCompany.new({ type: "AttrTestEmpire" });
    expect((empire as any).type).toBe("AttrTestEmpire");
    expect(empire).toBeInstanceOf(AttrTestEmpire);
  });
});

describe("InheritanceAttributeMappingTest", () => {
  useHandlerFixtures(["companies", "sponsors"]);

  // Rails: ActiveRecord::Type::String subclass that round-trips type names through
  // "omg_<underscored>" serialization. Registered once at module evaluation time.
  class OmgStiType extends StringType {
    protected override castValue(value: unknown): string | null {
      if (typeof value === "string") {
        const m = value.match(/^omg_(.+)$/);
        if (m) return classify(m[1]);
      }
      return super.castValue(value);
    }

    override serialize(value: unknown): unknown {
      if (value && typeof value === "string") {
        return `omg_${underscore(value)}`;
      }
      return null;
    }
  }
  typeRegistry.register("omg_sti", () => new OmgStiType());

  class IamtCompany extends Base {
    static {
      this.tableName = "companies";
      this.attribute("type", "omg_sti");
    }
  }
  class IamtStartup extends IamtCompany {}
  class IamtEmpire extends IamtCompany {}

  registerModel([IamtCompany, IamtStartup, IamtEmpire]);
  registerSubclass(IamtStartup);
  registerSubclass(IamtEmpire);

  class IamtSponsor extends Base {
    declare sponsorable: Base | null;

    static {
      this.tableName = "sponsors";
      this.attribute("sponsorable_type", "omg_sti");
      this.belongsTo("sponsorable", { polymorphic: true });
    }
  }
  registerModel(IamtSponsor);

  beforeEach(async () => {
    await IamtCompany.deleteAll();
    await IamtSponsor.deleteAll();
  });

  it("sti with custom type", async () => {
    await IamtStartup.create({ name: "a Startup" });
    await IamtEmpire.create({ name: "an Empire" });

    const rawRows = (
      await Base.connection.selectAll("SELECT name, type FROM companies ORDER BY id")
    ).toArray() as Array<{ name: string; type: string }>;
    expect(rawRows[0]).toMatchObject({
      name: "a Startup",
      type: `omg_${underscore("IamtStartup")}`,
    });
    expect(rawRows[1]).toMatchObject({
      name: "an Empire",
      type: `omg_${underscore("IamtEmpire")}`,
    });

    const modelPairs = (await IamtCompany.all().toArray())
      .map((a: any) => [a.name, a.type])
      .sort() as Array<[string, string]>;
    expect(modelPairs[0]).toEqual(["a Startup", "IamtStartup"]);
    expect(modelPairs[1]).toEqual(["an Empire", "IamtEmpire"]);

    const startup = await IamtStartup.first();
    const startupAsEmpire = startup!.becomesBang(IamtEmpire);
    await startupAsEmpire.save();

    const afterPairs = (await IamtCompany.all().toArray())
      .map((a: any) => [a.name, a.type])
      .sort() as Array<[string, string]>;
    expect(afterPairs[0]).toEqual(["a Startup", "IamtEmpire"]);
    expect(afterPairs[1]).toEqual(["an Empire", "IamtEmpire"]);
  });

  it("polymorphic associations custom type", async () => {
    const startup = await IamtStartup.create({ name: "a Startup" });
    const sponsor = await IamtSponsor.create({ sponsorable: startup });

    const rawTypes = (await Base.connection.selectValues(
      "SELECT sponsorable_type FROM sponsors",
    )) as string[];
    expect(rawTypes[0]).toMatch(/^omg_/);

    const reloaded = await IamtSponsor.includes("sponsorable").find(sponsor.id);
    expect((reloaded as any).sponsorable?.id).toBe(startup.id);
  });
});
