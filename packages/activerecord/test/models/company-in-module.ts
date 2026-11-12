import { DescendantsTracker } from "@blazetrails/activesupport";
import type { AssociationProxy } from "../../lib/associations/collection-proxy.js";
import { Base } from "../../lib/base.js";
import { Range, constSet, TopLevel, constGet } from "@blazetrails/ruby-compat";

constSet(TopLevel, "MyApplication", {});
const Business = {};
constSet(constGet(Object, "MyApplication") as object, "Business", Business);
const Prefixed = { tableNamePrefix: "prefixed_" };
constSet(Business, "Prefixed", Prefixed);
const PrefixedNested = {};
constSet(Prefixed, "Nested", PrefixedNested);
const Suffixed = { tableNameSuffix: "_suffixed" };
constSet(Business, "Suffixed", Suffixed);
const SuffixedNested = {};
constSet(Suffixed, "Nested", SuffixedNested);
const Billing = {};
constSet(constGet(Object, "MyApplication") as object, "Billing", Billing);
const BillingNested = {};
constSet(Billing, "Nested", BillingNested);

export class MyAppBusinessCompany extends Base {
  static {
    constSet(Business, "Company", this);
    DescendantsTracker.registerSubclass(Base, this);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MyAppBusinessFirm extends MyAppBusinessCompany {
  declare clients: AssociationProxy<MyAppBusinessClient>;
  declare clientsSortedDesc: AssociationProxy<MyAppBusinessClient>;
  declare clientsOfFirm: AssociationProxy<MyAppBusinessClient>;
  declare clientsLikeMs: AssociationProxy<MyAppBusinessClient>;

  static {
    constSet(Business, "Firm", this);
    DescendantsTracker.registerSubclass(MyAppBusinessCompany, this);
  }

  static {
    this.hasMany(
      "clients",
      function () {
        return this.order("id");
      },
      { dependent: "destroy" },
    );
    this.hasMany(
      "clientsSortedDesc",
      function () {
        return this.order("id DESC");
      },
      { className: "Client" },
    );
    this.hasMany(
      "clientsOfFirm",
      function () {
        return this.order("id");
      },
      { foreignKey: "client_of", className: "Client" },
    );
    this.hasMany(
      "clientsLikeMs",
      function () {
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
    constSet(Business, "Client", this);
    DescendantsTracker.registerSubclass(MyAppBusinessCompany, this);
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
    constSet(MyAppBusinessClient, "Contact", this);
    DescendantsTracker.registerSubclass(Base, this);
  }
}

export class MyAppBusinessDeveloper extends Base {
  declare projects: AssociationProxy<MyAppBusinessProject>;
  declare name: string;

  static {
    constSet(Business, "Developer", this);
    DescendantsTracker.registerSubclass(Base, this);
  }

  static {
    this.hasAndBelongsToMany("projects");
    this.validates("name", { length: { in: new Range(3, 20) } });
  }
}

export class MyAppBusinessProject extends Base {
  declare developers: AssociationProxy<MyAppBusinessDeveloper>;

  static {
    constSet(Business, "Project", this);
    DescendantsTracker.registerSubclass(Base, this);
  }

  static {
    this.hasAndBelongsToMany("developers");
  }
}

export class MyAppBusinessPrefixedCompany extends Base {
  static {
    constSet(Prefixed, "Company", this);
    DescendantsTracker.registerSubclass(Base, this);
  }
}

export class MyAppBusinessPrefixedFirm extends MyAppBusinessPrefixedCompany {
  static {
    constSet(Prefixed, "Firm", this);
    DescendantsTracker.registerSubclass(MyAppBusinessPrefixedCompany, this);
  }

  static {
    this._tableName = "companies";
  }
}

export class MyAppBusinessPrefixedNestedCompany extends Base {
  static {
    constSet(PrefixedNested, "Company", this);
    DescendantsTracker.registerSubclass(Base, this);
  }
}

export class MyAppBusinessSuffixedCompany extends Base {
  static {
    constSet(Suffixed, "Company", this);
    DescendantsTracker.registerSubclass(Base, this);
  }
}

export class MyAppBusinessSuffixedFirm extends MyAppBusinessSuffixedCompany {
  static {
    constSet(Suffixed, "Firm", this);
    DescendantsTracker.registerSubclass(MyAppBusinessSuffixedCompany, this);
  }

  static {
    this._tableName = "companies";
  }
}

export class MyAppBusinessSuffixedNestedCompany extends Base {
  static {
    constSet(SuffixedNested, "Company", this);
    DescendantsTracker.registerSubclass(Base, this);
  }
}

export class MyAppBillingFirm extends Base {
  static {
    constSet(Billing, "Firm", this);
    DescendantsTracker.registerSubclass(Base, this);
  }

  static {
    this._tableName = "companies";
  }
}

export class MyAppBillingNestedFirm extends Base {
  static {
    constSet(BillingNested, "Firm", this);
    DescendantsTracker.registerSubclass(Base, this);
  }

  static {
    this._tableName = "companies";
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MyAppBillingAccount extends Base {
  static {
    constSet(Billing, "Account", this);
    DescendantsTracker.registerSubclass(Base, this);
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
