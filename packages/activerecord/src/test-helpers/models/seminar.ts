// vendor/rails/activerecord/test/models/seminar.rb
import { Base } from "../../base.js";

export class Seminar extends Base {
  static {
    this.hasMany("sections", { inverseOf: "seminar", autosave: true, dependent: "destroy" });
    this.hasMany("sessions", { through: "sections" });
  }
}
