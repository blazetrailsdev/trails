import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import type { AssociationProxy } from "../../lib/associations/collection-proxy.js";
import type { Section } from "./section.js";
import type { Seminar } from "./seminar.js";
import { Base } from "../../lib/base.js";

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
constSet(TopLevel, "Session", Session);
DescendantsTracker.registerSubclass(Base, Session);
