// vendor/rails/activerecord/test/models/uuid_parent.rb
import { Base } from "../../base.js";

export class UuidParent extends Base {
  static {
    this.hasMany("uuidChildren");
  }
}
