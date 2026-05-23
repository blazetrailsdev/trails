// vendor/rails/activerecord/test/models/uuid_child.rb
import { Base } from "../../base.js";

export class UuidChild extends Base {
  static {
    this.belongsTo("uuidParent");
  }
}
