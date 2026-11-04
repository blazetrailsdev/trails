import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./callbacks.js";
import * as m1 from "./form-builder.js";
import * as m2 from "./gem-version.js";
import * as m3 from "./inline-preview-interceptor.js";
import * as m4 from "./log-subscriber.js";
import * as m5 from "./mail-helper.js";
import * as m6 from "./rescuable.js";

defineConstants([
  [() => m0.Callbacks, "ActionMailer::Callbacks"],
  [() => m0.ClassMethods, "ActionMailer::Callbacks::ClassMethods"],
  [() => m1.FormBuilder, "ActionMailer::FormBuilder"],
  [() => m1.ClassMethods, "ActionMailer::FormBuilder::ClassMethods"],
  [() => m3.InlinePreviewInterceptor, "ActionMailer::InlinePreviewInterceptor"],
  [() => m4.LogSubscriber, "ActionMailer::LogSubscriber"],
  [() => m5.MailHelper, "ActionMailer::MailHelper"],
  [() => m6.Rescuable, "ActionMailer::Rescuable"],
  [() => m2.VERSION, "ActionMailer::VERSION"],
]);
