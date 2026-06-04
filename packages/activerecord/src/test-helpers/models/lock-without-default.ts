// vendor/rails/activerecord/test/cases/locking_test.rb
import { Base } from "../../base.js";

export class LockWithoutDefault extends Base {
  static {
    this._tableName = "lock_without_defaults";
    this.attribute("title", "string");
    this.attribute("lock_version", "integer");
    this.attribute("created_at", "datetime");
    this.attribute("updated_at", "datetime");
  }
}
