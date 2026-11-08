import { Concern, extend } from "@blazetrails/activesupport";
import { classModule } from "@blazetrails/ruby-compat";
import { SolidQueue } from "../solid-queue.js";
import { Pidfile } from "./pidfile.js";
import type { ClassMethods as CallbacksClassMethods } from "../processes/callbacks.js";

interface PidfiledHost {
  _pidfile?: Pidfile;
}

export class Pidfiled {
  static readonly [classModule] = true;

  /** @internal */
  async setupPidfile(this: PidfiledHost): Promise<void> {
    const path = SolidQueue.supervisorPidfile;
    if (path != null && path !== false) {
      const pidfile = new Pidfile(String(path));
      await pidfile.setup();
      this._pidfile = pidfile;
    }
  }

  /** @internal */
  async deletePidfile(this: PidfiledHost): Promise<void> {
    await this._pidfile?.delete();
  }
}
extend(Pidfiled, Concern);
(
  Pidfiled as unknown as {
    included(base: null, block: (this: CallbacksClassMethods) => void): void;
  }
).included(null, function () {
  this.beforeBoot(":setupPidfile");
  this.afterShutdown(":deletePidfile");
});
