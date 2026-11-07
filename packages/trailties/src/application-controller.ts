import { ActionController } from "@blazetrails/actionpack";
import { TopLevel, htmlSafe } from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat";

export class ApplicationController extends ActionController.Base {
  static {
    this.layout("application");
  }

  /** @internal */
  async requireLocalBang(): Promise<void> {
    if (!this.isLocalRequest()) {
      await this.render({
        html: htmlSafe(
          "<p>For security purposes, this information is only available to local requests.</p>",
        ),
        status: ":forbidden",
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

ApplicationController.prependViewPath(File.expandPath("templates", import.meta.dirname));
ApplicationController.beforeAction(":disableContentSecurityPolicyNonceBang");
ApplicationController.contentSecurityPolicy(undefined, undefined, (policy) => {
  policy.scriptSrc(":self", ":unsafe_inline");
  policy.styleSrc(":self", ":unsafe_inline");
});
