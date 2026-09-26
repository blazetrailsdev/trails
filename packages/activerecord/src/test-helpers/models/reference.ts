import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Author } from "./author.js";
import type { Job } from "./job.js";
import type { Person } from "./person.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Reference extends Base {
  declare idealJobs: AssociationProxy<Job>;
  declare agentsPostsAuthors: AssociationProxy<Author>;
  declare favorite: boolean;
  declare job_id: number;
  declare lock_version: number | null;
  declare person_id: number;

  static makeComments = false;

  static {
    this.belongsTo("person");
    this.belongsTo("job");
    this.hasMany("idealJobs", { className: "Job", foreignKey: "ideal_reference_id" });
    this.hasMany("agentsPostsAuthors", { through: "person" });
    this.beforeDestroy(async function (this: Reference) {
      await this.makeComments();
    });
  }

  async makeComments() {
    if ((this.constructor as typeof Reference).makeComments) {
      const person = await (this as any).person;
      if (person) await person.update({ comments: "Reference destroyed" });
    }
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Reference {
  get person(): Person | null | Promise<Person | null>;
  set person(value: Person | null);
  get job(): Job | null | Promise<Job | null>;
  set job(value: Job | null);
}

export class BadReference extends Base {
  static _tableName = "references";

  static {
    this.defaultScope(function (this: any) {
      return this.where({ favorite: false });
    });
  }
}
