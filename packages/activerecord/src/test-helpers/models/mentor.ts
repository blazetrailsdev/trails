// vendor/rails/activerecord/test/models/mentor.rb
import { Base } from "../../base.js";

export class Mentor extends Base {
  static {
    this.hasMany("developers");
  }
}
