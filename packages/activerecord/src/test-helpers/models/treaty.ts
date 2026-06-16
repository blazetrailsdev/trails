// vendor/rails/activerecord/test/models/treaty.rb
import { Base } from "../../base.js";

export class Treaty extends Base {
  // schema.rb declares `create_table :treaties, id: false` with
  // `t.string :treaty_id, primary_key: true`; Rails infers the primary key
  // from the table. trails models declare it explicitly (cf. Subscriber#nick).
  static _primaryKey = "treaty_id";

  static {
    this.hasAndBelongsToMany("countries");
  }
}
