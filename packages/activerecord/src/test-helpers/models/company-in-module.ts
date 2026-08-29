import type { AssociationProxy } from "../../associations/collection-proxy.js";
import { Range } from "@blazetrails/activesupport";
import type { Developer } from "./developer.js";
import type { Firm } from "./company.js";
import type { Project } from "./project.js";
import { registerModel } from "../../associations.js";
import { registerModuleTableNamePrefix, registerModuleTableNameSuffix } from "../../inheritance.js";
import { Base } from "../../base.js";

registerModuleTableNamePrefix("MyApplication::Business::Prefixed", "prefixed_");
registerModuleTableNameSuffix("MyApplication::Business::Suffixed", "_suffixed");

export class MyAppBusinessCompany extends Base {
  static moduleName = "MyApplication::Business";
  static _demodulizedName = "Company";
}

export class MyAppBusinessFirm extends MyAppBusinessCompany {
  static moduleName = "MyApplication::Business";
  static _demodulizedName = "Firm";

  static {
    this.hasMany("clients", (q: any) => q.order("id"), {
      foreignKey: "firm_id",
      dependent: "destroy",
    });
    this.hasMany("clientsSortedDesc", (q: any) => q.order("id DESC"), {
      className: "Client",
      foreignKey: "firm_id",
    });
    this.hasMany("clientsOfFirm", (q: any) => q.order("id"), {
      foreignKey: "client_of",
      className: "Client",
    });
    this.hasMany("clientsLikeMs", (q: any) => q.where("name = 'Microsoft'").order("id"), {
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

export class MyAppBusinessClient extends MyAppBusinessCompany {
  static moduleName = "MyApplication::Business";
  static _demodulizedName = "Client";

  static {
    this.belongsTo("firm", { foreignKey: "client_of" });
    this.belongsTo("firmWithOtherName", { className: "Firm", foreignKey: "client_of" });
  }
}

export class MyAppBusinessClientContact extends Base {
  static moduleName = "MyApplication::Business::Client";
  static _demodulizedName = "Contact";
}

export class MyAppBusinessDeveloper extends Base {
  declare projects: AssociationProxy<Project>;

  static moduleName = "MyApplication::Business";
  static _demodulizedName = "Developer";

  static {
    this.hasAndBelongsToMany("projects");
    this.validates("name", { length: { in: new Range(3, 20) } });
  }
}

export class MyAppBusinessProject extends Base {
  declare developers: AssociationProxy<Developer>;

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

export class MyAppBillingAccount extends Base {
  declare firm: MyAppBusinessFirm | null;
  declare qualifiedBillingFirm: MyAppBillingFirm | null;
  declare unqualifiedBillingFirm: Firm | null;
  declare nestedQualifiedBillingFirm: MyAppBillingNestedFirm | null;
  declare nestedUnqualifiedBillingFirm: MyAppBillingNestedFirm | null;
  declare loadBelongsTo: ((name: "firm") => Promise<MyAppBusinessFirm | null>) &
    ((name: "qualifiedBillingFirm") => Promise<MyAppBillingFirm | null>) &
    ((name: "unqualifiedBillingFirm") => Promise<Firm | null>) &
    ((name: "nestedQualifiedBillingFirm") => Promise<MyAppBillingNestedFirm | null>) &
    ((name: "nestedUnqualifiedBillingFirm") => Promise<MyAppBillingNestedFirm | null>);

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
