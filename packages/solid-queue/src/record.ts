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
      return this.lock(sql("FOR UPDATE SKIP LOCKED"));
    } else {
      return this.lock();
    }
  }
}

registerModel("SolidQueue::Record", Record);

runLoadHooks("solid_queue_record", Record);

declare module "@blazetrails/activerecord" {
  // eslint-disable-next-line unused-imports/no-unused-vars -- the augmented interface must repeat RelationScopes<T>
  interface RelationScopes<T extends import("@blazetrails/activerecord").Base> {
    nonBlockingLock<R extends Record>(this: Relation<R>): Relation<R>;
  }
}
