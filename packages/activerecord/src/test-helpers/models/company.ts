// vendor/rails/activerecord/test/models/company.rb
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";
import { registerModel } from "../../associations.js";
import { Rollback } from "../../errors.js";
import { Base } from "../../base.js";

export class AbstractCompany extends Base {
  static {
    this.abstractClass = true;
  }
}

export class Company extends AbstractCompany {
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
}

export class SpecialCo extends Company {}

// Ruby: module Namespaced; class Company < ::Company; end; ...
export class NamespacedCompany extends Company {}

export class NamespacedFirm extends Company {
  static {
    // foreignKey explicit: JS class name NamespacedFirm would derive namespaced_firm_id,
    // but Rails demodulizes Namespaced::Firm → firm_id.
    this.hasMany("clients", { className: "Namespaced::Client", foreignKey: "firm_id" });
  }
}

export class NamespacedClient extends Company {}

export class Firm extends Company {
  _log: string[] = [];

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
      scope: (q: any) => q.where({ creditLimit: 500 }),
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
  static {
    this.hasMany("projects", { foreignKey: "firm_id" });
  }
}
acceptsNestedAttributesFor(Agency, "projects");

export class Client extends Company {
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

    this.validate(async function (this: Client) {
      await (this as any).firm;
    });

    this.beforeSave(async function (this: Client) {
      if (this.raiseOnSave) throw new Client.RaisedOnSave();
    });
    this.beforeSave(async function (this: Client) {
      if (this.throwOnSave) throw "abort";
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

export class SpecialClient extends Client {}

export class VerySpecialClient extends SpecialClient {}

export class NewlyContractedCompany extends Company {
  static {
    this.hasMany("newContracts", { foreignKey: "company_id" });

    this.beforeSave(async function (this: NewlyContractedCompany) {
      const { NewContract } = await import("./contract.js");
      (await (this as any).newContracts).push(new NewContract());
    });
  }
}

// Register Ruby-module-qualified names so cross-namespace className resolution works.
registerModel("Namespaced::Company", NamespacedCompany);
registerModel("Namespaced::Firm", NamespacedFirm);
registerModel("Namespaced::Client", NamespacedClient);
