// vendor/rails/activerecord/test/models/auto_id.rb
import { Base } from "../../base.js";

export class AutoId extends Base {
  static _tableName = "auto_id_tests";
  static _primaryKey = "auto_id";
}
