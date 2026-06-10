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
// vendor/rails/activerecord/test/models/developer.rb
import { StringType, typeRegistry } from "@blazetrails/activemodel";
import { Base } from "../../base.js";
import type { Relation } from "../../relation.js";
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";

export class Developer extends Base {
  declare projects: import("@blazetrails/activerecord").AssociationProxy<Project>;
  declare mentor: Mentor | null;
  declare strictLoadingMentor: Mentor | null;
  declare strictLoadingOffMentor: Mentor | null;
  declare sharedComputers: import("@blazetrails/activerecord").AssociationProxy<Computer>;
  declare computers: import("@blazetrails/activerecord").AssociationProxy<Computer>;
  declare projectsExtendedByName: import("@blazetrails/activerecord").AssociationProxy<Project>;
  declare projectsExtendedByNameTwice: import("@blazetrails/activerecord").AssociationProxy<Project>;
  declare projectsExtendedByNameAndBlock: import("@blazetrails/activerecord").AssociationProxy<Project>;
  declare strictLoadingProjects: import("@blazetrails/activerecord").AssociationProxy<Project>;
  declare specialProjects: import("@blazetrails/activerecord").AssociationProxy<SpecialProject>;
  declare symSpecialProjects: import("@blazetrails/activerecord").AssociationProxy<SpecialProject>;
  declare auditLogs: import("@blazetrails/activerecord").AssociationProxy<AuditLog>;
  declare requiredAuditLogs: import("@blazetrails/activerecord").AssociationProxy<AuditLogRequired>;
  declare strictLoadingAuditLogs: import("@blazetrails/activerecord").AssociationProxy<AuditLog>;
  declare strictLoadingOptAuditLogs: import("@blazetrails/activerecord").AssociationProxy<AuditLog>;
  declare contracts: import("@blazetrails/activerecord").AssociationProxy<Contract>;
  declare firms: import("@blazetrails/activerecord").AssociationProxy<Firm>;
  declare comments: import("@blazetrails/activerecord").AssociationProxy<Comment>;
  declare ratings: import("@blazetrails/activerecord").AssociationProxy<Rating>;
  declare ship: Ship | null;
  declare strictLoadingShip: Ship | null;
  declare firm: Firm | null;
  declare contractedProjects: import("@blazetrails/activerecord").AssociationProxy<Project>;
  declare static jamises: () => import("@blazetrails/activerecord").Relation<Developer>;
  declare lastName: string;
  declare loadBelongsTo: ((name: "mentor") => Promise<Mentor | null>) &
    ((name: "strictLoadingMentor") => Promise<Mentor | null>) &
    ((name: "strictLoadingOffMentor") => Promise<Mentor | null>) &
    ((name: "firm") => Promise<Firm | null>);
  declare loadHasOne: ((name: "ship") => Promise<Ship | null>) &
    ((name: "strictLoadingShip") => Promise<Ship | null>);
  declare firm_id: number;
  declare first_name: string;
  declare legacy_created_at:
    | import("@blazetrails/activesupport/temporal").Temporal.Instant
    | import("@blazetrails/activesupport/temporal").Temporal.PlainDateTime;
  declare legacy_created_on:
    | import("@blazetrails/activesupport/temporal").Temporal.Instant
    | import("@blazetrails/activesupport/temporal").Temporal.PlainDateTime;
  declare legacy_updated_at:
    | import("@blazetrails/activesupport/temporal").Temporal.Instant
    | import("@blazetrails/activesupport/temporal").Temporal.PlainDateTime;
  declare legacy_updated_on:
    | import("@blazetrails/activesupport/temporal").Temporal.Instant
    | import("@blazetrails/activesupport/temporal").Temporal.PlainDateTime;
  declare mentor_id: number;
  declare name: string;
  declare salary: number | null;

  static instanceCount: number | undefined;

  // Rails `module ProjectsAssociationExtension { def find_most_recent ... }`
  // and `ProjectsAssociationExtension2 { def find_least_recent ... }`, mixed
  // onto the HABTM `projects*` proxies per AssociationsExtensionsTest.
  static projectsAssociationExtension = {
    async findMostRecent(this: Relation<Base>) {
      return this.order("id DESC").first();
    },
  };

