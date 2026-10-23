import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class CallbackJob extends Base {
  declare _history: string[];

  static toString(): string {
    return "CallbackJob";
  }

  perform(_person: unknown = "david") {}

  history(): string[] {
    if (!(this._history != null && this._history !== false)) this._history = [];
    return this._history;
  }
}
registerConstant("CallbackJob", CallbackJob);
{
  CallbackJob.beforePerform((job: unknown) =>
    ((x) =>
      typeof x === "string"
        ? x + "CallbackJob ran before_perform"
        : Array.isArray(x)
          ? (x.push("CallbackJob ran before_perform"), x)
          : x instanceof globalThis.Set
            ? x.add("CallbackJob ran before_perform")
            : x.append("CallbackJob ran before_perform"))(job.history()),
  );
  CallbackJob.afterPerform((job: unknown) =>
    ((x) =>
      typeof x === "string"
        ? x + "CallbackJob ran after_perform"
        : Array.isArray(x)
          ? (x.push("CallbackJob ran after_perform"), x)
          : x instanceof globalThis.Set
            ? x.add("CallbackJob ran after_perform")
            : x.append("CallbackJob ran after_perform"))(job.history()),
  );
  CallbackJob.beforeEnqueue((job: unknown) =>
    ((x) =>
      typeof x === "string"
        ? x + "CallbackJob ran before_enqueue"
        : Array.isArray(x)
          ? (x.push("CallbackJob ran before_enqueue"), x)
          : x instanceof globalThis.Set
            ? x.add("CallbackJob ran before_enqueue")
            : x.append("CallbackJob ran before_enqueue"))(job.history()),
  );
  CallbackJob.afterEnqueue((job: unknown) =>
    ((x) =>
      typeof x === "string"
        ? x + "CallbackJob ran after_enqueue"
        : Array.isArray(x)
          ? (x.push("CallbackJob ran after_enqueue"), x)
          : x instanceof globalThis.Set
            ? x.add("CallbackJob ran after_enqueue")
            : x.append("CallbackJob ran after_enqueue"))(job.history()),
  );
  CallbackJob.aroundPerform(function (job: unknown, block: unknown) {
    ((x) =>
      typeof x === "string"
        ? x + "CallbackJob ran around_perform_start"
        : Array.isArray(x)
          ? (x.push("CallbackJob ran around_perform_start"), x)
          : x instanceof globalThis.Set
            ? x.add("CallbackJob ran around_perform_start")
            : x.append("CallbackJob ran around_perform_start"))(job.history());
    block();
    return ((x) =>
      typeof x === "string"
        ? x + "CallbackJob ran around_perform_stop"
        : Array.isArray(x)
          ? (x.push("CallbackJob ran around_perform_stop"), x)
          : x instanceof globalThis.Set
            ? x.add("CallbackJob ran around_perform_stop")
            : x.append("CallbackJob ran around_perform_stop"))(job.history());
  });
  CallbackJob.aroundEnqueue(function (job: unknown, block: unknown) {
    ((x) =>
      typeof x === "string"
        ? x + "CallbackJob ran around_enqueue_start"
        : Array.isArray(x)
          ? (x.push("CallbackJob ran around_enqueue_start"), x)
          : x instanceof globalThis.Set
            ? x.add("CallbackJob ran around_enqueue_start")
            : x.append("CallbackJob ran around_enqueue_start"))(job.history());
    block();
    return ((x) =>
      typeof x === "string"
        ? x + "CallbackJob ran around_enqueue_stop"
        : Array.isArray(x)
          ? (x.push("CallbackJob ran around_enqueue_stop"), x)
          : x instanceof globalThis.Set
            ? x.add("CallbackJob ran around_enqueue_stop")
            : x.append("CallbackJob ran around_enqueue_stop"))(job.history());
  });
}
