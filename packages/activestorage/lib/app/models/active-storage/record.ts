import { Base } from "@blazetrails/activerecord";
import { runLoadHooks } from "@blazetrails/activesupport";

/** @internal */
export class Record extends Base {
  static {
    this.abstractClass = true;
  }
}

runLoadHooks("active_storage_record", Record);
