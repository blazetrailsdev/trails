// vendor/rails/activerecord/test/models/developer.rb
import { StringType, typeRegistry } from "@blazetrails/activemodel";
import { Base } from "../../base.js";
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";

export class Developer extends Base {
  static instanceCount: number | undefined;

  static {
    this.ignoredColumns = ["first_name", "last_name"];

    this.hasAndBelongsToMany("projects", {
      joinTable: "developers_projects",
      associationForeignKey: "project_id",
    });

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

    this.hasAndBelongsToMany("sharedComputers", { className: "Computer" });
    this.hasMany("computers", { foreignKey: "developer" });

    this.hasAndBelongsToMany("projectsExtendedByName", {
      className: "Project",
      joinTable: "developers_projects",
      associationForeignKey: "project_id",
    });

    this.hasAndBelongsToMany("projectsExtendedByNameTwice", {
      className: "Project",
      joinTable: "developers_projects",
      associationForeignKey: "project_id",
    });

    this.hasAndBelongsToMany("projectsExtendedByNameAndBlock", {
      className: "Project",
      joinTable: "developers_projects",
      associationForeignKey: "project_id",
    });

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
    this.hasMany("strictLoadingAuditLogs", { strictLoading: true, className: "AuditLog" });
    this.hasMany("strictLoadingOptAuditLogs", { strictLoading: true, className: "AuditLog" });
    this.hasMany("contracts");
    this.hasMany("firms", { through: "contracts", source: "firm" });
    this.hasMany("comments");
    this.hasMany("ratings", { through: "comments" });

    this.hasOne("ship", { dependent: "nullify" });
    this.hasOne("strictLoadingShip", { strictLoading: true, className: "Ship" });

    this.belongsTo("firm");
    this.hasMany("contractedProjects", { className: "Project" });

    this.scope("jamises", (q: any) => q.where({ name: "Jamis" }));

    this.validates("salary", {
      inclusion: { in: { includes: (v: unknown) => Number(v) >= 50000 && Number(v) <= 200000 } },
    } as any);
    this.validates("name", { length: { in: [3, 20] } });

    this.beforeCreate(async function (this: Developer) {
      (this as any).auditLogs.build({ message: "Computer created" });
    });

    this.attribute("lastName", "string");

    this.afterFind(async function (this: Developer) {
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

acceptsNestedAttributesFor(Developer, "projects");

export class SubDeveloper extends Developer {}

export class SpecialDeveloper extends Base {
  static {
    this.tableName = "developers";
    this.hasMany("specialContracts", { foreignKey: "developer_id" });
  }
}

export class SymbolIgnoredDeveloper extends Base {
  static {
    this.tableName = "developers";
    this.ignoredColumns = ["first_name", "last_name"];
    this.attribute("lastName", "string");
  }
}

export class AuditLog extends Base {
  static {
    this.belongsTo("developer", { validate: true });
    this.belongsTo("unvalidatedDeveloper", { className: "Developer" });
  }
}

export class AuditLogRequired extends Base {
  static {
    this.tableName = "audit_logs";
    this.belongsTo("developer", { required: true });
  }
}

export class DeveloperWithBeforeDestroyRaise extends Base {
  static {
    this.tableName = "developers";
    this.hasAndBelongsToMany("projects", {
      joinTable: "developers_projects",
      foreignKey: "developer_id",
    });
    this.beforeDestroy(async function (this: DeveloperWithBeforeDestroyRaise) {
      const projects = await (this as any).projects;
      if (projects.length === 0) throw new Error();
    });
  }
}

export class DeveloperWithSelect extends Base {
  static {
    this.tableName = "developers";
    this.defaultScope((q: any) => q.select("name"));
  }
}

export class DeveloperwithDefaultMentorScopeNot extends Base {
  static {
    this.tableName = "developers";
    this.defaultScope((q: any) => q.where({ mentor_id: 1 }));
  }
}

export class DeveloperWithDefaultMentorScopeAllQueries extends Base {
  static {
    this.tableName = "developers";
    this.defaultScope((q: any) => q.where({ mentor_id: 1 }), { allQueries: true });
  }
}

export class DeveloperWithDefaultNilableFirmScopeAllQueries extends Base {
  static {
    this.tableName = "developers";
    const firmId: number | null = null;
    this.defaultScope((q: any) => (firmId != null ? q.where({ firm_id: firmId }) : q), {
      allQueries: true,
    });
  }
}

export class DeveloperWithIncludedMentorDefaultScopeNotAllQueriesAndDefaultScopeFirmWithAllQueries extends Base {
  static {
    this.tableName = "developers";
    this.defaultScope((q: any) => q.where({ mentor_id: 1 }));
    const firmId = 10;
    this.defaultScope((q: any) => (firmId != null ? q.where({ firm_id: firmId }) : q), {
      allQueries: true,
    });
  }
}

export class DeveloperWithIncludes extends Base {
  static {
    this.tableName = "developers";
    this.hasMany("auditLogs", { foreignKey: "developer_id" });
    this.defaultScope((q: any) => q.includes("auditLogs"));
  }
}

export class DeveloperFilteredOnJoins extends Base {
  static {
    this.tableName = "developers";
    this.hasAndBelongsToMany("projects", {
      foreignKey: "developer_id",
      joinTable: "developers_projects",
    });
    this.defaultScope((q: any) =>
      q.joins("projects").where({ projects: { name: "Active Controller" } }),
    );
  }
}

export class DeveloperOrderedBySalary extends Base {
  static {
    this.tableName = "developers";
    this.aliasAttribute("createdAt", "legacyCreatedAt");
    this.aliasAttribute("updatedAt", "legacyUpdatedAt");
    this.aliasAttribute("createdOn", "legacyCreatedOn");
    this.aliasAttribute("updatedOn", "legacyUpdatedOn");
    this.defaultScope((q: any) => q.order("salary DESC"));
    this.scope("byName", (q: any) => q.order("name DESC"));
  }
}

export class DeveloperCalledDavid extends Base {
  static {
    this.tableName = "developers";
    this.defaultScope((q: any) => q.where("name = 'David'"));
  }
}

export class LazyLambdaDeveloperCalledDavid extends Base {
  static {
    this.tableName = "developers";
    this.defaultScope((q: any) => q.where({ name: "David" }));
  }
}

export class LazyBlockDeveloperCalledDavid extends Base {
  static {
    this.tableName = "developers";
    this.defaultScope((q: any) => q.where({ name: "David" }));
  }
}

export class CallableDeveloperCalledDavid extends Base {
  static {
    this.tableName = "developers";
    this.defaultScope((q: any) => q.where({ name: "David" }));
  }
}

export class ClassMethodDeveloperCalledDavid extends Base {
  static {
    this.tableName = "developers";
    this.defaultScope((q: any) => q.where({ name: "David" }));
  }
}

export class ClassMethodReferencingScopeDeveloperCalledDavid extends Base {
  static {
    this.tableName = "developers";
    this.scope("david", (q: any) => q.where({ name: "David" }));
    this.defaultScope((q: any) => (ClassMethodReferencingScopeDeveloperCalledDavid as any).david());
  }
}

export class LazyBlockReferencingScopeDeveloperCalledDavid extends Base {
  static {
    this.tableName = "developers";
    this.scope("david", (q: any) => q.where({ name: "David" }));
    this.defaultScope((q: any) => (LazyBlockReferencingScopeDeveloperCalledDavid as any).david());
  }
}

export class DeveloperCalledJamis extends Base {
  static {
    this.tableName = "developers";
    this.aliasAttribute("createdAt", "legacyCreatedAt");
    this.aliasAttribute("updatedAt", "legacyUpdatedAt");
    this.aliasAttribute("createdOn", "legacyCreatedOn");
    this.aliasAttribute("updatedOn", "legacyUpdatedOn");
    this.defaultScope((q: any) => q.where({ name: "Jamis" }));
    this.scope("poor", (q: any) => q.where("salary < 150000"));
    this.scope("david", (q: any) => q.where({ name: "David" }));
    this.scope("david2", (q: any) => q.unscoped().where({ name: "David" }));
  }
}

export class PoorDeveloperCalledJamis extends Base {
  static {
    this.tableName = "developers";
    this.defaultScope((q: any) => q.where({ name: "Jamis", salary: 50000 }));
  }
}

export class InheritedPoorDeveloperCalledJamis extends DeveloperCalledJamis {
  static {
    this.tableName = "developers";
    this.defaultScope((q: any) => q.where({ salary: 50000 }));
  }
}

export class MultiplePoorDeveloperCalledJamis extends Base {
  static {
    this.tableName = "developers";
    this.defaultScope((q: any) => q);
    this.defaultScope((q: any) => q.where({ name: "Jamis" }));
    this.defaultScope((q: any) => q.where({ salary: 50000 }));
  }
}

export class ModuleIncludedPoorDeveloperCalledJamis extends DeveloperCalledJamis {
  static {
    this.tableName = "developers";
    this.defaultScope((q: any) => q.where({ salary: 50000 }));
  }
}

export class EagerDeveloperWithDefaultScope extends Base {
  static {
    this.tableName = "developers";
    this.hasAndBelongsToMany("projects", {
      foreignKey: "developer_id",
      joinTable: "developers_projects",
    });
    this.defaultScope((q: any) => q.includes("projects"));
  }
}

export class EagerDeveloperWithClassMethodDefaultScope extends Base {
  static {
    this.tableName = "developers";
    this.hasAndBelongsToMany("projects", {
      foreignKey: "developer_id",
      joinTable: "developers_projects",
    });
    this.defaultScope((q: any) => q.includes("projects"));
  }
}

export class EagerDeveloperWithLambdaDefaultScope extends Base {
  static {
    this.tableName = "developers";
    this.hasAndBelongsToMany("projects", {
      foreignKey: "developer_id",
      joinTable: "developers_projects",
    });
    this.defaultScope((q: any) => q.includes("projects"));
  }
}

export class EagerDeveloperWithBlockDefaultScope extends Base {
  static {
    this.tableName = "developers";
    this.hasAndBelongsToMany("projects", {
      foreignKey: "developer_id",
      joinTable: "developers_projects",
    });
    this.defaultScope((q: any) => q.includes("projects"));
  }
}

export class EagerDeveloperWithCallableDefaultScope extends Base {
  static {
    this.tableName = "developers";
    this.hasAndBelongsToMany("projects", {
      foreignKey: "developer_id",
      joinTable: "developers_projects",
    });
    this.defaultScope((q: any) => q.includes("projects"));
  }
}

export class ThreadsafeDeveloper extends Base {
  static {
    this.tableName = "developers";
    this.defaultScope((q: any) => q.limit(1));
  }
}

export class CachedDeveloper extends Base {
  static {
    this.tableName = "developers";
    this.aliasAttribute("createdAt", "legacyCreatedAt");
    this.aliasAttribute("updatedAt", "legacyUpdatedAt");
    this.aliasAttribute("createdOn", "legacyCreatedOn");
    this.aliasAttribute("updatedOn", "legacyUpdatedOn");
  }
}

export class DeveloperWithIncorrectlyOrderedHasManyThrough extends Base {
  static {
    this.tableName = "developers";
    this.hasMany("companies", { through: "contracts" });
    this.hasMany("contracts", { foreignKey: "developer_id" });
  }
}

export class DeveloperName extends StringType {
  deserialize(value: unknown): string {
    return `Developer: ${value}`;
  }
}

typeRegistry.register("developer_name", () => new DeveloperName());

export class AttributedDeveloper extends Base {
  static {
    this.tableName = "developers";
    this.attribute("name", "developer_name");
    this.ignoredColumns = ["name"];
  }
}

export class ColumnNamesCachedDeveloper extends Base {
  static {
    this.tableName = "developers";
  }
}

export class AuditRequiredDeveloper extends Base {
  static {
    this.tableName = "developers";
    this.hasMany("requiredAuditLogs", { className: "AuditLogRequired" });
  }
}
