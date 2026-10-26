import { Base } from "@blazetrails/activejob";
import { rbFLoad, registerConstant } from "@blazetrails/ruby-compat";

export class RecurringJob extends Base {
  static toString(): string {
    return "SolidQueue::RecurringJob";
  }

  static {
    this.queueAs("solid_queue_recurring");
  }

  /** @inventedArm rbFLoad — PERMANENT */
  async perform(command: string): Promise<void> {
    await rbFLoad(command);
  }
}
registerConstant("SolidQueue::RecurringJob", RecurringJob);
