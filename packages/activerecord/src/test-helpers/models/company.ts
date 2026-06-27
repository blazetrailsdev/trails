import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Relation } from "../../relation.js";
import type { Account } from "./account.js";
import type { Comment } from "./comment.js";
import type { Contract } from "./contract.js";
import type { Developer } from "./developer.js";
import type { NewContract } from "./contract.js";
import type { Project } from "./project.js";
import type { SpecialContract } from "./contract.js";
import type { SpecialDeveloper } from "./developer.js";
import { throwAbort } from "@blazetrails/activesupport";
// vendor/rails/activerecord/test/models/company.rb
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";
import { registerModel } from "../../associations.js";
import { enableSti, registerSubclass } from "../../inheritance.js";
import { Rollback } from "../../errors.js";
import { Base } from "../../base.js";
import type { CollectionProxy } from "../../associations/collection-proxy.js";

export class AbstractCompany extends Base {
  static {
    this.abstractClass = true;
  }
}

export class Company extends AbstractCompany {
  declare isActive: () => boolean;
  declare activeBang: () => Promise<true>;
  declare static active: () => Relation<Company>;
  declare static notActive: () => Relation<Company>;
  declare isSuspended: () => boolean;
  declare suspendedBang: () => Promise<true>;
  declare static suspended: () => Relation<Company>;
  declare static notSuspended: () => Relation<Company>;
  declare account: Account | null;
  declare dummyAccount: Account | null;
  declare contracts: AssociationProxy<Contract>;
  declare developers: AssociationProxy<Developer>;
  declare specialContracts: AssociationProxy<SpecialContract>;
  declare specialDevelopers: AssociationProxy<SpecialDeveloper>;
  declare comments: AssociationProxy<Comment>;
  declare metadata: unknown | null;
  declare static ofFirstFirm: () => Relation<Company>;
  declare loadHasOne: ((name: "account") => Promise<Account | null>) &
    ((name: "dummyAccount") => Promise<Account | null>);
  declare account_id: number;
  declare client_of: bigint;
  declare description: string | null;
  declare firm_id: number;
  declare firm_name: string;
  declare name: string;
  declare rating: bigint | null;
  declare status: number | null;
  declare "type": string;

  static {
    this.sequenceName = "companies_nonstd_seq";

    this.enum("status", { active: 0, suspended: 1 });

    this.validatesPresenceOf("name");

    this.hasOne("account", { foreignKey: "firm_id" });
    this.hasOne("dummyAccount", { foreignKey: "firm_id", className: "Account" });
    this.hasMany("contracts");
    this.hasMany("developers", { through: "contracts" });
    this.hasMany("specialContracts", {
      scope: (q: any) => q.includes("specialDeveloper").whereNot({ "developers.id": null }),
    });
    this.hasMany("specialDevelopers", { through: "specialContracts" });
    this.hasMany("comments", { foreignKey: "company" });

    this.aliasAttribute("newName", "name");
    this.attribute("metadata", "json");

    this.scope("ofFirstFirm", (q: any) =>
      q.joins({ account: "firm" }).where({ "companies.id": 1 }),
    );
  }

  arbitraryMethod(): string {
    return "I am Jack's profound disappointment";
  }

  private privateMethod(): string {
    return "I am Jack's innermost fears and aspirations";
  }
}

export class SpecialCo extends Company {
  declare loadHasOne: ((name: "account") => Promise<Account | null>) &
    ((name: "dummyAccount") => Promise<Account | null>);
}

// Ruby: module Namespaced; class Company < ::Company; end; ...
// `moduleName` carries the Ruby module so `registerModel` derives the qualified
// "Namespaced::*" registry key for cross-namespace className resolution.
export class NamespacedCompany extends Company {
  declare loadHasOne: ((name: "account") => Promise<Account | null>) &
    ((name: "dummyAccount") => Promise<Account | null>);

  static moduleName = "Namespaced";
  static _demodulizedName = "Company";
}

export class NamespacedFirm extends Company {
  declare clients: AssociationProxy<NamespacedClient>;
  declare loadHasOne: ((name: "account") => Promise<Account | null>) &
    ((name: "dummyAccount") => Promise<Account | null>);

  static moduleName = "Namespaced";
  static _demodulizedName = "Firm";

  static {
    // foreignKey explicit: JS class name NamespacedFirm would derive namespaced_firm_id,
    // but Rails demodulizes Namespaced::Firm → firm_id.
    this.hasMany("clients", { className: "Namespaced::Client", foreignKey: "firm_id" });
  }
}

