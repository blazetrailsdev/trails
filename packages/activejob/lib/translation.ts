import { Concern, extend } from "@blazetrails/activesupport";
import { withLocale } from "@blazetrails/i18n";
import { block as rbBlock } from "@blazetrails/ruby-compat";

interface TranslationJob {
  locale: string | null;
}

interface TranslationClass {
  aroundPerform(...filters: unknown[]): void;
}

export const Translation = {};
extend(Translation, Concern);

Concern.included.call(Translation as never, null, function (this: TranslationClass) {
  this.aroundPerform(
    rbBlock(function (job: TranslationJob, block: () => unknown) {
      return withLocale(job.locale, block);
    }),
  );
});
