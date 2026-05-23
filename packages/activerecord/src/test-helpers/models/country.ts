// vendor/rails/activerecord/test/models/country.rb
import { Base } from "../../base.js";

export class Country extends Base {
  static {
    this.hasAndBelongsToMany("treaties");
  }
}
