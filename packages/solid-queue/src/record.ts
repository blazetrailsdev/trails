import { Base, registerModel, type Relation } from "@blazetrails/activerecord";
import { sql } from "@blazetrails/arel";
import { SolidQueue } from "./solid-queue.js";

export class Record extends Base {
  static {
    this.abstractClass = true;
    this.tableNamePrefix = SolidQueue.tableNamePrefix;

    if (SolidQueue.connectsTo) this.connectsTo(SolidQueue.connectsTo);
  }

  static nonBlockingLock<T extends typeof Record>(this: T): Relation<InstanceType<T>> {
    if (SolidQueue.useSkipLocked) {
      return this.lock(sql("FOR UPDATE SKIP LOCKED") as never);
    } else {
      return this.lock();
    }
  }
}

registerModel(Record);
