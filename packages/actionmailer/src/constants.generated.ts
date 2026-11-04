import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./base.js";
import * as m1 from "./callbacks.js";
import * as m2 from "./collector.js";
import * as m3 from "./form-builder.js";
import * as m4 from "./gem-version.js";
import * as m5 from "./inline-preview-interceptor.js";
import * as m6 from "./log-subscriber.js";
import * as m7 from "./mail-helper.js";
import * as m8 from "./rescuable.js";

defineConstants([
  [() => m0.Base, "ActionMailer::Base"],
  [() => m0.NullMail, "ActionMailer::Base::NullMail"],
  [() => m1.Callbacks, "ActionMailer::Callbacks"],
  [() => m1.ClassMethods, "ActionMailer::Callbacks::ClassMethods"],
  [() => m3.FormBuilder, "ActionMailer::FormBuilder"],
  [() => m3.ClassMethods, "ActionMailer::FormBuilder::ClassMethods"],
  [() => m5.InlinePreviewInterceptor, "ActionMailer::InlinePreviewInterceptor"],
  [() => m6.LogSubscriber, "ActionMailer::LogSubscriber"],
  [() => m7.MailHelper, "ActionMailer::MailHelper"],
  [() => m8.Rescuable, "ActionMailer::Rescuable"],
  [() => m4.VERSION, "ActionMailer::VERSION"],
  [() => m2.Collector, "Collector"],
]);
