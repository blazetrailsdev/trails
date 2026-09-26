import { ActionController } from "@blazetrails/actionpack";
import { TopLevel, htmlSafe } from "@blazetrails/activesupport";

export class ApplicationController extends ActionController.Base {
  static {
    this.layout("application");
  }

  /** @internal */
  requireLocalBang(): void {
    if (!this.isLocalRequest()) {
      this.render({
        html: htmlSafe(
          "<p>For security purposes, this information is only available to local requests.</p>",
        ),
        status: "forbidden",
      });
    }
  }

  /** @internal */
  isLocalRequest(): boolean {
    return TopLevel.Trails!.application!.config.considerAllRequestsLocal || this.request.isLocal;
  }

  /** @internal */
  disableContentSecurityPolicyNonceBang(): void {
    this.request.contentSecurityPolicyNonceGenerator = null;
  }
}

ApplicationController.prependViewPath(new URL("./templates", import.meta.url).href);
ApplicationController.beforeAction("disableContentSecurityPolicyNonceBang");
ApplicationController.contentSecurityPolicy((policy) => {
  policy.scriptSrc(":self", ":unsafe_inline");
  policy.styleSrc(":self", ":unsafe_inline");
});
