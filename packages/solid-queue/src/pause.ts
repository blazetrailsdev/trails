import { SolidQueue } from "./solid-queue.js";
import { constSet } from "@blazetrails/ruby-compat";
import { Record } from "./record.js";

export class Pause extends Record {
  declare queue_name: string;

  static {
    constSet(SolidQueue, "Pause", this);
  }
}
