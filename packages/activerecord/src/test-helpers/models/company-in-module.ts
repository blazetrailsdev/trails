import type { AssociationProxy } from "../../associations/collection-proxy.js";
import { registerModel } from "../../associations.js";
import { Base } from "../../base.js";
import { Module, Range, registerConstant } from "@blazetrails/ruby-compat";

registerConstant("MyApplication", new Module());
registerConstant("MyApplication::Business", new Module());
registerConstant(
  "MyApplication::Business::Prefixed",
  Object.assign(new Module(), { tableNamePrefix: "prefixed_" }),
);
registerConstant("MyApplication::Business::Prefixed::Nested", new Module());
registerConstant(
  "MyApplication::Business::Suffixed",
  Object.assign(new Module(), { tableNameSuffix: "_suffixed" }),
);
registerConstant("MyApplication::Business::Suffixed::Nested", new Module());
registerConstant("MyApplication::Billing", new Module());
registerConstant("MyApplication::Billing::Nested", new Module());

export class MyAppBusinessCompany extends Base {
  static moduleName = "MyApplication::Business";
  static _demodulizedName = "Company";
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MyAppBusinessFirm extends MyAppBusinessCompany {
  declare clients: AssociationProxy<MyAppBusinessClient>;
  declare clientsSortedDesc: AssociationProxy<MyAppBusinessClient>;
  declare clientsOfFirm: AssociationProxy<MyAppBusinessClient>;
  declare clientsLikeMs: AssociationProxy<MyAppBusinessClient>;

  static moduleName = "MyApplication::Business";
  static _demodulizedName = "Firm";

  static {
    this.hasMany(
      "clients",
      function (this: any) {
        return this.order("id");
      },
      { dependent: "destroy" },
    );
    this.hasMany(
      "clientsSortedDesc",
      function (this: any) {
        return this.order("id DESC");
      },
      { className: "Client" },
    );
    this.hasMany(
      "clientsOfFirm",
      function (this: any) {
        return this.order("id");
      },
      { foreignKey: "client_of", className: "Client" },
    );
    this.hasMany(
      "clientsLikeMs",
      function (this: any) {
        return this.where("name = 'Microsoft'").order("id");
      },
      { className: "Client" },
    );
    this.hasOne("account", {
      className: "MyApplication::Billing::Account",
      dependent: "destroy",
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface MyAppBusinessFirm {
  get account(): MyAppBillingAccount | null | Promise<MyAppBillingAccount | null>;
  set account(value: MyAppBillingAccount | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MyAppBusinessClient extends MyAppBusinessCompany {
  static moduleName = "MyApplication::Business";
  static _demodulizedName = "Client";

  static {
    this.belongsTo("firm", { foreignKey: "client_of" });
    this.belongsTo("firmWithOtherName", { className: "Firm", foreignKey: "client_of" });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface MyAppBusinessClient {
  get firm(): MyAppBusinessFirm | null | Promise<MyAppBusinessFirm | null>;
  set firm(value: MyAppBusinessFirm | null);
  get firmWithOtherName(): MyAppBusinessFirm | null | Promise<MyAppBusinessFirm | null>;
  set firmWithOtherName(value: MyAppBusinessFirm | null);
}

export class MyAppBusinessClientContact extends Base {
  static moduleName = "MyApplication::Business::Client";
  static _demodulizedName = "Contact";
}

export class MyAppBusinessDeveloper extends Base {
  declare projects: AssociationProxy<MyAppBusinessProject>;
  declare name: string;

  static moduleName = "MyApplication::Business";
  static _demodulizedName = "Developer";

  static {
    this.hasAndBelongsToMany("projects");
    this.validates("name", { length: { in: new Range(3, 20) } });
  }
}

export class MyAppBusinessProject extends Base {
  declare developers: AssociationProxy<MyAppBusinessDeveloper>;

  static moduleName = "MyApplication::Business";
  static _demodulizedName = "Project";

  static {
    this.hasAndBelongsToMany("developers");
  }
}

export class MyAppBusinessPrefixedCompany extends Base {
  static moduleName = "MyApplication::Business::Prefixed";
  static _demodulizedName = "Company";
}

export class MyAppBusinessPrefixedFirm extends MyAppBusinessPrefixedCompany {
  static moduleName = "MyApplication::Business::Prefixed";
  static _demodulizedName = "Firm";

  static {
    this._tableName = "companies";
  }
}

export class MyAppBusinessPrefixedNestedCompany extends Base {
  static moduleName = "MyApplication::Business::Prefixed::Nested";
  static _demodulizedName = "Company";
}

export class MyAppBusinessSuffixedCompany extends Base {
  static moduleName = "MyApplication::Business::Suffixed";
  static _demodulizedName = "Company";
}

export class MyAppBusinessSuffixedFirm extends MyAppBusinessSuffixedCompany {
  static moduleName = "MyApplication::Business::Suffixed";
  static _demodulizedName = "Firm";

  static {
    this._tableName = "companies";
  }
}

export class MyAppBusinessSuffixedNestedCompany extends Base {
  static moduleName = "MyApplication::Business::Suffixed::Nested";
  static _demodulizedName = "Company";
}

export class MyAppBillingFirm extends Base {
  static moduleName = "MyApplication::Billing";
  static _demodulizedName = "Firm";

  static {
    this._tableName = "companies";
  }
}

export class MyAppBillingNestedFirm extends Base {
  static moduleName = "MyApplication::Billing::Nested";
  static _demodulizedName = "Firm";

  static {
    this._tableName = "companies";
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MyAppBillingAccount extends Base {
  static moduleName = "MyApplication::Billing";
  static _demodulizedName = "Account";

  static {
    const opts = { foreignKey: "firm_id" };
    this.belongsTo("firm", { ...opts, className: "MyApplication::Business::Firm" });
    this.belongsTo("qualifiedBillingFirm", {
      ...opts,
      className: "MyApplication::Billing::Firm",
    });
    this.belongsTo("unqualifiedBillingFirm", { ...opts, className: "Firm" });
    this.belongsTo("nestedQualifiedBillingFirm", {
      ...opts,
      className: "MyApplication::Billing::Nested::Firm",
    });
    this.belongsTo("nestedUnqualifiedBillingFirm", { ...opts, className: "Nested::Firm" });

    this.validate(function (this: MyAppBillingAccount) {
      this.checkEmptyCreditLimit();
    });
  }

  private checkEmptyCreditLimit(): void {
    const creditCard = this.readAttribute("credit_card");
    if (creditCard == null || creditCard === "") {
      this.errors.add("credit_card", ":blank");
    }
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface MyAppBillingAccount {
  get nestedQualifiedBillingFirm():
    | MyAppBillingNestedFirm
    | null
    | Promise<MyAppBillingNestedFirm | null>;
  set nestedQualifiedBillingFirm(value: MyAppBillingNestedFirm | null);
  get nestedUnqualifiedBillingFirm():
    | MyAppBillingNestedFirm
    | null
    | Promise<MyAppBillingNestedFirm | null>;
  set nestedUnqualifiedBillingFirm(value: MyAppBillingNestedFirm | null);
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface MyAppBillingAccount {
  get firm(): MyAppBusinessFirm | null | Promise<MyAppBusinessFirm | null>;
  set firm(value: MyAppBusinessFirm | null);
  get qualifiedBillingFirm(): MyAppBillingFirm | null | Promise<MyAppBillingFirm | null>;
  set qualifiedBillingFirm(value: MyAppBillingFirm | null);
  get unqualifiedBillingFirm(): MyAppBillingFirm | null | Promise<MyAppBillingFirm | null>;
  set unqualifiedBillingFirm(value: MyAppBillingFirm | null);
}

for (const klass of [
  MyAppBusinessCompany,
  MyAppBusinessFirm,
  MyAppBusinessClient,
  MyAppBusinessClientContact,
  MyAppBusinessDeveloper,
  MyAppBusinessProject,
  MyAppBusinessPrefixedCompany,
  MyAppBusinessPrefixedFirm,
  MyAppBusinessPrefixedNestedCompany,
  MyAppBusinessSuffixedCompany,
  MyAppBusinessSuffixedFirm,
  MyAppBusinessSuffixedNestedCompany,
  MyAppBillingFirm,
  MyAppBillingNestedFirm,
  MyAppBillingAccount,
]) {
  registerModel(klass);
}
