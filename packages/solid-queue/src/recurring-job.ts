import { Base } from "@blazetrails/activejob";
import { registerConstant } from "@blazetrails/ruby-compat";

export class RecurringJob extends Base {
  static toString(): string {
    return "SolidQueue::RecurringJob";
  }

  static {
    this.queueAs("solid_queue_recurring");
  }

  async perform(command: string): Promise<void> {
    await import(command);
  }
}
registerConstant("SolidQueue::RecurringJob", RecurringJob);
