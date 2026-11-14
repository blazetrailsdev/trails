import { Base } from "@blazetrails/activerecord";
import { runLoadHooks } from "@blazetrails/activesupport";
import { ActionMailbox } from "./action-mailbox.js";

/** @internal */
export class Record extends Base {
  static {
    this.abstractClass = true;
  }
}

ActionMailbox.Record = Record;

runLoadHooks("action_mailbox_record", Record);
