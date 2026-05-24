// vendor/rails/activerecord/test/models/too_long_table_name.rb
import { Base } from "../../base.js";

export class TooLongTableName extends Base {
  static _tableName = "toooooooooooooooooooooooooooooooooo_long_table_names";
}
