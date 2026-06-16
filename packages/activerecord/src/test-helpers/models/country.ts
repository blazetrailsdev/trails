// vendor/rails/activerecord/test/models/country.rb
import { Base } from "../../base.js";

export class Country extends Base {
  // schema.rb declares `create_table :countries, id: false` with
  // `t.string :country_id, primary_key: true`; Rails infers the primary key
  // from the table. trails models declare it explicitly (cf. Subscriber#nick).
  static _primaryKey = "country_id";

  static {
    this.hasAndBelongsToMany("treaties");
  }
}
