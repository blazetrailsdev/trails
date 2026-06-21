// vendor/rails/activerecord/test/models/company_in_module.rb
// Ruby modules flattened to prefixed exports (TypeScript namespaces banned by lint rule).
// Each class carries its Ruby module path via `static moduleName` (+ the bare
// `_demodulizedName` when the flattened JS name differs), so `registerModel`
// derives the `::`-qualified registry key — the one cross-namespace `className`
// resolution looks up — instead of a hand-maintained `registerModel(name, …)` call.
import { registerModel } from "../../associations.js";
import { Base } from "../../base.js";
import { Company } from "./company.js";

// MyApplication::Business::Company < ::Company
export class MyAppBusinessCompany extends Company {
  static moduleName = "MyApplication::Business";
  static _demodulizedName = "Company";
}

// MyApplication::Business::Firm
export class MyAppBusinessFirm extends MyAppBusinessCompany {
  static moduleName = "MyApplication::Business";
  static _demodulizedName = "Firm";

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
  static moduleName = "MyApplication::Business";
  static _demodulizedName = "Client";

  static {
    this.belongsTo("firm", { foreignKey: "client_of" });
    this.belongsTo("firmWithOtherName", { className: "Firm", foreignKey: "client_of" });
  }
}

// MyApplication::Business::Client::Contact
export class MyAppBusinessClientContact extends Base {
  static moduleName = "MyApplication::Business::Client";
  static _demodulizedName = "Contact";
}

// MyApplication::Business::Developer
export class MyAppBusinessDeveloper extends Base {
  static moduleName = "MyApplication::Business";
  static _demodulizedName = "Developer";

  static {
    this._tableName = "developers";
    this.hasAndBelongsToMany("projects");
    this.validates("name", { length: { in: [3, 20] } });
  }
}

// MyApplication::Business::Project
export class MyAppBusinessProject extends Base {
  static moduleName = "MyApplication::Business";
  static _demodulizedName = "Project";

  static {
    this._tableName = "projects";
    this.hasAndBelongsToMany("developers");
  }
}

// MyApplication::Business::Prefixed::Company
export class MyAppBusinessPrefixedCompany extends Base {
  static moduleName = "MyApplication::Business::Prefixed";
  static _demodulizedName = "Company";
}

// MyApplication::Business::Prefixed::Firm
export class MyAppBusinessPrefixedFirm extends MyAppBusinessPrefixedCompany {
  static moduleName = "MyApplication::Business::Prefixed";
  static _demodulizedName = "Firm";

  static {
    this._tableName = "companies";
  }
}

// MyApplication::Business::Prefixed::Nested::Company
export class MyAppBusinessPrefixedNestedCompany extends Base {
  static moduleName = "MyApplication::Business::Prefixed::Nested";
  static _demodulizedName = "Company";
}

// MyApplication::Business::Suffixed::Company
export class MyAppBusinessSuffixedCompany extends Base {
  static moduleName = "MyApplication::Business::Suffixed";
  static _demodulizedName = "Company";
}

// MyApplication::Business::Suffixed::Firm
export class MyAppBusinessSuffixedFirm extends MyAppBusinessSuffixedCompany {
  static moduleName = "MyApplication::Business::Suffixed";
  static _demodulizedName = "Firm";

  static {
    this._tableName = "companies";
  }
}

// MyApplication::Business::Suffixed::Nested::Company
export class MyAppBusinessSuffixedNestedCompany extends Base {
  static moduleName = "MyApplication::Business::Suffixed::Nested";
  static _demodulizedName = "Company";
}

// MyApplication::Billing::Firm
export class MyAppBillingFirm extends Base {
  static moduleName = "MyApplication::Billing";
  static _demodulizedName = "Firm";

  static {
    this._tableName = "companies";
  }
}

// MyApplication::Billing::Nested::Firm
export class MyAppBillingNestedFirm extends Base {
  static moduleName = "MyApplication::Billing::Nested";
  static _demodulizedName = "Firm";

  static {
    this._tableName = "companies";
  }
}

// MyApplication::Billing::Account
export class MyAppBillingAccount extends Base {
  static moduleName = "MyApplication::Billing";
  static _demodulizedName = "Account";

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

    // Rails `validate :check_empty_credit_limit` (company_in_module.rb:91).
    // Sync validation — the check only reads an attribute, no async work.
    this.validate(function (this: MyAppBillingAccount) {
      this.checkEmptyCreditLimit();
    });
  }

  private checkEmptyCreditLimit(): void {
    const creditCard = this.readAttribute("credit_card");
    if (creditCard == null || creditCard === "") {
      this.errors.add("credit_card", "blank");
    }
  }
}

// Register each model: `registerModel` derives the `::`-qualified registry key
// from the class's own `moduleName`, so cross-namespace className resolution
// works without hand-written `registerModel("Ruby::Name", …)` strings.
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
