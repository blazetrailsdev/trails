import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Section } from "./section.js";
import type { Session } from "./session.js";
// vendor/rails/activerecord/test/models/seminar.rb
import { Base } from "../../base.js";

export class Seminar extends Base {
  declare sections: AssociationProxy<Section>;
  declare sessions: AssociationProxy<Session>;
  declare name: string;

  static {
    this.hasMany("sections", { inverseOf: "seminar", autosave: true, dependent: "destroy" });
    this.hasMany("sessions", { through: "sections" });
  }
}
