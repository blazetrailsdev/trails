import { runLoadHooks } from "@blazetrails/activesupport";
import { Base, registerModel, type Relation } from "@blazetrails/activerecord";
import { sql } from "@blazetrails/arel";
import { SolidQueue } from "./solid-queue.js";

/** @missingRailsCall connectsTo — PERMANENT */
export class Record extends Base {
  static {
    this.abstractClass = true;
  }

  static nonBlockingLock<T extends typeof Record>(this: T): Relation<InstanceType<T>> {
    if (SolidQueue.useSkipLocked) {
      return this.lock(sql("FOR UPDATE SKIP LOCKED") as never);
    } else {
      return this.lock();
    }
  }
}

registerModel("SolidQueue::Record", Record);

runLoadHooks("solid_queue_record", Record);
