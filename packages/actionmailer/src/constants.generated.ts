import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./base.js";
import * as m1 from "./callbacks.js";
import * as m2 from "./collector.js";
import * as m3 from "./delivery-methods.js";
import * as m4 from "./form-builder.js";
import * as m5 from "./gem-version.js";
import * as m6 from "./inline-preview-interceptor.js";
import * as m7 from "./log-subscriber.js";
import * as m8 from "./mail-delivery-job.js";
import * as m9 from "./mail-helper.js";
import * as m10 from "./message-delivery.js";
import * as m11 from "./parameterized.js";
import * as m12 from "./rescuable.js";

defineConstants([
  [() => m0.Base, "ActionMailer::Base"],
  [() => m0.Base.LateAttachmentsProxy, "ActionMailer::Base::LateAttachmentsProxy"],
  [() => m0.NullMail, "ActionMailer::Base::NullMail"],
  [() => m1.Callbacks, "ActionMailer::Callbacks"],
  [() => m1.ClassMethods, "ActionMailer::Callbacks::ClassMethods"],
  [() => m2.Collector, "ActionMailer::Collector"],
  [() => m3.DeliveryMethods, "ActionMailer::DeliveryMethods"],
  [() => m3.ClassMethods, "ActionMailer::DeliveryMethods::ClassMethods"],
  [() => m4.FormBuilder, "ActionMailer::FormBuilder"],
  [() => m4.ClassMethods, "ActionMailer::FormBuilder::ClassMethods"],
  [() => m6.InlinePreviewInterceptor, "ActionMailer::InlinePreviewInterceptor"],
  [() => m7.LogSubscriber, "ActionMailer::LogSubscriber"],
  [() => m9.MailHelper, "ActionMailer::MailHelper"],
  [() => m12.Rescuable, "ActionMailer::Rescuable"],
  [() => m5.VERSION, "ActionMailer::VERSION"],
  [() => m8.MailDeliveryJob, "ActionMailer::MailDeliveryJob"],
  [() => m10.MessageDelivery, "ActionMailer::MessageDelivery"],
  [() => m11.Mailer, "ActionMailer::Parameterized::Mailer"],
  [() => m11.MessageDelivery, "ActionMailer::Parameterized::MessageDelivery"],
]);
