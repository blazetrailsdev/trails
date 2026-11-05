import {
  Autoload,
  descendants,
  extend,
  type Extended,
  type Logger,
} from "@blazetrails/activesupport";
import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import type { Base } from "./base.js";
import type { Callbacks } from "./callbacks.js";
import type { Collector } from "./collector.js";
import type { DeliveryMethods } from "./delivery-methods.js";
import type { FormBuilder } from "./form-builder.js";
import type { InlinePreviewInterceptor } from "./inline-preview-interceptor.js";
import type { LogSubscriber } from "./log-subscriber.js";
import type { MailDeliveryJob } from "./mail-delivery-job.js";
import type { MailHelper } from "./mail-helper.js";
import type { MessageDelivery } from "./message-delivery.js";
import type { Parameterized } from "./parameterized.js";
import type { QueuedDelivery } from "./queued-delivery.js";
import type { Rescuable } from "./rescuable.js";

export type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

export const loadPath: Record<string, () => Promise<unknown>> = {
  "action_mailer/base": () => import("./base.js"),
  "action_mailer/callbacks": () => import("./callbacks.js"),
  "action_mailer/collector": () => import("./collector.js"),
  "action_mailer/delivery_methods": () => import("./delivery-methods.js"),
  "action_mailer/inline_preview_interceptor": () => import("./inline-preview-interceptor.js"),
  "action_mailer/mail_helper": () => import("./mail-helper.js"),
  "action_mailer/mail_delivery_job": () => import("./mail-delivery-job.js"),
  "action_mailer/message_delivery": () => import("./message-delivery.js"),
  "action_mailer/parameterized": () => import("./parameterized.js"),
  "action_mailer/queued_delivery": () => import("./queued-delivery.js"),
  "action_mailer/form_builder": () => import("./form-builder.js"),
};

export const ActionMailer = { name: "ActionMailer", loadPath } as AutoloadModule & {
  Base: typeof Base & { logger: Logger | null };
  MessageDelivery: typeof MessageDelivery;
  MailDeliveryJob: typeof MailDeliveryJob;
  Parameterized: typeof Parameterized;
  QueuedDelivery: typeof QueuedDelivery;
  Callbacks: typeof Callbacks;
  Collector: typeof Collector;
  DeliveryMethods: typeof DeliveryMethods;
  FormBuilder: typeof FormBuilder;
  InlinePreviewInterceptor: typeof InlinePreviewInterceptor;
  LogSubscriber: typeof LogSubscriber;
  MailHelper: typeof MailHelper;
  Rescuable: typeof Rescuable;
};
constSet(TopLevel, "ActionMailer", ActionMailer);
extend(ActionMailer, Autoload);
ActionMailer.autoload("Base");
ActionMailer.autoload("Callbacks");
ActionMailer.autoload("Collector");
ActionMailer.autoload("DeliveryMethods");
ActionMailer.autoload("InlinePreviewInterceptor");
ActionMailer.autoload("MailHelper");
ActionMailer.autoload("MailDeliveryJob");
ActionMailer.autoload("MessageDelivery");
ActionMailer.autoload("Parameterized");
ActionMailer.autoload("QueuedDelivery");
ActionMailer.autoload("FormBuilder");

/** @missingRailsCall eagerAutoloadBang — PERMANENT */
Object.defineProperty(ActionMailer, "eagerLoadBang", {
  value: async function eagerLoadBang(this: typeof ActionMailer): Promise<void> {
    await Autoload.eagerLoadBang.call(this);

    for (const mailer of descendants(this.Base) as (typeof Base)[]) {
      if (!mailer.isAbstract()) mailer.eagerLoadBang();
    }
  },
  writable: true,
  configurable: true,
});
