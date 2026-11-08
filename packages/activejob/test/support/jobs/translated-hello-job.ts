import { locale } from "@blazetrails/i18n";
import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import { Base } from "../../../lib/base.js";
import { JobBuffer } from "../job-buffer.js";

export class TranslatedHelloJob extends Base {
  static toString(): string {
    return "TranslatedHelloJob";
  }

  perform(greeter = "David"): void {
    const translations: Record<string, string> = { en: "Hello", de: "Guten Tag" };
    const hello = translations[locale() as string];

    JobBuffer.add(`${greeter} says ${hello}`);
  }
}
constSet(TopLevel, "TranslatedHelloJob", TranslatedHelloJob);
