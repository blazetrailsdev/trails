import { htmlSafe, type SafeBuffer } from "@blazetrails/activesupport";
import { Module, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { tag, type TagHelperHost } from "./tag-helper.js";

interface CsrfHelperHost extends TagHelperHost {
  isProtectAgainstForgery?(): boolean;
  formAuthenticityToken?(): string;
  requestForgeryProtectionToken?: unknown;
}

export function csrfMetaTags(this: CsrfHelperHost): SafeBuffer | null {
  if (rbObjRespondTo(this, "isProtectAgainstForgery", true) && this.isProtectAgainstForgery!()) {
    return htmlSafe(
      [
        tag.call(this, "meta", { name: "csrf-param", content: this.requestForgeryProtectionToken }),
        tag.call(this, "meta", { name: "csrf-token", content: this.formAuthenticityToken!() }),
      ].join("\n"),
    );
  }
  return null;
}

export const csrfMetaTag = csrfMetaTags;

export const CsrfHelper = new Module((mod) => {
  mod.moduleEval((m) => {
    Object.assign(m, { csrfMetaTags, csrfMetaTag });
  });
});