export class NamespacedClient extends Company {
  declare loadHasOne: ((name: "account") => Promise<Account | null>) &
    ((name: "dummyAccount") => Promise<Account | null>);

  static moduleName = "Namespaced";
  static _demodulizedName = "Client";
}

export class Firm extends Company {
  declare unsortedClients: AssociationProxy<Client>;
  declare unsortedClientsWithSymbol: AssociationProxy<Client>;
  declare clientsSortedDesc: AssociationProxy<Client>;
  declare clientsOfFirm: AssociationProxy<Client>;
  declare clientsOrderedByName: AssociationProxy<Client>;
  declare unvalidatedClientsOfFirm: AssociationProxy<Client>;
  declare dependentClientsOfFirm: AssociationProxy<Client>;
  declare exclusivelyDependentClientsOfFirm: AssociationProxy<Client>;
  declare limitedClients: AssociationProxy<Client>;
  declare clientsWithInterpolatedConditions: AssociationProxy<Client>;
  declare clientsLikeMs: AssociationProxy<Client>;
  declare clientsLikeMsWithHashConditions: AssociationProxy<Client>;
  declare plainClients: AssociationProxy<Client>;
  declare clientsUsingPrimaryKey: AssociationProxy<Client>;
  declare clientsUsingPrimaryKeyWithDeleteAll: AssociationProxy<Client>;
  declare clientsGroupedByFirmId: AssociationProxy<Client>;
  declare clientsGroupedByName: AssociationProxy<Client>;
  declare account: Account | null;
  declare unvalidatedAccount: Account | null;
  declare accountWithSelect: Account | null;
  declare readonlyAccount: Account | null;
  declare accountUsingPrimaryKey: Account | null;
  declare accountUsingForeignAndPrimaryKeys: Account | null;
  declare accountWithInexistentForeignKey: Account | null;
  declare deletableAccount: Account | null;
  declare client: Client | null;
  declare accountLimit500WithHashConditions: Account | null;
  declare unautosavedAccount: Account | null;
  declare accounts: AssociationProxy<Account>;
  declare unautosavedAccounts: AssociationProxy<Account>;
  declare associationWithReferences: AssociationProxy<Client>;
  declare developersWithSelect: AssociationProxy<Developer>;
  declare leadDeveloper: Developer | null;
  declare projects: AssociationProxy<Project>;
  declare loadHasOne: ((name: "account") => Promise<Account | null>) &
    ((name: "dummyAccount") => Promise<Account | null>) &
    ((name: "unvalidatedAccount") => Promise<Account | null>) &
    ((name: "accountWithSelect") => Promise<Account | null>) &
    ((name: "readonlyAccount") => Promise<Account | null>) &
    ((name: "accountUsingPrimaryKey") => Promise<Account | null>) &
    ((name: "accountUsingForeignAndPrimaryKeys") => Promise<Account | null>) &
    ((name: "accountWithInexistentForeignKey") => Promise<Account | null>) &
    ((name: "deletableAccount") => Promise<Account | null>) &
    ((name: "client") => Promise<Client | null>) &
    ((name: "accountLimit500WithHashConditions") => Promise<Account | null>) &
    ((name: "unautosavedAccount") => Promise<Account | null>) &
    ((name: "leadDeveloper") => Promise<Developer | null>);

  _log: string[] = [];
  declare clients: CollectionProxy<Client>;

