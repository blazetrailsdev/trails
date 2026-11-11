import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import { Base } from "../../lib/base.js";
import { EnqueueError } from "../../lib/enqueuing.js";

class EnqueueErrorAdapter {
  static shouldRaiseSequence: boolean[] = [];

  enqueue(..._args: unknown[]): void {
    if (this.isShouldRaise()) throw new EnqueueError("There was an error enqueuing the job");
  }

  enqueueAt(..._args: unknown[]): void {
    if (this.isShouldRaise()) throw new EnqueueError("There was an error enqueuing the job");
  }

  private isShouldRaise(): boolean {
    return (
      EnqueueErrorAdapter.shouldRaiseSequence.length === 0 ||
      EnqueueErrorAdapter.shouldRaiseSequence.shift()!
    );
  }
}

export class EnqueueErrorJob extends Base {
  static toString(): string {
    return "EnqueueErrorJob";
  }

  static EnqueueErrorAdapter = EnqueueErrorAdapter;
  declare static disableTestAdapter: () => void;

  perform(): void {
    throw new Error("This should never be called");
  }
}
EnqueueErrorJob.queueAdapter = new EnqueueErrorAdapter();
constSet(TopLevel, "EnqueueErrorJob", EnqueueErrorJob);
