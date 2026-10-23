import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
export class QueueAdapterJob extends Base {
  static toString(): string {
    return "QueueAdapterJob";
  }
}
registerConstant("QueueAdapterJob", QueueAdapterJob);
QueueAdapterJob.setQueueAdapter("inline");
