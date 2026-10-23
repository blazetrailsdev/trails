import { RuntimeError, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { EnqueueError } from "../../enqueuing.js";

export class EnqueueErrorJob extends Base {
  static toString(): string {
    return "EnqueueErrorJob";
  }

  perform() {
    throw new RuntimeError("This should never be called");
  }
}
registerConstant("EnqueueErrorJob", EnqueueErrorJob);
export class EnqueueErrorAdapter {
  declare static _shouldRaiseSequence: boolean[];

  static toString(): string {
    return "EnqueueErrorJob::EnqueueErrorAdapter";
  }

  enqueue(...rest: unknown[]) {
    if (this.shouldRaise()) {
      throw new EnqueueError("There was an error enqueuing the job");
    }
    return null;
  }

  enqueueAt(...rest: unknown[]) {
    if (this.shouldRaise()) {
      throw new EnqueueError("There was an error enqueuing the job");
    }
    return null;
  }

  /** @internal */
  protected shouldRaise() {
    return (
      (this.constructor as typeof EnqueueErrorAdapter).shouldRaiseSequence.length === 0 ||
      (this.constructor as typeof EnqueueErrorAdapter).shouldRaiseSequence.shift()
    );
  }

  static get shouldRaiseSequence() {
    return this._shouldRaiseSequence ?? null;
  }

  static set shouldRaiseSequence(value) {
    this._shouldRaiseSequence = value;
  }
}
registerConstant("EnqueueErrorJob::EnqueueErrorAdapter", EnqueueErrorAdapter);
{
  EnqueueErrorAdapter.shouldRaiseSequence = [];
}
EnqueueErrorJob.setQueueAdapter(new EnqueueErrorAdapter());
