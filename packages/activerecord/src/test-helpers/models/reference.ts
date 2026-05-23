// vendor/rails/activerecord/test/models/reference.rb
import { Base } from "../../base.js";

export class Reference extends Base {
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

export class BadReference extends Base {
  static _tableName = "references";

  static {
    this.defaultScope((q: any) => q.where({ favorite: false }));
  }
}
