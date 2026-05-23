// vendor/rails/activerecord/test/models/course.rb
import { ARUnit2Model } from "./arunit2-model.js";

export class Course extends ARUnit2Model {
  static {
    this.belongsTo("college");
    this.hasMany("entrants");
  }
}
