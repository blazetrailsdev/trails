import { Base } from "@blazetrails/activejob";
import { registerConstant } from "@blazetrails/ruby-compat";

export class RecurringJob extends Base {
  static {
    this.queueAs("solid_queue_recurring");
  }

  async perform(command: string): Promise<void> {
    await ((await import(command)) as { default: () => unknown }).default();
  }
}
registerConstant("SolidQueue::RecurringJob", RecurringJob);
