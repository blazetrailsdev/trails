import { I18n, Concern } from "@blazetrails/activesupport";
import { block as rbBlock, extend, Module, rbModConstSet } from "@blazetrails/ruby-compat";
import { ActiveJob as ActiveJobSeat } from "./namespaces.js";

export const Translation: any = new Module();
extend(Translation, Concern);
Translation.included(null, function (this: any): void {
  const base = this;
  base.aroundPerform(
    rbBlock(function (this: any, job?: any, block?: any) {
      return I18n.withLocale(job.locale, block);
    }),
  );
});
rbModConstSet(ActiveJobSeat, "Translation", Translation);
