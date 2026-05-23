// vendor/rails/activerecord/test/models/treaty.rb
import { Base } from "../../base.js";

export class Treaty extends Base {
  static {
    this.hasAndBelongsToMany("countries");
  }
}
