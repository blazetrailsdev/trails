import { locale } from "@blazetrails/i18n";
import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { JobBuffer } from "../support/job-buffer.js";

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
registerConstant("TranslatedHelloJob", TranslatedHelloJob);
