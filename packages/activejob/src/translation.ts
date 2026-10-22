import { Concern, extend } from "@blazetrails/activesupport";
import { withLocale } from "@blazetrails/i18n";
import { block as rbBlock, rbModConstSet } from "@blazetrails/ruby-compat";
import { ActiveJob } from "./namespaces.js";

interface TranslationJob {
  locale: string | null;
}

interface TranslationClass {
  aroundPerform(...filters: unknown[]): void;
}

export const Translation = {};
extend(Translation, Concern);

(
  Translation as unknown as { included(base: null, block: (this: TranslationClass) => void): void }
).included(null, function (this: TranslationClass) {
  this.aroundPerform(
    rbBlock(function (job: TranslationJob, block: () => unknown) {
      return withLocale(job.locale, block);
    }),
  );
});

rbModConstSet(ActiveJob, "Translation", Translation);
