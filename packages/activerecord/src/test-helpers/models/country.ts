import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Treaty } from "./treaty.js";
// vendor/rails/activerecord/test/models/country.rb
import { Base } from "../../base.js";

export class Country extends Base {
  declare treaties: AssociationProxy<Treaty>;
  declare country_id: string;
  declare name: string;

  // schema.rb declares `create_table :countries, id: false` with
  // `t.string :country_id, primary_key: true`; Rails infers the primary key
  // from the table. trails models declare it explicitly (cf. Subscriber#nick).
  static _primaryKey = "country_id";

  static {
    this.hasAndBelongsToMany("treaties");
  }
}
