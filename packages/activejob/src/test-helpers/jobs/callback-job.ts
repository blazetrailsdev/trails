import { rtest, registerConstant, block as rbBlock } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { rbAppend } from "../../codegen-runtime.js";

export class CallbackJob extends Base {
  [key: string]: any;
  static [key: string]: any;

  perform(person: any = "david"): any {}

  history(): any {
    if (!rtest(this._history)) this._history = [];
    return this._history;
  }
}
registerConstant("CallbackJob", CallbackJob);
{
  CallbackJob.beforePerform((job?: any) =>
    rbAppend(job.history(), "CallbackJob ran before_perform"),
  );
  CallbackJob.afterPerform((job?: any) => rbAppend(job.history(), "CallbackJob ran after_perform"));
  CallbackJob.beforeEnqueue((job?: any) =>
    rbAppend(job.history(), "CallbackJob ran before_enqueue"),
  );
  CallbackJob.afterEnqueue((job?: any) => rbAppend(job.history(), "CallbackJob ran after_enqueue"));
  CallbackJob.aroundPerform(
    rbBlock(function (this: any, job?: any, block?: any) {
      rbAppend(job.history(), "CallbackJob ran around_perform_start");
      block();
      return rbAppend(job.history(), "CallbackJob ran around_perform_stop");
    }),
  );
  CallbackJob.aroundEnqueue(
    rbBlock(function (this: any, job?: any, block?: any) {
      rbAppend(job.history(), "CallbackJob ran around_enqueue_start");
      block();
      return rbAppend(job.history(), "CallbackJob ran around_enqueue_stop");
    }),
  );
}