  static projectsAssociationExtension2 = {
    async findLeastRecent(this: Relation<Base>) {
      return this.order("id ASC").first();
    },
  };

  static {
    this.ignoredColumns = ["first_name", "last_name"];

    this.hasAndBelongsToMany("projects", {
      joinTable: "developers_projects",
      associationForeignKey: "project_id",
      // Rails: `has_and_belongs_to_many :projects do def find_most_recent ... end`
      extend: {
        async findMostRecent(this: Relation<Base>) {
          return this.order("id DESC").first();
        },
      },
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
      // Rails: `-> { extending(ProjectsAssociationExtension) }`
      extend: Developer.projectsAssociationExtension,
    });

    this.hasAndBelongsToMany("projectsExtendedByNameTwice", {
      className: "Project",
      joinTable: "developers_projects",
      associationForeignKey: "project_id",
      // Rails: `-> { extending(ProjectsAssociationExtension, ProjectsAssociationExtension2) }`
      extend: [Developer.projectsAssociationExtension, Developer.projectsAssociationExtension2],
    });

    this.hasAndBelongsToMany("projectsExtendedByNameAndBlock", {
      className: "Project",
      joinTable: "developers_projects",
      associationForeignKey: "project_id",
      // Rails: `-> { extending(ProjectsAssociationExtension) } do def find_least_recent ... end`
      extend: [
        Developer.projectsAssociationExtension,
        {
          async findLeastRecent(this: Relation<Base>) {
            return this.order("id ASC").first();
          },
        },
      ],
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

    // Rails: `before_create do |developer| developer.audit_logs.build ... end`
    // — the record arrives as the callback argument, not `this`.
    this.beforeCreate(async function (developer: Developer) {
      (developer as any).auditLogs.build({ message: "Computer created" });
    });

    // Rails `attribute :last_name, :string` — there is no `last_name` column
    // (the developers table has only `first_name`), so it's a virtual attribute
    // and must be excluded from `SELECT developers.*`.
    this.attribute("lastName", "string", { virtual: true });

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

acceptsNestedAttributesFor(Developer, "projects");

export class SubDeveloper extends Developer {}

export class SpecialDeveloper extends Base {
  declare specialContracts: import("@blazetrails/activerecord").AssociationProxy<SpecialContract>;

  static {
    this.tableName = "developers";
    this.hasMany("specialContracts", { foreignKey: "developer_id" });
  }
}

export class SymbolIgnoredDeveloper extends Base {
  declare lastName: string;

  static {
    this.tableName = "developers";
    this.ignoredColumns = ["first_name", "last_name"];
    this.attribute("lastName", "string", { virtual: true });
  }
}

export class AuditLog extends Base {
  declare developer: Developer | null;
  declare unvalidatedDeveloper: Developer | null;
  declare loadBelongsTo: ((name: "developer") => Promise<Developer | null>) &
    ((name: "unvalidatedDeveloper") => Promise<Developer | null>);
  declare developer_id: number;
  declare message: string;
  declare unvalidated_developer_id: number;

  static {
    this.belongsTo("developer", { validate: true });
    this.belongsTo("unvalidatedDeveloper", { className: "Developer" });
  }
}

export class AuditLogRequired extends Base {
  declare developer: Developer | null;
  declare loadBelongsTo: (name: "developer") => Promise<Developer | null>;

  static {
    this.tableName = "audit_logs";
    this.belongsTo("developer", { required: true });
  }
}

export class DeveloperWithBeforeDestroyRaise extends Base {
  declare projects: import("@blazetrails/activerecord").AssociationProxy<Project>;

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
  declare auditLogs: import("@blazetrails/activerecord").AssociationProxy<AuditLog>;

  static {
    this.tableName = "developers";
    this.hasMany("auditLogs", { foreignKey: "developer_id" });
    this.defaultScope((q: any) => q.includes("auditLogs"));
  }
}

export class DeveloperFilteredOnJoins extends Base {
  declare projects: import("@blazetrails/activerecord").AssociationProxy<Project>;

  static {
    this.tableName = "developers";
    this.hasAndBelongsToMany("projects", {
      scope: (q: any) => q.order("projects.id"),
      foreignKey: "developer_id",
      joinTable: "developers_projects",
    });
    this.defaultScope((q: any) =>
      q.joins("projects").where({ projects: { name: "Active Controller" } }),
    );
  }
}

export class DeveloperOrderedBySalary extends Base {
  declare static byName: () => import("@blazetrails/activerecord").Relation<DeveloperOrderedBySalary>;

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
  declare static david: () => import("@blazetrails/activerecord").Relation<ClassMethodReferencingScopeDeveloperCalledDavid>;

  static {
    this.tableName = "developers";
    this.scope("david", (q: any) => q.where({ name: "David" }));
    this.defaultScope((q: any) => (ClassMethodReferencingScopeDeveloperCalledDavid as any).david());
  }
}

export class LazyBlockReferencingScopeDeveloperCalledDavid extends Base {
  declare static david: () => import("@blazetrails/activerecord").Relation<LazyBlockReferencingScopeDeveloperCalledDavid>;

  static {
    this.tableName = "developers";
    this.scope("david", (q: any) => q.where({ name: "David" }));
    this.defaultScope((q: any) => (LazyBlockReferencingScopeDeveloperCalledDavid as any).david());
  }
}

export class DeveloperCalledJamis extends Base {
  declare static poor: () => import("@blazetrails/activerecord").Relation<DeveloperCalledJamis>;
  declare static david: () => import("@blazetrails/activerecord").Relation<DeveloperCalledJamis>;
  declare static david2: () => import("@blazetrails/activerecord").Relation<DeveloperCalledJamis>;

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
  declare projects: import("@blazetrails/activerecord").AssociationProxy<Project>;

  static {
    this.tableName = "developers";
    this.hasAndBelongsToMany("projects", {
      scope: (q: any) => q.order("projects.id"),
      foreignKey: "developer_id",
      joinTable: "developers_projects",
    });
    this.defaultScope((q: any) => q.includes("projects"));
  }
}

export class EagerDeveloperWithClassMethodDefaultScope extends Base {
  declare projects: import("@blazetrails/activerecord").AssociationProxy<Project>;

  static {
    this.tableName = "developers";
    this.hasAndBelongsToMany("projects", {
      scope: (q: any) => q.order("projects.id"),
      foreignKey: "developer_id",
      joinTable: "developers_projects",
    });
    this.defaultScope((q: any) => q.includes("projects"));
  }
}

export class EagerDeveloperWithLambdaDefaultScope extends Base {
  declare projects: import("@blazetrails/activerecord").AssociationProxy<Project>;

  static {
    this.tableName = "developers";
    this.hasAndBelongsToMany("projects", {
      scope: (q: any) => q.order("projects.id"),
      foreignKey: "developer_id",
      joinTable: "developers_projects",
    });
    this.defaultScope((q: any) => q.includes("projects"));
  }
}

export class EagerDeveloperWithBlockDefaultScope extends Base {
  declare projects: import("@blazetrails/activerecord").AssociationProxy<Project>;

  static {
    this.tableName = "developers";
    this.hasAndBelongsToMany("projects", {
      scope: (q: any) => q.order("projects.id"),
      foreignKey: "developer_id",
      joinTable: "developers_projects",
    });
    this.defaultScope((q: any) => q.includes("projects"));
  }
}

export class EagerDeveloperWithCallableDefaultScope extends Base {
  declare projects: import("@blazetrails/activerecord").AssociationProxy<Project>;

  static {
    this.tableName = "developers";
    this.hasAndBelongsToMany("projects", {
      scope: (q: any) => q.order("projects.id"),
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
  declare companies: import("@blazetrails/activerecord").AssociationProxy<Company>;
  declare contracts: import("@blazetrails/activerecord").AssociationProxy<Contract>;

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
  declare name: unknown;

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
  declare requiredAuditLogs: import("@blazetrails/activerecord").AssociationProxy<AuditLogRequired>;

  static {
    this.tableName = "developers";
    this.hasMany("requiredAuditLogs", { className: "AuditLogRequired" });
  }
}
