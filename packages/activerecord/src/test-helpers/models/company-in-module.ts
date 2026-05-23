// vendor/rails/activerecord/test/models/company_in_module.rb
// Ruby modules flattened to prefixed exports (TypeScript namespaces banned by lint rule).
import { registerModel } from "../../associations.js";
import { Base } from "../../base.js";
import { Company } from "./company.js";

// MyApplication::Business::Company < ::Company
export class MyAppBusinessCompany extends Company {}

// MyApplication::Business::Firm
export class MyAppBusinessFirm extends MyAppBusinessCompany {
  static {
    // foreignKey explicit throughout: JS class name MyAppBusinessFirm would derive
    // my_app_business_firm_id, but Rails demodulizes MyApplication::Business::Firm → firm_id.
    this.hasMany("clients", {
      scope: (q: any) => q.order("id"),
      foreignKey: "firm_id",
      dependent: "destroy",
    });
    this.hasMany("clientsSortedDesc", {
      scope: (q: any) => q.order("id DESC"),
      className: "Client",
      foreignKey: "firm_id",
    });
    this.hasMany("clientsOfFirm", {
      scope: (q: any) => q.order("id"),
      foreignKey: "client_of",
      className: "Client",
    });
    this.hasMany("clientsLikeMs", {
      scope: (q: any) => q.where("name = 'Microsoft'").order("id"),
      className: "Client",
      foreignKey: "firm_id",
    });
    this.hasOne("account", {
      className: "MyApplication::Billing::Account",
      foreignKey: "firm_id",
      dependent: "destroy",
    });
  }
}

// MyApplication::Business::Client
export class MyAppBusinessClient extends MyAppBusinessCompany {
  static {
    this.belongsTo("firm", { foreignKey: "client_of" });
    this.belongsTo("firmWithOtherName", { className: "Firm", foreignKey: "client_of" });
  }
}

// MyApplication::Business::Client::Contact
export class MyAppBusinessClientContact extends Base {}

// MyApplication::Business::Developer
export class MyAppBusinessDeveloper extends Base {
  static {
    this._tableName = "developers";
    this.hasAndBelongsToMany("projects");
    this.validates("name", { length: { in: [3, 20] } });
  }
}

// MyApplication::Business::Project
export class MyAppBusinessProject extends Base {
  static {
    this._tableName = "projects";
    this.hasAndBelongsToMany("developers");
  }
}

// MyApplication::Business::Prefixed::Company
export class MyAppBusinessPrefixedCompany extends Base {}

// MyApplication::Business::Prefixed::Firm
export class MyAppBusinessPrefixedFirm extends MyAppBusinessPrefixedCompany {
  static {
    this._tableName = "companies";
  }
}

// MyApplication::Business::Prefixed::Nested::Company
export class MyAppBusinessPrefixedNestedCompany extends Base {}

// MyApplication::Business::Suffixed::Company
export class MyAppBusinessSuffixedCompany extends Base {}

// MyApplication::Business::Suffixed::Firm
export class MyAppBusinessSuffixedFirm extends MyAppBusinessSuffixedCompany {
  static {
    this._tableName = "companies";
  }
}

// MyApplication::Business::Suffixed::Nested::Company
export class MyAppBusinessSuffixedNestedCompany extends Base {}

// MyApplication::Billing::Firm
export class MyAppBillingFirm extends Base {
  static {
    this._tableName = "companies";
  }
}

// MyApplication::Billing::Nested::Firm
export class MyAppBillingNestedFirm extends Base {
  static {
    this._tableName = "companies";
  }
}

// MyApplication::Billing::Account
export class MyAppBillingAccount extends Base {
  static {
    this._tableName = "accounts";
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

    this.validate(async function (this: MyAppBillingAccount) {
      await this.checkEmptyCreditLimit();
    });
  }

  private async checkEmptyCreditLimit(): Promise<void> {
    const creditCard = this.readAttribute("credit_card");
    if (creditCard == null || creditCard === "") {
      this.errors.add("credit_card", "blank");
    }
  }
}

// Register Ruby-module-qualified names so cross-namespace className resolution works.
registerModel("MyApplication::Business::Company", MyAppBusinessCompany);
registerModel("MyApplication::Business::Firm", MyAppBusinessFirm);
registerModel("MyApplication::Business::Client", MyAppBusinessClient);
registerModel("MyApplication::Business::Client::Contact", MyAppBusinessClientContact);
registerModel("MyApplication::Business::Developer", MyAppBusinessDeveloper);
registerModel("MyApplication::Business::Project", MyAppBusinessProject);
registerModel("MyApplication::Business::Prefixed::Company", MyAppBusinessPrefixedCompany);
registerModel("MyApplication::Business::Prefixed::Firm", MyAppBusinessPrefixedFirm);
registerModel(
  "MyApplication::Business::Prefixed::Nested::Company",
  MyAppBusinessPrefixedNestedCompany,
);
registerModel("MyApplication::Business::Suffixed::Company", MyAppBusinessSuffixedCompany);
registerModel("MyApplication::Business::Suffixed::Firm", MyAppBusinessSuffixedFirm);
registerModel(
  "MyApplication::Business::Suffixed::Nested::Company",
  MyAppBusinessSuffixedNestedCompany,
);
registerModel("MyApplication::Billing::Firm", MyAppBillingFirm);
registerModel("MyApplication::Billing::Nested::Firm", MyAppBillingNestedFirm);
registerModel("MyApplication::Billing::Account", MyAppBillingAccount);
