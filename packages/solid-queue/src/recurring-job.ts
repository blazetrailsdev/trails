import { Base } from "@blazetrails/activejob";

export class RecurringJob extends Base {
  static {
    this.queueAs("solid_queue_recurring");
  }

  async perform(command: string): Promise<void> {
    await ((await import(command)) as { default: () => unknown }).default();
  }
}
