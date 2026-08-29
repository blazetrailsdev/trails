import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Treaty } from "./treaty.js";
import { Base } from "../../base.js";

export class Country extends Base {
  declare treaties: AssociationProxy<Treaty>;
  declare country_id: string;
  declare name: string;

  static {
    this.hasAndBelongsToMany("treaties");
  }
}