  static {
    this.toParam("name");

    this.hasMany("clients", {
      scope: (q: any) => q.order("id"),
      dependent: "destroy",
      beforeRemove: (owner: any, record: any) => (owner as Firm).logBeforeRemove(record),
      afterRemove: (owner: any, record: any) => (owner as Firm).logAfterRemove(record),
    });
    this.hasMany("unsortedClients", { className: "Client" });
    this.hasMany("unsortedClientsWithSymbol", { className: "Client" });
    this.hasMany("clientsSortedDesc", {
      scope: (q: any) => q.order("id DESC"),
      className: "Client",
    });
    this.hasMany("clientsOfFirm", {
      scope: (q: any) => q.order("id"),
      className: "Client",
      inverseOf: "firm",
    });
    this.hasMany("clientsOrderedByName", {
      scope: (q: any) => q.order("name"),
      className: "Client",
    });
    this.hasMany("unvalidatedClientsOfFirm", {
      foreignKey: "client_of",
      className: "Client",
      validate: false,
    });
    this.hasMany("dependentClientsOfFirm", {
      scope: (q: any) => q.order("id"),
      foreignKey: "client_of",
      className: "Client",
      dependent: "destroy",
    });
    this.hasMany("exclusivelyDependentClientsOfFirm", {
      scope: (q: any) => q.order("id"),
      foreignKey: "client_of",
      className: "Client",
      dependent: "delete",
    });
    this.hasMany("limitedClients", { scope: (q: any) => q.limit(1), className: "Client" });
    this.hasMany("clientsWithInterpolatedConditions", {
      scope: (q: any, firm: any) => q.where(`rating > ${firm.rating}`),
      className: "Client",
    });
    this.hasMany("clientsLikeMs", {
      scope: (q: any) => q.where("name = 'Microsoft'").order("id"),
      className: "Client",
    });
    this.hasMany("clientsLikeMsWithHashConditions", {
      scope: (q: any) => q.where({ name: "Microsoft" }).order("id"),
      className: "Client",
    });
    this.hasMany("plainClients", { className: "Client" });
    this.hasMany("clientsUsingPrimaryKey", {
      className: "Client",
      primaryKey: "name",
      foreignKey: "firm_name",
    });
    this.hasMany("clientsUsingPrimaryKeyWithDeleteAll", {
      className: "Client",
      primaryKey: "name",
      foreignKey: "firm_name",
      dependent: "delete",
    });
    this.hasMany("clientsGroupedByFirmId", {
      scope: (q: any) => q.group("firm_id").select("firm_id"),
      className: "Client",
    });
    this.hasMany("clientsGroupedByName", {
      scope: (q: any) => q.group("name").select("name"),
      className: "Client",
    });

    this.hasOne("account", { foreignKey: "firm_id", dependent: "destroy", validate: true });
    this.hasOne("unvalidatedAccount", {
      foreignKey: "firm_id",
      className: "Account",
      validate: false,
    });
    this.hasOne("accountWithSelect", {
      scope: (q: any) => q.select("id, firm_id"),
      foreignKey: "firm_id",
      className: "Account",
    });
    this.hasOne("readonlyAccount", {
      scope: (q: any) => q.readonly(),
      foreignKey: "firm_id",
      className: "Account",
    });
    this.hasOne("accountUsingPrimaryKey", {
      scope: (q: any) => q.order("id"),
      primaryKey: "firm_id",
      className: "Account",
    });
    this.hasOne("accountUsingForeignAndPrimaryKeys", {
      foreignKey: "firm_name",
      primaryKey: "name",
      className: "Account",
    });
    this.hasOne("accountWithInexistentForeignKey", {
      className: "Account",
      foreignKey: "inexistent",
    });
    this.hasOne("deletableAccount", {
      foreignKey: "firm_id",
      className: "Account",
      dependent: "delete",
    });

    this.hasOne("client", { foreignKey: "client_of" });

    this.hasOne("accountLimit500WithHashConditions", {
      scope: (q: any) => q.where({ credit_limit: 500 }),
      foreignKey: "firm_id",
      className: "Account",
    });

    this.hasOne("unautosavedAccount", {
      foreignKey: "firm_id",
      className: "Account",
      autosave: false,
    });
    this.hasMany("accounts");
    this.hasMany("unautosavedAccounts", {
      foreignKey: "firm_id",
      className: "Account",
      autosave: false,
    });

    this.hasMany("associationWithReferences", {
      scope: (q: any) => q.references("foo"),
      className: "Client",
    });

    this.hasMany("developersWithSelect", {
      scope: (q: any) => q.select("id, name, first_name"),
      className: "Developer",
    });

    this.hasOne("leadDeveloper", { className: "Developer" });
    this.hasMany("projects");
  }

  get log(): string[] {
    return (this._log ??= []);
  }

  private logBeforeRemove(record: any): void {
    this.log.push(`before_remove${record.id}`);
  }

  private logAfterRemove(record: any): void {
    this.log.push(`after_remove${record.id}`);
  }
}

export class DependentFirm extends Company {
  declare account: Account | null;
  declare companies: AssociationProxy<Company>;
  declare company: Company | null;
  declare loadHasOne: ((name: "account") => Promise<Account | null>) &
    ((name: "dummyAccount") => Promise<Account | null>) &
    ((name: "company") => Promise<Company | null>);

  static {
    this.hasOne("account", {
      scope: (q: any) => q.order("id"),
      foreignKey: "firm_id",
      dependent: "nullify",
    });
    this.hasMany("companies", { foreignKey: "client_of", dependent: "nullify" });
    this.hasOne("company", { foreignKey: "client_of", dependent: "nullify" });
  }
}

