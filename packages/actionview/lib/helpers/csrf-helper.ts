import { htmlSafe, type SafeBuffer } from "@blazetrails/activesupport";
import { rbObjRespondTo, defineModule } from "@blazetrails/ruby-compat";
import { tag, type TagHelperHost } from "./tag-helper.js";

interface CsrfHelperHost extends TagHelperHost {
  isProtectAgainstForgery?(): boolean;
  formAuthenticityToken?(): string | Promise<string>;
  requestForgeryProtectionToken?: unknown;
}

export async function csrfMetaTags(this: CsrfHelperHost): Promise<SafeBuffer | null> {
  if (rbObjRespondTo(this, "isProtectAgainstForgery") && this.isProtectAgainstForgery!()) {
    return htmlSafe(
      [
        tag.call(this, "meta", {
          name: "csrf-param",
          content: this.requestForgeryProtectionToken,
        }),
        tag.call(this, "meta", {
          name: "csrf-token",
          content: await this.formAuthenticityToken!(),
        }),
      ].join("\n"),
    );
  }
  return null;
}

export const csrfMetaTag = csrfMetaTags;

export const CsrfHelper = defineModule({
  csrfMetaTags,
  csrfMetaTag,
});
