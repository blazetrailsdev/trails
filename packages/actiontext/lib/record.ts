import { Base } from "@blazetrails/activerecord";
import { runLoadHooks } from "@blazetrails/activesupport";
import { ActionText } from "./action-text.js";

export class Record extends Base {
  static {
    this.abstractClass = true;
  }
}

runLoadHooks("action_text_record", Record);
ActionText.Record = Record;
