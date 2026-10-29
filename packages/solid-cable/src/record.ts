import { runLoadHooks } from "@blazetrails/activesupport";
import { Base, registerModel, type Relation } from "@blazetrails/activerecord";
import { sql } from "@blazetrails/arel";
import { SolidCable } from "./solid-cable.js";

export class Record extends Base {
  static {
    this.abstractClass = true;
  }

  static nonBlockingLock<T extends typeof Record>(this: T): Relation<InstanceType<T>> {
    if (SolidCable.useSkipLocked()) {
      return this.lock(sql("FOR UPDATE SKIP LOCKED"));
    } else {
      return this.lock();
    }
  }
}

registerModel("SolidCable::Record", Record);
runLoadHooks("solid_cable_record", Record);

declare module "@blazetrails/activerecord" {
  // eslint-disable-next-line unused-imports/no-unused-vars
  interface RelationScopes<T extends import("@blazetrails/activerecord").Base> {
    nonBlockingLock<R extends Record>(this: Relation<R>): Relation<R>;
  }
}
