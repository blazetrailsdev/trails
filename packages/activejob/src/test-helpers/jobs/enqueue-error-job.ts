import { RuntimeError, registerConstant, isEmpty } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { EnqueueError } from "../../enqueuing.js";

export class EnqueueErrorJob extends Base {
  [key: string]: any;
  static [key: string]: any;

  perform(): any {
    throw new RuntimeError("This should never be called");
  }
}
registerConstant("EnqueueErrorJob", EnqueueErrorJob);
export class EnqueueErrorAdapter {
  [key: string]: any;
  static [key: string]: any;

  enqueue(...rest: any[]): any {
    if (this.shouldRaise()) {
      throw new EnqueueError("There was an error enqueuing the job");
    }
    return null;
  }

  enqueueAt(...rest: any[]): any {
    if (this.shouldRaise()) {
      throw new EnqueueError("There was an error enqueuing the job");
    }
    return null;
  }

  /** @internal */
  protected shouldRaise(): any {
    return (
      isEmpty((this.constructor as typeof EnqueueErrorAdapter).shouldRaiseSequence) ||
      (this.constructor as typeof EnqueueErrorAdapter).shouldRaiseSequence.shift()
    );
  }

  static get shouldRaiseSequence(): any {
    return this._shouldRaiseSequence;
  }

  static set shouldRaiseSequence(value: any) {
    this._shouldRaiseSequence = value;
  }
}
registerConstant("EnqueueErrorJob::EnqueueErrorAdapter", EnqueueErrorAdapter);
{
  EnqueueErrorAdapter.shouldRaiseSequence = [];
}
EnqueueErrorJob.setQueueAdapter(new EnqueueErrorAdapter());
