import { Autoload, extend, type Extended, type Logger } from "@blazetrails/activesupport";
import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import type { Base } from "./base.js";
import type { Callbacks } from "./callbacks.js";
import type { FormBuilder } from "./form-builder.js";
import type { InlinePreviewInterceptor } from "./inline-preview-interceptor.js";
import type { LogSubscriber } from "./log-subscriber.js";
import type { MailHelper } from "./mail-helper.js";
import type { Rescuable } from "./rescuable.js";

export type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

export const loadPath: Record<string, () => Promise<unknown>> = {
  "action_mailer/callbacks": () => import("./callbacks.js"),
  "action_mailer/inline_preview_interceptor": () => import("./inline-preview-interceptor.js"),
  "action_mailer/mail_helper": () => import("./mail-helper.js"),
  "action_mailer/form_builder": () => import("./form-builder.js"),
};

export const ActionMailer = { name: "ActionMailer", loadPath } as AutoloadModule & {
  Base: typeof Base & { logger: Logger | null };
  MessageDelivery?: new (mailer: typeof Base, mailMethod: string, ...args: unknown[]) => unknown;
  Callbacks: typeof Callbacks;
  FormBuilder: typeof FormBuilder;
  InlinePreviewInterceptor: typeof InlinePreviewInterceptor;
  LogSubscriber: typeof LogSubscriber;
  MailHelper: typeof MailHelper;
  Rescuable: typeof Rescuable;
};
constSet(TopLevel, "ActionMailer", ActionMailer);
extend(ActionMailer, Autoload);
ActionMailer.autoload("Callbacks");
ActionMailer.autoload("InlinePreviewInterceptor");
ActionMailer.autoload("MailHelper");
ActionMailer.autoload("FormBuilder");
