import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Treaty } from "./treaty.js";
// vendor/rails/activerecord/test/models/country.rb
import { Base } from "../../base.js";

export class Country extends Base {
  declare treaties: AssociationProxy<Treaty>;
  declare country_id: string;
  declare name: string;

  static {
    this.hasAndBelongsToMany("treaties");
  }
}
