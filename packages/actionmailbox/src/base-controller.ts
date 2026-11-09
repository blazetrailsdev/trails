import { ActionController } from "@blazetrails/actionpack";
import { TopLevel, isPresent, remove, underscore } from "@blazetrails/activesupport";
import { ArgumentError, env, rbModName } from "@blazetrails/ruby-compat";
import { ActionMailbox } from "./action-mailbox.js";

export class BaseController extends ActionController.Base {
  static {
    this.skipForgeryProtection();

    this.beforeAction(":ensureConfigured");
  }

  /** @internal */
  private ensureConfigured(): void {
    if (!(ActionMailbox.ingress === this.ingressName())) {
      this.head(":not_found");
    }
  }

  /** @internal */
  private ingressName(): string {
    return underscore(
      remove(
        rbModName(this.constructor)!,
        /^ActionMailbox::Ingresses::/,
        /::InboundEmailsController$/,
      ),
    );
  }

  /** @internal */
  private async authenticateByPassword(): Promise<unknown> {
    const password = await this.password();
    if (isPresent(password)) {
      return this.httpBasicAuthenticateOrRequestWith({
        name: "actionmailbox",
        password: password!,
        realm: "Action Mailbox",
      });
    } else {
      throw new ArgumentError("Missing required ingress credentials");
    }
  }

  /** @internal */
  private async password(): Promise<string | null | undefined> {
    const credential = (await TopLevel.Trails!.application!.credentials()).dig(
      "action_mailbox",
      "ingress_password",
    ) as string | false | null | undefined;
    return credential != null && credential !== false
      ? credential
      : env.RAILS_INBOUND_EMAIL_PASSWORD;
  }
}

ActionMailbox.BaseController = BaseController;
