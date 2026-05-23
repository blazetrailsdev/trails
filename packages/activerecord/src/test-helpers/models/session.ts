// vendor/rails/activerecord/test/models/session.rb
import { Base } from "../../base.js";

export class Session extends Base {
  static {
    this.hasMany("sections", { inverseOf: "session", autosave: true, dependent: "destroy" });
    this.hasMany("seminars", { through: "sections" });
  }
}
