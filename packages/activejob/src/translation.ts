import { Concern, I18n } from "@blazetrails/activesupport";
import { extend, classModule, Extended } from "@blazetrails/ruby-compat";
import type { Base } from "./base.js";

export class Translation {
  declare static included: Extended<typeof Concern>["included"];

  static readonly [classModule] = true;

  static toString(): string {
    return "ActiveJob::Translation";
  }
}
extend(Translation, Concern);
Translation.included(null, function (this: typeof Base): void {
  this.aroundPerform(function (this: Base, job: unknown, block: unknown) {
    return I18n.withLocale(job.locale, block as () => unknown);
  });
});
