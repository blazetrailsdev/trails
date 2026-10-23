import { registerModel } from "@blazetrails/activerecord";
import { Record } from "./record.js";

export class Pause extends Record {
  declare queue_name: string;

  static {
    registerModel(this);
  }
}
