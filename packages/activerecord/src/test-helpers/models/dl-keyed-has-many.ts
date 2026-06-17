// vendor/rails/activerecord/test/models/dl_keyed_has_many.rb
import { Base } from "../../base.js";

export class DlKeyedHasMany extends Base {
  declare destroy_async_parent_id: number;
  declare many_key: number;

  static _primaryKey = "many_key";
}