export class RestrictedWithExceptionFirm extends Company {
  declare account: Account | null;
  declare companies: AssociationProxy<Company>;
  declare loadHasOne: ((name: "account") => Promise<Account | null>) &
    ((name: "dummyAccount") => Promise<Account | null>);

  static {
    this.hasOne("account", {
      scope: (q: any) => q.order("id"),
      foreignKey: "firm_id",
      dependent: "restrictWithException",
    });
    this.hasMany("companies", {
      scope: (q: any) => q.order("id"),
      foreignKey: "client_of",
      dependent: "restrictWithException",
    });
  }
}

export class RestrictedWithErrorFirm extends Company {
  declare account: Account | null;
  declare companies: AssociationProxy<Company>;
  declare loadHasOne: ((name: "account") => Promise<Account | null>) &
    ((name: "dummyAccount") => Promise<Account | null>);

  static {
    this.hasOne("account", {
      scope: (q: any) => q.order("id"),
      foreignKey: "firm_id",
      dependent: "restrictWithError",
    });
    this.hasMany("companies", {
      scope: (q: any) => q.order("id"),
      foreignKey: "client_of",
      dependent: "restrictWithError",
    });
  }
}

export class Agency extends Firm {
  declare loadHasOne: ((name: "account") => Promise<Account | null>) &
    ((name: "dummyAccount") => Promise<Account | null>) &
    ((name: "unvalidatedAccount") => Promise<Account | null>) &
    ((name: "accountWithSelect") => Promise<Account | null>) &
    ((name: "readonlyAccount") => Promise<Account | null>) &
    ((name: "accountUsingPrimaryKey") => Promise<Account | null>) &
    ((name: "accountUsingForeignAndPrimaryKeys") => Promise<Account | null>) &
    ((name: "accountWithInexistentForeignKey") => Promise<Account | null>) &
    ((name: "deletableAccount") => Promise<Account | null>) &
    ((name: "client") => Promise<Client | null>) &
    ((name: "accountLimit500WithHashConditions") => Promise<Account | null>) &
    ((name: "unautosavedAccount") => Promise<Account | null>) &
    ((name: "leadDeveloper") => Promise<Developer | null>);

  static {
    this.hasMany("projects", { foreignKey: "firm_id" });
  }
}
acceptsNestedAttributesFor(Agency, "projects");

export class Client extends Company {
  declare firm: Firm | null;
  declare firmWithBasicId: Firm | null;
  declare firmWithSelect: Firm | null;
  declare firmWithOtherName: Firm | null;
  declare firmWithCondition: Firm | null;
  declare firmWithPrimaryKey: Firm | null;
  declare firmWithPrimaryKeySymbols: Firm | null;
  declare readonlyFirm: Firm | null;
  declare bobFirm: Firm | null;
  declare accounts: AssociationProxy<Account>;
  declare account: Account | null;
  declare loadBelongsTo: ((name: "firm") => Promise<Firm | null>) &
    ((name: "firmWithBasicId") => Promise<Firm | null>) &
    ((name: "firmWithSelect") => Promise<Firm | null>) &
    ((name: "firmWithOtherName") => Promise<Firm | null>) &
    ((name: "firmWithCondition") => Promise<Firm | null>) &
    ((name: "firmWithPrimaryKey") => Promise<Firm | null>) &
    ((name: "firmWithPrimaryKeySymbols") => Promise<Firm | null>) &
    ((name: "readonlyFirm") => Promise<Firm | null>) &
    ((name: "bobFirm") => Promise<Firm | null>) &
    ((name: "account") => Promise<Account | null>);
  declare loadHasOne: ((name: "account") => Promise<Account | null>) &
    ((name: "dummyAccount") => Promise<Account | null>);

  raiseOnSave = false;
  throwOnSave = false;
  rollbackOnSave = false;
  rollbackOnCreateCalled = false;
  raiseOnDestroy = false;

  static destroyedClientIds: Map<number, number[]> = new Map();

