import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
export class QueueAdapterJob extends Base {
  static toString(): string {
    return "QueueAdapterJob";
  }
}
constSet(TopLevel, "QueueAdapterJob", QueueAdapterJob);
QueueAdapterJob.setQueueAdapter("inline");
