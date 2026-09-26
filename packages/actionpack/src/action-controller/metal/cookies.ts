import { included } from "@blazetrails/activesupport";
import { helperMethod, type HelpersClassMethods } from "../../abstract-controller/helpers.js";
import type { CookieJar } from "../../action-dispatch/middleware/cookies.js";

export class Cookies {
  static [included](base: HelpersClassMethods): void {
    helperMethod(base, "cookies");
  }

  /** @internal */
  cookies(this: { request: { cookieJar(): CookieJar } }): CookieJar {
    return this.request.cookieJar();
  }
}
