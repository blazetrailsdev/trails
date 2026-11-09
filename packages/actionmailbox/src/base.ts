import {
  Notifications,
  Rescuable,
  delegate,
  include,
  runLoadHooks,
  type Callbacks as ASCallbacks,
  type Extended,
  type Included,
  type Logger,
} from "@blazetrails/activesupport";
import type { Message } from "@blazetrails/mail";
import { ActionMailbox } from "./action-mailbox.js";
import { Callbacks, type ClassMethods as CallbacksClassMethods } from "./callbacks.js";
import type { InboundEmail } from "./inbound-email.js";
import type { Router } from "./router.js";
import { Routing, type ClassMethods as RoutingClassMethods } from "./routing.js";

interface DeliverableMessage {
  deliverLater(): unknown;
  deliverNow(): unknown;
}

export class Base {
  declare static setCallback: Extended<typeof ASCallbacks.ClassMethods>["setCallback"];
  declare static beforeProcessing: (typeof CallbacksClassMethods)["beforeProcessing"];
  declare static afterProcessing: (typeof CallbacksClassMethods)["afterProcessing"];
  declare static aroundProcessing: (typeof CallbacksClassMethods)["aroundProcessing"];
  declare static rescueHandlers: unknown[][];
  declare static rescueFrom: (typeof Rescuable.ClassMethods)["rescueFrom"];
  declare static router: Router;
  declare static routing: (typeof RoutingClassMethods)["routing"];
  declare static route: (typeof RoutingClassMethods)["route"];
  declare static mailboxFor: (typeof RoutingClassMethods)["mailboxFor"];
  declare runCallbacks: (kind: string, block?: () => unknown) => unknown;
  declare rescueWithHandler: Included<typeof Rescuable>["rescueWithHandler"];
  declare mail: () => Promise<Message>;
  declare deliveredBang: () => Promise<unknown>;
  declare bouncedBang: () => Promise<unknown>;
  declare readonly logger: Logger | null;

  readonly inboundEmail: InboundEmail;

  static async receive(inboundEmail: InboundEmail): Promise<unknown> {
    return await new this(inboundEmail).performProcessing();
  }

  constructor(inboundEmail: InboundEmail) {
    this.inboundEmail = inboundEmail;
  }

  /** @internal */
  async performProcessing(): Promise<unknown> {
    return await Notifications.instrument(
      "process.action_mailbox",
      this.instrumentationPayload(),
      async () => {
        try {
          return await this.trackStatusOfInboundEmail(
            async () => await this.runCallbacks("process", async () => await this.process()),
          );
        } catch (exception) {
          const handled = await this.rescueWithHandler(exception);
          if (handled == null || handled === false) throw exception;
          return handled;
        }
      },
    );
  }

  process(): unknown {
    return undefined;
  }

  /** @internal */
  isFinishedProcessing(): boolean {
    return this.inboundEmail.isDelivered() || this.inboundEmail.isBounced();
  }

  async bounceWith(message: DeliverableMessage): Promise<unknown> {
    await this.inboundEmail.bouncedBang();
    return await message.deliverLater();
  }

  async bounceNowWith(message: DeliverableMessage): Promise<unknown> {
    await this.inboundEmail.bouncedBang();
    return await message.deliverNow();
  }

  /** @internal */
  private instrumentationPayload(): { mailbox: Base; inboundEmail: unknown } {
    return {
      mailbox: this,
      inboundEmail: this.inboundEmail.instrumentationPayload(),
    };
  }

  /** @internal */
  private async trackStatusOfInboundEmail(block: () => Promise<unknown>): Promise<unknown> {
    try {
      await this.inboundEmail.processingBang();
      const result = await block();
      if (!this.inboundEmail.isBounced()) await this.inboundEmail.deliveredBang();
      return result;
    } catch (error) {
      await this.inboundEmail.failedBang();
      throw error;
    }
  }
}

include(Base, Rescuable);
include(Base, Callbacks);
include(Base, Routing);

delegate.call(Base.prototype, "mail", "deliveredBang", "bouncedBang", { to: "inboundEmail" });

delegate.call(Base.prototype, "logger", { to: ActionMailbox });

ActionMailbox.Base = Base;

runLoadHooks("action_mailbox", Base);
