import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Person } from "./person.js";
import type { Reference } from "./reference.js";
// vendor/rails/activerecord/test/models/job.rb
import { Base } from "../../base.js";

export class Job extends Base {
  declare references: AssociationProxy<Reference>;
  declare people: AssociationProxy<Person>;
  declare idealReference: Reference | null;
  declare agents: AssociationProxy<Person>;
  declare loadBelongsTo: (name: "idealReference") => Promise<Reference | null>;
  declare ideal_reference_id: number;

  static {
    this.hasMany("references");
    this.hasMany("people", { through: "references" });
    this.belongsTo("idealReference", { className: "Reference" });

    this.hasMany("agents", { through: "people" });
  }
}
