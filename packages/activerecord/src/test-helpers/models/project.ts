import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Relation } from "../../relation.js";
import type { Developer } from "./developer.js";
import type { Firm } from "./company.js";
import type { Mentor } from "./mentor.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Project extends Base {
  declare developersRequiredByDefault: any;
  declare developers: AssociationProxy<Developer>;
  declare readonlyDevelopers: AssociationProxy<Developer>;
  declare nonUniqueDevelopers: AssociationProxy<Developer>;
  declare limitedDevelopers: AssociationProxy<Developer>;
  declare developersNamedDavid: AssociationProxy<Developer>;
  declare developersNamedDavidWithHashConditions: AssociationProxy<Developer>;
  declare salariedDevelopers: AssociationProxy<Developer>;
  declare developersWithCallbacks: AssociationProxy<Developer>;
  declare wellPaidSalaryGroups: AssociationProxy<Developer>;
  declare static allAsScope: () => Relation<Project>;
  declare firm_id: number;
  declare mentor_id: number;
  declare name: string;
  declare "type": string;

  developersLog: string[] = [];

  static {
    this.belongsTo("mentor");
    this.hasAndBelongsToMany("developers", function (this: any) {
      return this.distinct().order("developers.name desc, developers.id desc");
    });
    this.hasAndBelongsToMany(
      "readonlyDevelopers",
      function (this: any) {
        return this.readonly();
      },
      {
        className: "Developer",
      },
    );
    this.hasAndBelongsToMany(
      "nonUniqueDevelopers",
      function (this: any) {
        return this.order("developers.name desc, developers.id desc");
      },
      { className: "Developer" },
    );
    this.hasAndBelongsToMany(
      "limitedDevelopers",
      function (this: any) {
        return this.limit(1);
      },
      {
        className: "Developer",
      },
    );
    this.hasAndBelongsToMany(
      "developersNamedDavid",
      function (this: any) {
        return this.where("name = 'David'").distinct();
      },
      { className: "Developer" },
    );
    this.hasAndBelongsToMany(
      "developersNamedDavidWithHashConditions",
      function (this: any) {
        return this.where({ name: "David" }).distinct();
      },
      { className: "Developer" },
    );
    this.hasAndBelongsToMany(
      "salariedDevelopers",
      function (this: any) {
        return this.where("salary > 0");
      },
      {
        className: "Developer",
      },
    );
    this.hasAndBelongsToMany("developersWithCallbacks", {
      className: "Developer",
      beforeAdd: (o: any, r: any) => o.developersLog.push(`before_adding${r.id ?? "<new>"}`),
      afterAdd: (o: any, r: any) => o.developersLog.push(`after_adding${r.id ?? "<new>"}`),
      beforeRemove: (o: any, r: any) => o.developersLog.push(`before_removing${r.id ?? ""}`),
      afterRemove: (o: any, r: any) => o.developersLog.push(`after_removing${r.id ?? ""}`),
    });
    {
      const prev = (Base as unknown as { belongsToRequiredByDefault?: boolean })
        .belongsToRequiredByDefault;
      (Base as unknown as { belongsToRequiredByDefault?: boolean }).belongsToRequiredByDefault =
        true;
      try {
        this.hasAndBelongsToMany("developersRequiredByDefault", { className: "Developer" });
      } finally {
        (Base as unknown as { belongsToRequiredByDefault?: boolean }).belongsToRequiredByDefault =
          prev;
      }
    }
    this.hasAndBelongsToMany(
      "wellPaidSalaryGroups",
      function (this: any) {
        return this.group("developers.salary")
          .having("SUM(salary) > 10000")
          .select("SUM(salary) as salary");
      },
      { className: "Developer" },
    );
    this.belongsTo("firm");
    this.hasOne("leadDeveloper", { through: "firm", inverseOf: "contractedProjects" });
    this.hasOne("leadDeveloperDisableJoins", {
      through: "firm",
      inverseOf: "contractedProjects",
      source: "leadDeveloper",
      disableJoins: true,
    });

    this.afterInitialize(function (this: Project) {
      this.developersLog = [];
    });

    this.scope("allAsScope", function (this: any) {
      return this.all();
    });
  }

  static allAsMethod() {
    return this.all();
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Project {
  get mentor(): Mentor | null | Promise<Mentor | null>;
  set mentor(value: Mentor | null);
  get firm(): Firm | null | Promise<Firm | null>;
  set firm(value: Firm | null);
  get leadDeveloper(): Developer | null | Promise<Developer | null>;
  set leadDeveloper(value: Developer | null);
  get leadDeveloperDisableJoins(): Developer | null | Promise<Developer | null>;
  set leadDeveloperDisableJoins(value: Developer | null);
}

export class SpecialProject extends Project {}
