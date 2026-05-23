// vendor/rails/activerecord/test/models/job.rb
import { Base } from "../../base.js";

export class Job extends Base {
  static {
    this.hasMany("references");
    this.hasMany("people", { through: "references" });
    this.belongsTo("idealReference", { className: "Reference" });

    this.hasMany("agents", { through: "people" });
  }
}
