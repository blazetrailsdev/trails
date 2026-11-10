import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./base.js";
import * as m1 from "./callbacks.js";
import * as m2 from "./gem-version.js";
import * as m3 from "./incineration-job.js";
import * as m4 from "./ingresses/mailgun/inbound-emails-controller.js";
import * as m5 from "./ingresses/relay/inbound-emails-controller.js";
import * as m6 from "./record.js";
import * as m7 from "./relayer.js";
import * as m8 from "./router.js";
import * as m9 from "./router/route.js";
import * as m10 from "./routing-job.js";
import * as m11 from "./routing.js";

defineConstants([
  [() => m0.Base, "ActionMailbox::Base"],
  [() => m1.Callbacks, "ActionMailbox::Callbacks"],
  [() => m3.IncinerationJob, "ActionMailbox::IncinerationJob"],
  [() => m4.InboundEmailsController, "ActionMailbox::Ingresses::Mailgun::InboundEmailsController"],
  [() => m5.InboundEmailsController, "ActionMailbox::Ingresses::Relay::InboundEmailsController"],
  [() => m6.Record, "ActionMailbox::Record"],
  [() => m7.Relayer, "ActionMailbox::Relayer"],
  [() => m7.Relayer.Result, "ActionMailbox::Relayer::Result"],
  [() => m8.Router, "ActionMailbox::Router"],
  [() => m9.Route, "ActionMailbox::Router::Route"],
  [() => m8.Router.RoutingError, "ActionMailbox::Router::RoutingError"],
  [() => m11.Routing, "ActionMailbox::Routing"],
  [() => m10.RoutingJob, "ActionMailbox::RoutingJob"],
  [() => m2.VERSION, "ActionMailbox::VERSION"],
]);
