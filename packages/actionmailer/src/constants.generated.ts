import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./base.js";
import * as m1 from "./callbacks.js";
import * as m2 from "./form-builder.js";
import * as m3 from "./gem-version.js";
import * as m4 from "./inline-preview-interceptor.js";
import * as m5 from "./log-subscriber.js";
import * as m6 from "./mail-helper.js";
import * as m7 from "./rescuable.js";

defineConstants([
  [() => m0.Base, "ActionMailer::Base"],
  [() => m0.NullMail, "ActionMailer::Base::NullMail"],
  [() => m1.Callbacks, "ActionMailer::Callbacks"],
  [() => m1.ClassMethods, "ActionMailer::Callbacks::ClassMethods"],
  [() => m2.FormBuilder, "ActionMailer::FormBuilder"],
  [() => m2.ClassMethods, "ActionMailer::FormBuilder::ClassMethods"],
  [() => m4.InlinePreviewInterceptor, "ActionMailer::InlinePreviewInterceptor"],
  [() => m5.LogSubscriber, "ActionMailer::LogSubscriber"],
  [() => m6.MailHelper, "ActionMailer::MailHelper"],
  [() => m7.Rescuable, "ActionMailer::Rescuable"],
  [() => m3.VERSION, "ActionMailer::VERSION"],
]);
