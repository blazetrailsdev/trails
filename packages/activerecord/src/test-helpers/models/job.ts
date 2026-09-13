import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Person } from "./person.js";
import type { Reference } from "./reference.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Job extends Base {
  declare references: AssociationProxy<Reference>;
  declare people: AssociationProxy<Person>;
  declare agents: AssociationProxy<Person>;
  declare ideal_reference_id: number;

  static {
    this.hasMany("references");
    this.hasMany("people", { through: "references" });
    this.belongsTo("idealReference", { className: "Reference" });

    this.hasMany("agents", { through: "people" });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Job {
  get idealReference(): Reference | null | Promise<Reference | null>;
  set idealReference(value: Reference | null);
}
