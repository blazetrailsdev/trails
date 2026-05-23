// vendor/rails/activerecord/test/models/student.rb
import { Base } from "../../base.js";

export class Student extends Base {
  static {
    this.hasAndBelongsToMany("lessons");
    this.belongsTo("college");
  }
}
