import { registerModel } from "@blazetrails/activerecord";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Execution } from "./execution.js";
import { SolidQueue } from "./solid-queue.js";

export class ReadyExecution extends Execution {
  static {
    registerModel(rbModConstSet(SolidQueue, "ReadyExecution", this));

    this.assumesAttributesFromJob();
  }
}
