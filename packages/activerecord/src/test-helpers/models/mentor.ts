import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Developer } from "./developer.js";
// vendor/rails/activerecord/test/models/mentor.rb
import { Base } from "../../base.js";

export class Mentor extends Base {
  declare developers: AssociationProxy<Developer>;
  declare name: string;

  static {
    this.hasMany("developers");
  }
}
