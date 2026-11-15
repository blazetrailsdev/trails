import { Autoload, extend, type Extended, type Logger } from "@blazetrails/activesupport";
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
import type { Preview, Previews } from "./preview.js";
import type { QueuedDelivery } from "./queued-delivery.js";
import type { Rescuable } from "./rescuable.js";
import type { NonInferrableMailerError, TestCase } from "./test-case.js";
import type { TestHelper } from "./test-helper.js";

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
  "action_mailer/preview": () => import("./preview.js"),
  "action_mailer/queued_delivery": () => import("./queued-delivery.js"),
  "action_mailer/form_builder": () => import("./form-builder.js"),
  "action_mailer/test_case": () => import("@blazetrails/actionmailer/test-case"),
  "action_mailer/test_helper": () => import("@blazetrails/actionmailer/test-helper"),
};

export const ActionMailer = { name: "ActionMailer", loadPath } as AutoloadModule & {
  Base: typeof Base & { logger: Logger | null; descendants: (typeof Base)[] };
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
  Preview: typeof Preview;
  Previews: typeof Previews;
  NonInferrableMailerError: typeof NonInferrableMailerError;
  TestCase: typeof TestCase;
  TestHelper: typeof TestHelper;
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
ActionMailer.autoload("Preview", "action_mailer/preview");
ActionMailer.autoload("Previews", "action_mailer/preview");
ActionMailer.autoload("TestCase");
ActionMailer.autoload("TestHelper");
