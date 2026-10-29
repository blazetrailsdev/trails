import { Base, registerModel, type Relation } from "@blazetrails/activerecord";
import { sql } from "@blazetrails/arel";

/** @missingRailsCall connectsTo — CONVERGEABLE solid-cable-config-reads-are-async */
export class Record extends Base {
  static {
    this.abstractClass = true;
  }

  static nonBlockingLock<T extends typeof Record>(
    this: T,
    useSkipLocked: boolean,
  ): Relation<InstanceType<T>> {
    if (useSkipLocked) {
      return this.lock(sql("FOR UPDATE SKIP LOCKED") as never);
    } else {
      return this.lock();
    }
  }
}

registerModel("SolidCable::Record", Record);
