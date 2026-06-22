import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Country } from "./country.js";
// vendor/rails/activerecord/test/models/treaty.rb
import { Base } from "../../base.js";

export class Treaty extends Base {
  declare countries: AssociationProxy<Country>;
  declare name: string;
  declare treaty_id: string;

  static {
    this.hasAndBelongsToMany("countries");
  }
}
