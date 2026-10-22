import { registerModel } from "@blazetrails/activerecord";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Record } from "./record.js";
import { SolidQueue } from "./solid-queue.js";

export class Pause extends Record {
  declare queue_name: string;

  static {
    registerModel(rbModConstSet(SolidQueue, "Pause", this));
  }
}
