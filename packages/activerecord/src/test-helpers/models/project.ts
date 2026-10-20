import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Relation } from "../../relation.js";
import type { Developer } from "./developer.js";
import type { Firm } from "./company.js";
import type { Mentor } from "./mentor.js";
import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

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

  declare developersLog: string[];

  static {
    this.belongsTo("mentor");
    this.hasAndBelongsToMany("developers", function () {
      return this.distinct().order("developers.name desc, developers.id desc");
    });
    this.hasAndBelongsToMany(
      "readonlyDevelopers",
      function () {
        return this.readonly();
      },
      {
        className: "Developer",
      },
    );
    this.hasAndBelongsToMany(
      "nonUniqueDevelopers",
      function () {
        return this.order("developers.name desc, developers.id desc");
      },
      { className: "Developer" },
    );
    this.hasAndBelongsToMany(
      "limitedDevelopers",
      function () {
        return this.limit(1);
      },
      {
        className: "Developer",
      },
    );
    this.hasAndBelongsToMany(
      "developersNamedDavid",
      function () {
        return this.where("name = 'David'").distinct();
      },
      { className: "Developer" },
    );
    this.hasAndBelongsToMany(
      "developersNamedDavidWithHashConditions",
      function () {
        return this.where({ name: "David" }).distinct();
      },
      { className: "Developer" },
    );
    this.hasAndBelongsToMany(
      "salariedDevelopers",
      function () {
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
      function () {
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

    this.scope("allAsScope", function () {
      return this.all();
    });
  }

  static allAsMethod() {
    return this.all();
  }
}
registerModel(Project);
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
registerModel(SpecialProject);
