import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Temporal, Time as RubyTime } from "@blazetrails/date";
import type { Comment } from "./comment.js";
import type { Company } from "./company.js";
import type { Computer } from "./computer.js";
import type { Contract } from "./contract.js";
import type { Firm } from "./company.js";
import type { Mentor } from "./mentor.js";
import type { Project } from "./project.js";
import type { Rating } from "./rating.js";
import type { Ship } from "./ship.js";
import type { SpecialContract } from "./contract.js";
import type { SpecialProject } from "./project.js";
import { StringType } from "@blazetrails/activemodel";
import { Base } from "../../base.js";
import * as Type from "../../type.js";
import type { Relation } from "../../relation.js";
import { Module, Range, RuntimeError, registerConstant } from "@blazetrails/ruby-compat";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Developer extends Base {
  declare updated_at: any;
  declare projects: AssociationProxy<Project>;
  declare sharedComputers: AssociationProxy<Computer>;
  declare computers: AssociationProxy<Computer>;
  declare projectsExtendedByName: AssociationProxy<Project>;
  declare projectsExtendedByNameTwice: AssociationProxy<Project>;
  declare projectsExtendedByNameAndBlock: AssociationProxy<Project>;
  declare strictLoadingProjects: AssociationProxy<Project>;
  declare specialProjects: AssociationProxy<SpecialProject>;
  declare symSpecialProjects: AssociationProxy<SpecialProject>;
  declare auditLogs: AssociationProxy<AuditLog>;
  declare requiredAuditLogs: AssociationProxy<AuditLogRequired>;
  declare strictLoadingAuditLogs: AssociationProxy<AuditLog>;
  declare strictLoadingOptAuditLogs: AssociationProxy<AuditLog>;
  declare contracts: AssociationProxy<Contract>;
  declare firms: AssociationProxy<Firm>;
  declare comments: AssociationProxy<Comment>;
  declare ratings: AssociationProxy<Rating>;
  declare contractedProjects: AssociationProxy<Project>;
  declare static jamises: () => Relation<Developer>;
  declare last_name: unknown;
  declare firm_id: number;
  declare first_name: string;
  declare legacy_created_at: RubyTime | Temporal.PlainDateTime;
  declare created_at: RubyTime | Temporal.PlainDateTime;
  declare legacy_created_on: RubyTime | Temporal.PlainDateTime;
  declare legacy_updated_at: RubyTime | Temporal.PlainDateTime;
  declare legacy_updated_on: RubyTime | Temporal.PlainDateTime;
  declare mentor_id: number;
  declare name: string;
  declare salary: number | null;

  static instanceCount: number | undefined;

  declare static ProjectsAssociationExtension: Module;

  static ProjectsAssociationExtension2 = new Module((mod) => {
    mod.defineMethod("findLeastRecent", async function (this: Relation<Base>) {
      return this.order("id ASC").first();
    });
  });

  static {
    this.ignoredColumns = ["first_name", "last_name"];

    this.aliasAttribute("created_at", "legacy_created_at");
    this.aliasAttribute("updated_at", "legacy_updated_at");
    this.aliasAttribute("created_on", "legacy_created_on");
    this.aliasAttribute("updated_on", "legacy_updated_on");

    this.hasAndBelongsToMany(
      "projects",
      null,
      { joinTable: "developers_projects", associationForeignKey: "project_id" },
      (mod) => {
        mod.defineMethod("findMostRecent", async function (this: Relation<Base>) {
          return this.order("id DESC").first();
        });
      },
    );

    this.belongsTo("mentor");
    this.belongsTo("strictLoadingMentor", {
      strictLoading: true,
      foreignKey: "mentor_id",
      className: "Mentor",
    });
    this.belongsTo("strictLoadingOffMentor", {
      strictLoading: false,
      foreignKey: "mentor_id",
      className: "Mentor",
    });
    this.acceptsNestedAttributesFor("projects");

    this.hasAndBelongsToMany("sharedComputers", { className: "Computer" });
    this.hasMany("computers", { foreignKey: "developer" });

    this.hasAndBelongsToMany(
      "projectsExtendedByName",
      function (this: any) {
        return this.extending(Developer.ProjectsAssociationExtension);
      },
      {
        className: "Project",
        joinTable: "developers_projects",
        associationForeignKey: "project_id",
      },
    );

    this.hasAndBelongsToMany(
      "projectsExtendedByNameTwice",
      function (this: any) {
        return this.extending(
          Developer.ProjectsAssociationExtension,
          Developer.ProjectsAssociationExtension2,
        );
      },
      {
        className: "Project",
        joinTable: "developers_projects",
        associationForeignKey: "project_id",
      },
    );

    this.hasAndBelongsToMany(
      "projectsExtendedByNameAndBlock",
      function (this: any) {
        return this.extending(Developer.ProjectsAssociationExtension);
      },
      {
        className: "Project",
        joinTable: "developers_projects",
        associationForeignKey: "project_id",
      },
      (mod) => {
        mod.defineMethod("findLeastRecent", async function (this: Relation<Base>) {
          return this.order("id ASC").first();
        });
      },
    );

    this.hasAndBelongsToMany("strictLoadingProjects", {
      joinTable: "developers_projects",
      associationForeignKey: "project_id",
      className: "Project",
      strictLoading: true,
    });

    this.hasAndBelongsToMany("specialProjects", {
      joinTable: "developers_projects",
      associationForeignKey: "project_id",
    });
    this.hasAndBelongsToMany("symSpecialProjects", {
      joinTable: "developers_projects",
      associationForeignKey: "project_id",
      className: "SpecialProject",
    });

    this.hasMany("auditLogs");
    this.hasMany("requiredAuditLogs", { className: "AuditLogRequired" });
    this.hasMany(
      "strictLoadingAuditLogs",
      function (this: any) {
        return this.strictLoading();
      },
      { className: "AuditLog" },
    );
    this.hasMany("strictLoadingOptAuditLogs", { strictLoading: true, className: "AuditLog" });
    this.hasMany("contracts");
    this.hasMany("firms", { through: "contracts", source: "firm" });
    this.hasMany("comments", function (this: any, developer: any) {
      return this.where({ body: `I'm ${developer.name}` });
    });
    this.hasMany("ratings", { through: "comments" });

    this.hasOne("ship", { dependent: "nullify" });
    this.hasOne("strictLoadingShip", { strictLoading: true, className: "Ship" });

    this.belongsTo("firm");
    this.hasMany("contractedProjects", { className: "Project" });

    this.scope("jamises", function (this: any) {
      return this.where({ name: "Jamis" });
    });

    this.validatesInclusionOf("salary", { in: new Range(50000, 200000) });
    this.validates("name", { length: { in: new Range(3, 20) } });

    this.beforeCreate(async function (developer: Developer) {
      (developer as any).auditLogs.build({ message: "Computer created" });
    });

    this.attribute("last_name");

    this.afterFind(function (this: Developer) {
      Developer.instanceCount = (Developer.instanceCount ?? 0) + 1;
    });
  }

  static target() {
    return "__target__";
  }

  set log(message: string) {
    (this as any).auditLogs.build({ message });
  }
}
registerConstant("Developer", Developer);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Developer {
  get mentor(): Mentor | null | Promise<Mentor | null>;
  set mentor(value: Mentor | null);
  get strictLoadingMentor(): Mentor | null | Promise<Mentor | null>;
  set strictLoadingMentor(value: Mentor | null);
  get strictLoadingOffMentor(): Mentor | null | Promise<Mentor | null>;
  set strictLoadingOffMentor(value: Mentor | null);
  get ship(): Ship | null | Promise<Ship | null>;
  set ship(value: Ship | null);
  get strictLoadingShip(): Ship | null | Promise<Ship | null>;
  set strictLoadingShip(value: Ship | null);
  get firm(): Firm | null | Promise<Firm | null>;
  set firm(value: Firm | null);
}

