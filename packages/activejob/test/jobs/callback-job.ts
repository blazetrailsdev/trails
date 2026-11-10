import { block, TopLevel, constSet } from "@blazetrails/ruby-compat";
import { Base } from "../../lib/base.js";

export class CallbackJob extends Base {
  static toString(): string {
    return "CallbackJob";
  }

  perform(_person: unknown = "david"): void {}

  get history(): string[] {
    return (this._history ??= []);
  }

  private _history?: string[];
}
constSet(TopLevel, "CallbackJob", CallbackJob);

CallbackJob.beforePerform((job: CallbackJob) => job.history.push("CallbackJob ran before_perform"));
CallbackJob.afterPerform((job: CallbackJob) => job.history.push("CallbackJob ran after_perform"));

CallbackJob.beforeEnqueue((job: CallbackJob) => job.history.push("CallbackJob ran before_enqueue"));
CallbackJob.afterEnqueue((job: CallbackJob) => job.history.push("CallbackJob ran after_enqueue"));

CallbackJob.aroundPerform(
  block(async (job: CallbackJob, block: () => unknown) => {
    job.history.push("CallbackJob ran around_perform_start");
    await block();
    job.history.push("CallbackJob ran around_perform_stop");
  }),
);

CallbackJob.aroundEnqueue(
  block(async (job: CallbackJob, block: () => unknown) => {
    job.history.push("CallbackJob ran around_enqueue_start");
    await block();
    job.history.push("CallbackJob ran around_enqueue_stop");
  }),
);