  static {
    this.belongsTo("firm", { foreignKey: "client_of", inverseOf: "client" });
    this.belongsTo("firmWithBasicId", { className: "Firm", foreignKey: "firm_id" });
    this.belongsTo("firmWithSelect", {
      scope: (q: any) => q.select("id"),
      className: "Firm",
      foreignKey: "firm_id",
    });
    this.belongsTo("firmWithOtherName", { className: "Firm", foreignKey: "client_of" });
    this.belongsTo("firmWithCondition", {
      scope: (q: any) => q.where("1 = ?", 1),
      className: "Firm",
      foreignKey: "client_of",
    });
    this.belongsTo("firmWithPrimaryKey", {
      className: "Firm",
      primaryKey: "name",
      foreignKey: "firm_name",
    });
    this.belongsTo("firmWithPrimaryKeySymbols", {
      className: "Firm",
      primaryKey: "name",
      foreignKey: "firm_name",
    });
    this.belongsTo("readonlyFirm", {
      scope: (q: any) => q.readonly(),
      className: "Firm",
      foreignKey: "firm_id",
    });
    this.belongsTo("bobFirm", {
      scope: (q: any) => q.where({ name: "Bob" }),
      className: "Firm",
      foreignKey: "client_of",
    });
    this.hasMany("accounts", { through: "firm", source: "accounts" });
    this.belongsTo("account");

    // Rails `validate do firm end` (company.rb:153) synchronously references
    // the firm association and discards the result. The dotted `this.firm`
    // getter is the sync association reader, so the validate block stays sync.
    this.validate(function (this: Client) {
      void (this as { firm?: unknown }).firm;
    });

    this.beforeSave(async function (this: Client) {
      if (this.raiseOnSave) throw new Client.RaisedOnSave();
    });
    this.beforeSave(async function (this: Client) {
      if (this.throwOnSave) throwAbort();
    });
    this.afterSave(async function (this: Client) {
      if (this.rollbackOnSave) throw new Rollback();
    });
    this.afterRollback(
      async function (this: Client) {
        this.rollbackOnCreateCalled = true;
      },
      { on: "create" },
    );

    this.beforeDestroy(async function (this: Client) {
      if (this.raiseOnDestroy) throw new Client.RaisedOnDestroy();
    });
    this.beforeDestroy(async function (this: Client) {
      const firm = await (this as any).firm;
      if (firm) {
        const firmId = firm.id as number;
        if (!Client.destroyedClientIds.has(firmId)) Client.destroyedClientIds.set(firmId, []);
        Client.destroyedClientIds.get(firmId)!.push(this.id as number);
      }
    });
    this.beforeDestroy(function (this: Client) {
      this.overwriteToRaise();
    });
  }

  static RaisedOnSave = class extends Error {};
  static RaisedOnDestroy = class extends Error {};

  ratingQ(): boolean {
    return (this as any).queryAttribute("rating");
  }

  overwriteToRaise(): void {}
}

export class ExclusivelyDependentFirm extends Company {
  declare account: Account | null;
  declare dependentSanitizedConditionalClientsOfFirm: AssociationProxy<Client>;
  declare dependentHashConditionalClientsOfFirm: AssociationProxy<Client>;
  declare dependentConditionalClientsOfFirm: AssociationProxy<Client>;
  declare loadHasOne: ((name: "account") => Promise<Account | null>) &
    ((name: "dummyAccount") => Promise<Account | null>);

  static {
    this.hasOne("account", { foreignKey: "firm_id", dependent: "delete" });
    this.hasMany("dependentSanitizedConditionalClientsOfFirm", {
      scope: (q: any) => q.order("id").where("name = 'BigShot Inc.'"),
      foreignKey: "client_of",
      className: "Client",
      dependent: "delete",
    });
    this.hasMany("dependentHashConditionalClientsOfFirm", {
      scope: (q: any) => q.order("id").where({ name: "BigShot Inc." }),
      foreignKey: "client_of",
      className: "Client",
      dependent: "delete",
    });
    this.hasMany("dependentConditionalClientsOfFirm", {
      scope: (q: any) => q.order("id").where("name = ?", "BigShot Inc."),
      foreignKey: "client_of",
      className: "Client",
      dependent: "delete",
    });
  }
}

export class LargeClient extends Client {
  declare extraSize: number | null;
  declare loadBelongsTo: ((name: "firm") => Promise<Firm | null>) &
    ((name: "firmWithBasicId") => Promise<Firm | null>) &
    ((name: "firmWithSelect") => Promise<Firm | null>) &
    ((name: "firmWithOtherName") => Promise<Firm | null>) &
    ((name: "firmWithCondition") => Promise<Firm | null>) &
    ((name: "firmWithPrimaryKey") => Promise<Firm | null>) &
    ((name: "firmWithPrimaryKeySymbols") => Promise<Firm | null>) &
    ((name: "readonlyFirm") => Promise<Firm | null>) &
    ((name: "bobFirm") => Promise<Firm | null>) &
    ((name: "account") => Promise<Account | null>);
  declare loadHasOne: ((name: "account") => Promise<Account | null>) &
    ((name: "dummyAccount") => Promise<Account | null>);

