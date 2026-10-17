import { I18n } from "@blazetrails/activesupport";
import { rbObjAsString, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { add } from "../../test-helpers/support/job-buffer.js";

export class TranslatedHelloJob extends Base {
  [key: string]: any;
  static [key: string]: any;

  perform(greeter: any = "David"): any {
    const translations: any = { en: "Hello", de: "Guten Tag" };
    const hello: any = translations[I18n.locale()];
    return add(`${rbObjAsString(greeter)} says ${rbObjAsString(hello)}`);
  }
}
registerConstant("TranslatedHelloJob", TranslatedHelloJob);
