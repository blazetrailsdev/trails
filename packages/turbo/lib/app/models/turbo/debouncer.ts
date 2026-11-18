import { ScheduledTask } from "@blazetrails/ruby-compat";
import { Turbo } from "../../../turbo-trails.js";

export class Debouncer {
  static readonly DEFAULT_DELAY = 0.5;

  readonly delay: number;
  /** @internal */
  private _scheduledTask: ScheduledTask | null;

  get scheduledTask(): ScheduledTask | null {
    return this._scheduledTask;
  }

  constructor({ delay = Debouncer.DEFAULT_DELAY }: { delay?: number } = {}) {
    this.delay = delay;
    this._scheduledTask = null;
  }

  debounce(block: () => unknown): ScheduledTask {
    if (!this.scheduledTask?.isComplete()) this.scheduledTask?.cancel();
    return (this._scheduledTask = ScheduledTask.execute(this.delay, {}, block));
  }

  wait(): Promise<unknown> | undefined {
    return this.scheduledTask?.wait(this.waitTimeout());
  }

  /** @internal */
  private waitTimeout(): number {
    return this.delay + 1;
  }
}
Turbo.Debouncer = Debouncer;
