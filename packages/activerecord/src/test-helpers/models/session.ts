import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Temporal } from "@blazetrails/activesupport/temporal";
import type { Section } from "./section.js";
import type { Seminar } from "./seminar.js";
// vendor/rails/activerecord/test/models/session.rb
import { Base } from "../../base.js";

export class Session extends Base {
  declare sections: AssociationProxy<Section>;
  declare seminars: AssociationProxy<Seminar>;
  declare end_date: Temporal.PlainDate;
  declare name: string;
  declare start_date: Temporal.PlainDate;

  static {
    this.hasMany("sections", { inverseOf: "session", autosave: true, dependent: "destroy" });
    this.hasMany("seminars", { through: "sections" });
  }
}
