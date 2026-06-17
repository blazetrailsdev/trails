import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Country } from "./country.js";
// vendor/rails/activerecord/test/models/treaty.rb
import { Base } from "../../base.js";

export class Treaty extends Base {
  declare countries: AssociationProxy<Country>;
  declare name: string;
  declare treaty_id: string;

  // schema.rb declares `create_table :treaties, id: false` with
  // `t.string :treaty_id, primary_key: true`; Rails infers the primary key
  // from the table. trails models declare it explicitly (cf. Subscriber#nick).
  static _primaryKey = "treaty_id";

  static {
    this.hasAndBelongsToMany("countries");
  }
}
