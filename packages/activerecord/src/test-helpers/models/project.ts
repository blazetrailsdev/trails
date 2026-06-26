import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Relation } from "../../relation.js";
import type { Developer } from "./developer.js";
import type { Firm } from "./company.js";
import type { Mentor } from "./mentor.js";
// vendor/rails/activerecord/test/models/project.rb
import { Base } from "../../base.js";

export class Project extends Base {
  declare mentor: Mentor | null;
  declare developers: AssociationProxy<Developer>;
  declare readonlyDevelopers: AssociationProxy<Developer>;
  declare nonUniqueDevelopers: AssociationProxy<Developer>;
  declare limitedDevelopers: AssociationProxy<Developer>;
  declare developersNamedDavid: AssociationProxy<Developer>;
  declare developersNamedDavidWithHashConditions: AssociationProxy<Developer>;
  declare salariedDevelopers: AssociationProxy<Developer>;
  declare developersWithCallbacks: AssociationProxy<Developer>;
  declare wellPaidSalaryGroups: AssociationProxy<Developer>;
  declare firm: Firm | null;
  declare leadDeveloper: Developer | null;
  declare leadDeveloperDisableJoins: Developer | null;
  declare static allAsScope: () => Relation<Project>;
  declare loadBelongsTo: ((name: "mentor") => Promise<Mentor | null>) &
    ((name: "firm") => Promise<Firm | null>);
  declare loadHasOne: ((name: "leadDeveloper") => Promise<Developer | null>) &
    ((name: "leadDeveloperDisableJoins") => Promise<Developer | null>);
  declare firm_id: number;
  declare mentor_id: number;
  declare name: string;
  declare "type": string;

  developersLog: string[] = [];

  static {
    this.belongsTo("mentor");
    this.hasAndBelongsToMany("developers", {
      scope: (q: any) => q.distinct().order("developers.name desc, developers.id desc"),
    });
    this.hasAndBelongsToMany("readonlyDevelopers", {
      scope: (q: any) => q.readonly(),
      className: "Developer",
    });
    this.hasAndBelongsToMany("nonUniqueDevelopers", {
      scope: (q: any) => q.order("developers.name desc, developers.id desc"),
      className: "Developer",
    });
    this.hasAndBelongsToMany("limitedDevelopers", {
      scope: (q: any) => q.limit(1),
      className: "Developer",
    });
    this.hasAndBelongsToMany("developersNamedDavid", {
      scope: (q: any) => q.where("name = 'David'").distinct(),
      className: "Developer",
    });
    this.hasAndBelongsToMany("developersNamedDavidWithHashConditions", {
      scope: (q: any) => q.where({ name: "David" }).distinct(),
      className: "Developer",
    });
    this.hasAndBelongsToMany("salariedDevelopers", {
      scope: (q: any) => q.where("salary > 0"),
      className: "Developer",
    });
    this.hasAndBelongsToMany("developersWithCallbacks", {
      className: "Developer",
      beforeAdd: (o: any, r: any) => o.developersLog.push(`before_adding${r.id ?? "<new>"}`),
      afterAdd: (o: any, r: any) => o.developersLog.push(`after_adding${r.id ?? "<new>"}`),
      beforeRemove: (o: any, r: any) => o.developersLog.push(`before_removing${r.id}`),
      afterRemove: (o: any, r: any) => o.developersLog.push(`after_removing${r.id}`),
    });
    // Mirrors Rails project.rb:21-26: declare this habtm while
    // `belongs_to_required_by_default` is true so the join model's implicit
    // belongs_to sides are required, then restore the previous value.
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
    this.hasAndBelongsToMany("wellPaidSalaryGroups", {
      scope: (q: any) =>
        q.group("developers.salary").having("SUM(salary) > 10000").select("SUM(salary) as salary"),
      className: "Developer",
    });
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

    this.scope("allAsScope", (q: any) => q.all());
  }

  static allAsMethod() {
    return this.all();
  }
}

export class SpecialProject extends Project {
  declare loadBelongsTo: ((name: "mentor") => Promise<Mentor | null>) &
    ((name: "firm") => Promise<Firm | null>);
  declare loadHasOne: ((name: "leadDeveloper") => Promise<Developer | null>) &
    ((name: "leadDeveloperDisableJoins") => Promise<Developer | null>);
}