export class SubDeveloper extends Developer {}
registerConstant("SubDeveloper", SubDeveloper);

export class SpecialDeveloper extends Base {
  declare specialContracts: AssociationProxy<SpecialContract>;

  static {
    this.tableName = "developers";
    this.hasMany("specialContracts", { foreignKey: "developer_id" });
  }
}
registerConstant("SpecialDeveloper", SpecialDeveloper);

export class SymbolIgnoredDeveloper extends Base {
  declare last_name: unknown;

  static {
    this.tableName = "developers";
    this.ignoredColumns = ["first_name", "last_name"];
    this.attribute("last_name");
  }
}
registerConstant("SymbolIgnoredDeveloper", SymbolIgnoredDeveloper);

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AuditLog extends Base {
  declare developer_id: number;
  declare message: string;
  declare unvalidated_developer_id: number;

  static {
    this.belongsTo("developer", { validate: true });
    this.belongsTo("unvalidatedDeveloper", { className: "Developer" });
  }
}
registerConstant("AuditLog", AuditLog);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface AuditLog {
  get developer(): Developer | null | Promise<Developer | null>;
  set developer(value: Developer | null);
  get unvalidatedDeveloper(): Developer | null | Promise<Developer | null>;
  set unvalidatedDeveloper(value: Developer | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AuditLogRequired extends Base {
  static {
    this.tableName = "audit_logs";
    this.belongsTo("developer", { required: true });
  }
}
registerConstant("AuditLogRequired", AuditLogRequired);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface AuditLogRequired {
  get developer(): Developer | null | Promise<Developer | null>;
  set developer(value: Developer | null);
}

export class DeveloperWithBeforeDestroyRaise extends Base {
  declare projects: AssociationProxy<Project>;

  static {
    this.tableName = "developers";
    this.hasAndBelongsToMany("projects", {
      joinTable: "developers_projects",
      foreignKey: "developer_id",
    });
    this.beforeDestroy(async function (developer: DeveloperWithBeforeDestroyRaise) {
      const projects = await (developer as any).projects;
      if (projects.length === 0) throw new RuntimeError("unhandled exception");
    });
  }
}
registerConstant("DeveloperWithBeforeDestroyRaise", DeveloperWithBeforeDestroyRaise);

export class DeveloperWithSelect extends Base {
  static {
    this.tableName = "developers";
    this.defaultScope(function (this: any) {
      return this.select("name");
    });
  }
}
registerConstant("DeveloperWithSelect", DeveloperWithSelect);

export class DeveloperwithDefaultMentorScopeNot extends Base {
  static {
    this.tableName = "developers";
    this.defaultScope(function (this: any) {
      return this.where({ mentor_id: 1 });
    });
  }
}
registerConstant("DeveloperwithDefaultMentorScopeNot", DeveloperwithDefaultMentorScopeNot);

export class DeveloperWithDefaultMentorScopeAllQueries extends Base {
  static {
    this.tableName = "developers";
    this.defaultScope(
      function (this: any) {
        return this.where({ mentor_id: 1 });
      },
      { allQueries: true },
    );
  }
}
registerConstant(
  "DeveloperWithDefaultMentorScopeAllQueries",
  DeveloperWithDefaultMentorScopeAllQueries,
);

export class DeveloperWithDefaultNilableFirmScopeAllQueries extends Base {
  static {
    this.tableName = "developers";
    const firmId: number | null = null;
    this.defaultScope(
      function (this: any) {
        return firmId != null ? this.where({ firm_id: firmId }) : this;
      },
      { allQueries: true },
    );
  }
}
registerConstant(
  "DeveloperWithDefaultNilableFirmScopeAllQueries",
  DeveloperWithDefaultNilableFirmScopeAllQueries,
);

export class DeveloperWithIncludedMentorDefaultScopeNotAllQueriesAndDefaultScopeFirmWithAllQueries extends Base {
  static {
    this.tableName = "developers";
    this.defaultScope(function (this: any) {
      return this.where({ mentor_id: 1 });
    });
    const firmId = 10;
    this.defaultScope(
      function (this: any) {
        return firmId != null ? this.where({ firm_id: firmId }) : this;
      },
      { allQueries: true },
    );
  }
}
registerConstant(
  "DeveloperWithIncludedMentorDefaultScopeNotAllQueriesAndDefaultScopeFirmWithAllQueries",
  DeveloperWithIncludedMentorDefaultScopeNotAllQueriesAndDefaultScopeFirmWithAllQueries,
);

export class DeveloperWithIncludes extends Base {
  declare auditLogs: AssociationProxy<AuditLog>;

  static {
    this.tableName = "developers";
    this.hasMany("auditLogs", { foreignKey: "developer_id" });
    this.defaultScope(function (this: any) {
      return this.includes(":auditLogs");
    });
  }
}
registerConstant("DeveloperWithIncludes", DeveloperWithIncludes);

export class DeveloperFilteredOnJoins extends Base {
  declare projects: AssociationProxy<Project>;

  static {
    this.tableName = "developers";
    this.hasAndBelongsToMany(
      "projects",
      function (this: any) {
        return this.order("projects.id");
      },
      {
        foreignKey: "developer_id",
        joinTable: "developers_projects",
      },
    );
    this.defaultScope(function (this: any) {
      return this.joins(":projects").where({ projects: { name: "Active Controller" } });
    });
  }
}
registerConstant("DeveloperFilteredOnJoins", DeveloperFilteredOnJoins);

export class DeveloperOrderedBySalary extends Base {
  declare static byName: () => Relation<DeveloperOrderedBySalary>;

  static {
    this.tableName = "developers";
    this.aliasAttribute("created_at", "legacy_created_at");
    this.aliasAttribute("updated_at", "legacy_updated_at");
    this.aliasAttribute("created_on", "legacy_created_on");
    this.aliasAttribute("updated_on", "legacy_updated_on");
    this.defaultScope(function (this: any) {
      return this.order("salary DESC");
    });
    this.scope("byName", function (this: any) {
      return this.order("name DESC");
    });
  }
}
registerConstant("DeveloperOrderedBySalary", DeveloperOrderedBySalary);

export class DeveloperCalledDavid extends Base {
  static {
    this.tableName = "developers";
    this.defaultScope(function (this: any) {
      return this.where("name = 'David'");
    });
  }
}
registerConstant("DeveloperCalledDavid", DeveloperCalledDavid);

export class LazyLambdaDeveloperCalledDavid extends Base {
  static {
    this.tableName = "developers";
    this.defaultScope(function (this: any) {
      return this.where({ name: "David" });
    });
  }
}
registerConstant("LazyLambdaDeveloperCalledDavid", LazyLambdaDeveloperCalledDavid);

export class LazyBlockDeveloperCalledDavid extends Base {
  static {
    this.tableName = "developers";
    this.defaultScope(function (this: any) {
      return this.where({ name: "David" });
    });
  }
}
registerConstant("LazyBlockDeveloperCalledDavid", LazyBlockDeveloperCalledDavid);

export class CallableDeveloperCalledDavid extends Base {
  static {
    this.tableName = "developers";
    const call = this.where({ name: "David" });
    this.defaultScope({ call: () => call });
  }
}
registerConstant("CallableDeveloperCalledDavid", CallableDeveloperCalledDavid);

export class ClassMethodDeveloperCalledDavid extends Base {
  static {
    this.tableName = "developers";
  }

  static defaultScope(this: any): any {
    return this.where({ name: "David" });
  }
}
registerConstant("ClassMethodDeveloperCalledDavid", ClassMethodDeveloperCalledDavid);

export class ClassMethodReferencingScopeDeveloperCalledDavid extends Base {
  declare static david: () => Relation<ClassMethodReferencingScopeDeveloperCalledDavid>;

  static {
    this.tableName = "developers";
    this.scope("david", function (this: any) {
      return this.where({ name: "David" });
    });
  }

  static defaultScope(this: any): any {
    return this.david();
  }
}
registerConstant(
  "ClassMethodReferencingScopeDeveloperCalledDavid",
  ClassMethodReferencingScopeDeveloperCalledDavid,
);

export class LazyBlockReferencingScopeDeveloperCalledDavid extends Base {
  declare static david: () => Relation<LazyBlockReferencingScopeDeveloperCalledDavid>;

  static {
    this.tableName = "developers";
    this.scope("david", function (this: any) {
      return this.where({ name: "David" });
    });
    this.defaultScope(function (this: any) {
      return (LazyBlockReferencingScopeDeveloperCalledDavid as any).david();
    });
  }
}
registerConstant(
  "LazyBlockReferencingScopeDeveloperCalledDavid",
  LazyBlockReferencingScopeDeveloperCalledDavid,
);

export class DeveloperCalledJamis extends Base {
  declare legacy_updated_at: any;
  declare static poor: () => Relation<DeveloperCalledJamis>;
  declare static david: () => Relation<DeveloperCalledJamis>;
  declare static david2: () => Relation<DeveloperCalledJamis>;

  static {
    this.tableName = "developers";
    this.aliasAttribute("created_at", "legacy_created_at");
    this.aliasAttribute("updated_at", "legacy_updated_at");
    this.aliasAttribute("created_on", "legacy_created_on");
    this.aliasAttribute("updated_on", "legacy_updated_on");
    this.defaultScope(function (this: any) {
      return this.where({ name: "Jamis" });
    });
    this.scope("poor", function (this: any) {
      return this.where("salary < 150000");
    });
    this.scope("david", function (this: any) {
      return this.where({ name: "David" });
    });
    this.scope("david2", function (this: any) {
      return this.unscoped().where({ name: "David" });
    });
  }
}
registerConstant("DeveloperCalledJamis", DeveloperCalledJamis);

export class PoorDeveloperCalledJamis extends Base {
  static {
    this.tableName = "developers";
    this.defaultScope(function (this: any) {
      return this.where({ name: "Jamis", salary: 50000 });
    });
  }
}
registerConstant("PoorDeveloperCalledJamis", PoorDeveloperCalledJamis);

export class InheritedPoorDeveloperCalledJamis extends DeveloperCalledJamis {
  static {
    this.tableName = "developers";
    this.defaultScope(function (this: any) {
      return this.where({ salary: 50000 });
    });
  }
}
registerConstant("InheritedPoorDeveloperCalledJamis", InheritedPoorDeveloperCalledJamis);

export class MultiplePoorDeveloperCalledJamis extends Base {
  static {
    this.tableName = "developers";
    this.defaultScope(function (this: any) {
      return this;
    });
    this.defaultScope(function (this: any) {
      return this.where({ name: "Jamis" });
    });
    this.defaultScope(function (this: any) {
      return this.where({ salary: 50000 });
    });
  }
}
registerConstant("MultiplePoorDeveloperCalledJamis", MultiplePoorDeveloperCalledJamis);

export class ModuleIncludedPoorDeveloperCalledJamis extends DeveloperCalledJamis {
  static {
    this.tableName = "developers";
    this.defaultScope(function (this: any) {
      return this.where({ salary: 50000 });
    });
  }
}
registerConstant("ModuleIncludedPoorDeveloperCalledJamis", ModuleIncludedPoorDeveloperCalledJamis);

export class EagerDeveloperWithDefaultScope extends Base {
  declare projects: AssociationProxy<Project>;

  static {
    this.tableName = "developers";
    this.hasAndBelongsToMany(
      "projects",
      function (this: any) {
        return this.order("projects.id");
      },
      {
        foreignKey: "developer_id",
        joinTable: "developers_projects",
      },
    );
    this.defaultScope(function (this: any) {
      return this.includes(":projects");
    });
  }
}
registerConstant("EagerDeveloperWithDefaultScope", EagerDeveloperWithDefaultScope);

export class EagerDeveloperWithClassMethodDefaultScope extends Base {
  declare projects: AssociationProxy<Project>;

  static {
    this.tableName = "developers";
    this.hasAndBelongsToMany(
      "projects",
      function (this: any) {
        return this.order("projects.id");
      },
      {
        foreignKey: "developer_id",
        joinTable: "developers_projects",
      },
    );
  }

  static defaultScope(this: any): any {
    return this.includes(":projects");
  }
}
registerConstant(
  "EagerDeveloperWithClassMethodDefaultScope",
  EagerDeveloperWithClassMethodDefaultScope,
);

export class EagerDeveloperWithLambdaDefaultScope extends Base {
  declare projects: AssociationProxy<Project>;

  static {
    this.tableName = "developers";
    this.hasAndBelongsToMany(
      "projects",
      function (this: any) {
        return this.order("projects.id");
      },
      {
        foreignKey: "developer_id",
        joinTable: "developers_projects",
      },
    );
    this.defaultScope(function (this: any) {
      return this.includes(":projects");
    });
  }
}
registerConstant("EagerDeveloperWithLambdaDefaultScope", EagerDeveloperWithLambdaDefaultScope);

export class EagerDeveloperWithBlockDefaultScope extends Base {
  declare projects: AssociationProxy<Project>;

  static {
    this.tableName = "developers";
    this.hasAndBelongsToMany(
      "projects",
      function (this: any) {
        return this.order("projects.id");
      },
      {
        foreignKey: "developer_id",
        joinTable: "developers_projects",
      },
    );
    this.defaultScope(function (this: any) {
      return this.includes(":projects");
    });
  }
}
registerConstant("EagerDeveloperWithBlockDefaultScope", EagerDeveloperWithBlockDefaultScope);

export class EagerDeveloperWithCallableDefaultScope extends Base {
  declare projects: AssociationProxy<Project>;

  static {
    this.tableName = "developers";
    this.hasAndBelongsToMany(
      "projects",
      function (this: any) {
        return this.order("projects.id");
      },
      {
        foreignKey: "developer_id",
        joinTable: "developers_projects",
      },
    );
    const call = this.includes(":projects");
    this.defaultScope({ call: () => call });
  }
}
registerConstant("EagerDeveloperWithCallableDefaultScope", EagerDeveloperWithCallableDefaultScope);

export class ThreadsafeDeveloper extends Base {
  static {
    this.tableName = "developers";
    this.defaultScope(function (this: any) {
      return this.limit(1);
    });
  }
}
registerConstant("ThreadsafeDeveloper", ThreadsafeDeveloper);

export class CachedDeveloper extends Base {
  static {
    this.tableName = "developers";
    this.cacheTimestampFormat = "number";
    this.aliasAttribute("created_at", "legacy_created_at");
    this.aliasAttribute("updated_at", "legacy_updated_at");
    this.aliasAttribute("created_on", "legacy_created_on");
    this.aliasAttribute("updated_on", "legacy_updated_on");
  }
}
registerConstant("CachedDeveloper", CachedDeveloper);

export class DeveloperWithIncorrectlyOrderedHasManyThrough extends Base {
  declare companies: AssociationProxy<Company>;
  declare contracts: AssociationProxy<Contract>;

  static {
    this.tableName = "developers";
    this.hasMany("companies", { through: "contracts" });
    this.hasMany("contracts", { foreignKey: "developer_id" });
  }
}
registerConstant(
  "DeveloperWithIncorrectlyOrderedHasManyThrough",
  DeveloperWithIncorrectlyOrderedHasManyThrough,
);

export class DeveloperName extends StringType {
  deserialize(value: unknown): string {
    return `Developer: ${value}`;
  }
}
registerConstant("DeveloperName", DeveloperName);

Type.register("developer_name", DeveloperName);

export class AttributedDeveloper extends Base {
  declare name: unknown;

  static {
    this.tableName = "developers";
    this.attribute("name", "developer_name");
    this.ignoredColumns = ["name"];
  }
}
registerConstant("AttributedDeveloper", AttributedDeveloper);

export class ColumnNamesCachedDeveloper extends Base {
  static {
    this.tableName = "developers";
    if (this.columnNames().includes("name")) this.ignoredColumns = [...this.ignoredColumns, "name"];
  }
}
registerConstant("ColumnNamesCachedDeveloper", ColumnNamesCachedDeveloper);

export class AuditRequiredDeveloper extends Base {
  declare requiredAuditLogs: AssociationProxy<AuditLogRequired>;

  static {
    this.tableName = "developers";
    this.hasMany("requiredAuditLogs", { className: "AuditLogRequired" });
  }
}
registerConstant("AuditRequiredDeveloper", AuditRequiredDeveloper);

export class DevWithAfterTouch extends Base {
  declare afterTouchCalled: boolean | undefined;

  static {
    this.tableName = "developers";
    this.aliasAttribute("created_at", "legacy_created_at");
    this.aliasAttribute("updated_at", "legacy_updated_at");
    this.aliasAttribute("created_on", "legacy_created_on");
    this.aliasAttribute("updated_on", "legacy_updated_on");
    this.afterTouch(function (this: DevWithAfterTouch) {
      this.afterTouchCalled = true;
    });
  }
}
registerConstant("DevWithAfterTouch", DevWithAfterTouch);

export class MutatingSaveKlass extends Base {
  declare legacy_updated_at: any;
  declare name: string;

  static {
    this.tableName = "developers";
    this.aliasAttribute("created_at", "legacy_created_at");
    this.aliasAttribute("updated_at", "legacy_updated_at");
    this.aliasAttribute("created_on", "legacy_created_on");
    this.aliasAttribute("updated_on", "legacy_updated_on");
    this.beforeSave(function (this: MutatingSaveKlass) {
      if (!this.isNewRecord()) {
        this.name = "Jack Bauer";
      }
    });
  }
}
registerConstant("MutatingSaveKlass", MutatingSaveKlass);

export class MutatingUpdateKlass extends Base {
  declare legacy_updated_at: any;
  declare name: string;

  static {
    this.tableName = "developers";
    this.aliasAttribute("created_at", "legacy_created_at");
    this.aliasAttribute("updated_at", "legacy_updated_at");
    this.aliasAttribute("created_on", "legacy_created_on");
    this.aliasAttribute("updated_on", "legacy_updated_on");
    this.beforeUpdate(function (this: MutatingUpdateKlass) {
      if (!this.isNewRecord()) {
        this.name = "Jack Bauer";
      }
    });
  }
}
registerConstant("MutatingUpdateKlass", MutatingUpdateKlass);

export class NonMutatingUpdateKlass extends Base {
  declare legacy_updated_at: any;
  static {
    this.tableName = "developers";
    this.aliasAttribute("created_at", "legacy_created_at");
    this.aliasAttribute("updated_at", "legacy_updated_at");
    this.aliasAttribute("created_on", "legacy_created_on");
    this.aliasAttribute("updated_on", "legacy_updated_on");
    this.beforeUpdate(function () {});
  }
}
registerConstant("NonMutatingUpdateKlass", NonMutatingUpdateKlass);
