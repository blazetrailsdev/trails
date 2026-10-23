import { I18n } from "@blazetrails/activesupport";
import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { JobBuffer } from "../../test-helpers/support/job-buffer.js";

export class TranslatedHelloJob extends Base {
  static toString(): string {
    return "TranslatedHelloJob";
  }

  perform(greeter: unknown = "David") {
    const translations: Record<string, unknown> = { en: "Hello", de: "Guten Tag" };
    const hello = translations[I18n.locale()];
    return JobBuffer.add(`${greeter} says ${hello ?? ""}`);
  }
}
registerConstant("TranslatedHelloJob", TranslatedHelloJob);
