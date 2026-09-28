import { included } from "@blazetrails/activesupport";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import type { helperMethod } from "../../abstract-controller/helpers.js";
import type { CookieJar } from "../../action-dispatch/middleware/cookies.js";

export class Cookies {
  static [included](base: { name: string; helperMethod?: typeof helperMethod }): void {
    if (rbObjRespondTo(base, "helperMethod", true)) base.helperMethod!("cookies");
  }

  /** @internal */
  cookies(this: { request: { cookieJar(): CookieJar } }): CookieJar {
    return this.request.cookieJar();
  }
}
