import { Concern, extend } from "@blazetrails/activesupport";
import { classModule } from "@blazetrails/ruby-compat";
import type { Job } from "../job.js";

export class Recurrable {
  static readonly [classModule] = true;
}
extend(Recurrable, Concern);
(
  Recurrable as unknown as {
    included(base: null, block: (this: typeof Job) => void): void;
  }
).included(null, function (this: typeof Job) {
  this.hasOne("recurringExecution", { dependent: "destroy" });
});