  static {
    this.attribute("extraSize", "integer");
    this.afterInitialize(function (this: LargeClient) {
      this.setExtraSize();
    });
  }

  setExtraSize(): void {
    (this as any)["extraSize"] = 50;
  }
}

export class SpecialClient extends Client {
  declare loadBelongsTo: ((name: "firm") => Promise<Firm | null>) &
    ((name: "firmWithBasicId") => Promise<Firm | null>) &
    ((name: "firmWithSelect") => Promise<Firm | null>) &
    ((name: "firmWithOtherName") => Promise<Firm | null>) &
    ((name: "firmWithCondition") => Promise<Firm | null>) &
    ((name: "firmWithPrimaryKey") => Promise<Firm | null>) &
    ((name: "firmWithPrimaryKeySymbols") => Promise<Firm | null>) &
    ((name: "readonlyFirm") => Promise<Firm | null>) &
    ((name: "bobFirm") => Promise<Firm | null>) &
    ((name: "account") => Promise<Account | null>);
  declare loadHasOne: ((name: "account") => Promise<Account | null>) &
    ((name: "dummyAccount") => Promise<Account | null>);
}

export class VerySpecialClient extends SpecialClient {
  declare loadBelongsTo: ((name: "firm") => Promise<Firm | null>) &
    ((name: "firmWithBasicId") => Promise<Firm | null>) &
    ((name: "firmWithSelect") => Promise<Firm | null>) &
    ((name: "firmWithOtherName") => Promise<Firm | null>) &
    ((name: "firmWithCondition") => Promise<Firm | null>) &
    ((name: "firmWithPrimaryKey") => Promise<Firm | null>) &
    ((name: "firmWithPrimaryKeySymbols") => Promise<Firm | null>) &
    ((name: "readonlyFirm") => Promise<Firm | null>) &
    ((name: "bobFirm") => Promise<Firm | null>) &
    ((name: "account") => Promise<Account | null>);
  declare loadHasOne: ((name: "account") => Promise<Account | null>) &
    ((name: "dummyAccount") => Promise<Account | null>);
}

export class NewlyContractedCompany extends Company {
  declare newContracts: AssociationProxy<NewContract>;
  declare loadHasOne: ((name: "account") => Promise<Account | null>) &
    ((name: "dummyAccount") => Promise<Account | null>);

  static {
    this.hasMany("newContracts", { foreignKey: "company_id" });

    this.beforeSave(async function (this: NewlyContractedCompany) {
      const { NewContract } = await import("./contract.js");
      (await (this as any).newContracts).push(new NewContract());
    });
  }
}

for (const klass of [
  Company,
  AbstractCompany,
  SpecialCo,
  Firm,
  DependentFirm,
  RestrictedWithExceptionFirm,
  RestrictedWithErrorFirm,
  Agency,
  Client,
  ExclusivelyDependentFirm,
  LargeClient,
  SpecialClient,
  VerySpecialClient,
  NewlyContractedCompany,
]) {
  registerModel(klass);
}

// `registerModel` derives the qualified "Namespaced::*" registry key from each
// class's own `moduleName`, so cross-namespace className resolution works
// without hand-written `registerModel("Ruby::Name", …)` strings.
for (const klass of [NamespacedCompany, NamespacedFirm, NamespacedClient]) {
  registerModel(klass);
}

// Rails: companies.type column drives STI across the Company hierarchy
// (Firm/Client/etc.). enableSti scopes `Firm.all` to `WHERE type IN (...)`.
enableSti(Company);

// Track the STI subtree so registry-safe subclass resolution (STI dispatch at
// `new`, `descendants`) can find these classes through Company's own subtree
// rather than the global, bare-name model registry.
for (const klass of [
  SpecialCo,
  NamespacedCompany,
  NamespacedFirm,
  NamespacedClient,
  Firm,
  DependentFirm,
  RestrictedWithExceptionFirm,
  RestrictedWithErrorFirm,
  Agency,
  Client,
  ExclusivelyDependentFirm,
  LargeClient,
  SpecialClient,
  VerySpecialClient,
  NewlyContractedCompany,
]) {
  registerSubclass(klass);
}
