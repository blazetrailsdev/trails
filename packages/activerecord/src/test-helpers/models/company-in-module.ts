import type { AssociationProxy } from "../../associations/collection-proxy.js";
import { registerModel } from "../../associations.js";
import { Base } from "../../base.js";
import { Module, Range, registerConstant, rbModConstSet } from "@blazetrails/ruby-compat";

registerConstant("MyApplication", new Module());
const Business = new Module();
registerConstant("MyApplication::Business", Business);
const Prefixed = Object.assign(new Module(), { tableNamePrefix: "prefixed_" });
registerConstant("MyApplication::Business::Prefixed", Prefixed);
const PrefixedNested = new Module();
registerConstant("MyApplication::Business::Prefixed::Nested", PrefixedNested);
const Suffixed = Object.assign(new Module(), { tableNameSuffix: "_suffixed" });
registerConstant("MyApplication::Business::Suffixed", Suffixed);
const SuffixedNested = new Module();
registerConstant("MyApplication::Business::Suffixed::Nested", SuffixedNested);
const Billing = new Module();
registerConstant("MyApplication::Billing", Billing);
const BillingNested = new Module();
registerConstant("MyApplication::Billing::Nested", BillingNested);

export class MyAppBusinessCompany extends Base {
  static {
    rbModConstSet(Business, "Company", this);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MyAppBusinessFirm extends MyAppBusinessCompany {
  declare clients: AssociationProxy<MyAppBusinessClient>;
  declare clientsSortedDesc: AssociationProxy<MyAppBusinessClient>;
  declare clientsOfFirm: AssociationProxy<MyAppBusinessClient>;
  declare clientsLikeMs: AssociationProxy<MyAppBusinessClient>;

  static {
    rbModConstSet(Business, "Firm", this);
  }

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
  static {
    rbModConstSet(Business, "Client", this);
  }

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
  static {
    rbModConstSet(MyAppBusinessClient, "Contact", this);
  }
}

export class MyAppBusinessDeveloper extends Base {
  declare projects: AssociationProxy<MyAppBusinessProject>;
  declare name: string;

  static {
    rbModConstSet(Business, "Developer", this);
  }

  static {
    this.hasAndBelongsToMany("projects");
    this.validates("name", { length: { in: new Range(3, 20) } });
  }
}

export class MyAppBusinessProject extends Base {
  declare developers: AssociationProxy<MyAppBusinessDeveloper>;

  static {
    rbModConstSet(Business, "Project", this);
  }

  static {
    this.hasAndBelongsToMany("developers");
  }
}

export class MyAppBusinessPrefixedCompany extends Base {
  static {
    rbModConstSet(Prefixed, "Company", this);
  }
}

export class MyAppBusinessPrefixedFirm extends MyAppBusinessPrefixedCompany {
  static {
    rbModConstSet(Prefixed, "Firm", this);
  }

  static {
    this._tableName = "companies";
  }
}

export class MyAppBusinessPrefixedNestedCompany extends Base {
  static {
    rbModConstSet(PrefixedNested, "Company", this);
  }
}

export class MyAppBusinessSuffixedCompany extends Base {
  static {
    rbModConstSet(Suffixed, "Company", this);
  }
}

export class MyAppBusinessSuffixedFirm extends MyAppBusinessSuffixedCompany {
  static {
    rbModConstSet(Suffixed, "Firm", this);
  }

  static {
    this._tableName = "companies";
  }
}

export class MyAppBusinessSuffixedNestedCompany extends Base {
  static {
    rbModConstSet(SuffixedNested, "Company", this);
  }
}

export class MyAppBillingFirm extends Base {
  static {
    rbModConstSet(Billing, "Firm", this);
  }

  static {
    this._tableName = "companies";
  }
}

export class MyAppBillingNestedFirm extends Base {
  static {
    rbModConstSet(BillingNested, "Firm", this);
  }

  static {
    this._tableName = "companies";
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MyAppBillingAccount extends Base {
  static {
    rbModConstSet(Billing, "Account", this);
  }

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
