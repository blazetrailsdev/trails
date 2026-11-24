import { ActionController } from "@blazetrails/actionpack";
import { TopLevel, isPresent, remove, underscore } from "@blazetrails/activesupport";
import { ArgumentError, constSet, env, rbModName } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";
import { ActionMailbox } from "../../../action-mailbox.js";
import type { InboundEmailsController } from "../trails/conductor/action-mailbox/inbound-emails-controller.js";
import type { SourcesController } from "../trails/conductor/action-mailbox/inbound-emails/sources-controller.js";
import type { IncineratesController } from "../trails/conductor/action-mailbox/incinerates-controller.js";
import type { ReroutesController } from "../trails/conductor/action-mailbox/reroutes-controller.js";

declare module "@blazetrails/trailties/trails" {
  namespace Trails {
    let Conductor: {
      BaseController: Omit<typeof ActionController.Base, "prototype"> &
        (abstract new (...args: never[]) => ActionController.Base & {
          readonly mainApp: Record<string, (...args: unknown[]) => string>;
        });
      ActionMailbox: {
        InboundEmailsController?: typeof InboundEmailsController;
        IncineratesController?: typeof IncineratesController;
        ReroutesController?: typeof ReroutesController;
        InboundEmails: { SourcesController?: typeof SourcesController };
      };
    };
  }
}

export class BaseController extends ActionController.Base {
  static {
    this.skipForgeryProtection();

    this.beforeAction(":ensureConfigured");
  }

  /** @internal */
  private async ensureConfigured(): Promise<void> {
    if (!(ActionMailbox.ingress === this.ingressName())) {
      await this.head(":not_found");
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

constSet(ActionMailbox, "BaseController", BaseController);

Trails.Conductor.BaseController = class BaseController extends ActionController.Base {
  declare readonly mainApp: Record<string, (...args: unknown[]) => string>;

  static {
    this.layout("trails/conductor");
    this.beforeAction(":ensureDevelopmentEnv");
  }

  /** @internal */
  private async ensureDevelopmentEnv(): Promise<void> {
    if (!Trails.env.isDevelopment()) await this.head(":forbidden");
  }
};

constSet(Trails.Conductor, "BaseController", Trails.Conductor.BaseController);
