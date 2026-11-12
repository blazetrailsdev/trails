import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./action-mailbox/inbound-emails-controller.js";
import * as m1 from "./action-mailbox/inbound-emails/sources-controller.js";
import * as m2 from "./action-mailbox/incinerates-controller.js";
import * as m3 from "./action-mailbox/reroutes-controller.js";
import * as m4 from "./base.js";
import * as m5 from "./callbacks.js";
import * as m6 from "./gem-version.js";
import * as m7 from "./incineration-job.js";
import * as m8 from "./ingresses/mailgun/inbound-emails-controller.js";
import * as m9 from "./ingresses/mandrill/inbound-emails-controller.js";
import * as m10 from "./ingresses/relay/inbound-emails-controller.js";
import * as m11 from "./record.js";
import * as m12 from "./relayer.js";
import * as m13 from "./router.js";
import * as m14 from "./router/route.js";
import * as m15 from "./routing-job.js";
import * as m16 from "./routing.js";

defineConstants([
  [() => m4.Base, "ActionMailbox::Base"],
  [() => m5.Callbacks, "ActionMailbox::Callbacks"],
  [() => m7.IncinerationJob, "ActionMailbox::IncinerationJob"],
  [() => m8.InboundEmailsController, "ActionMailbox::Ingresses::Mailgun::InboundEmailsController"],
  [
    () => m8.InboundEmailsController.Authenticator,
    "ActionMailbox::Ingresses::Mailgun::InboundEmailsController::Authenticator",
  ],
  [() => m9.InboundEmailsController, "ActionMailbox::Ingresses::Mandrill::InboundEmailsController"],
  [
    () => m9.InboundEmailsController.Authenticator,
    "ActionMailbox::Ingresses::Mandrill::InboundEmailsController::Authenticator",
  ],
  [() => m10.InboundEmailsController, "ActionMailbox::Ingresses::Relay::InboundEmailsController"],
  [() => m11.Record, "ActionMailbox::Record"],
  [() => m12.Relayer, "ActionMailbox::Relayer"],
  [() => m12.Relayer.Result, "ActionMailbox::Relayer::Result"],
  [() => m13.Router, "ActionMailbox::Router"],
  [() => m14.Route, "ActionMailbox::Router::Route"],
  [() => m13.Router.RoutingError, "ActionMailbox::Router::RoutingError"],
  [() => m16.Routing, "ActionMailbox::Routing"],
  [() => m15.RoutingJob, "ActionMailbox::RoutingJob"],
  [() => m6.VERSION, "ActionMailbox::VERSION"],
  [
    () => m1.SourcesController,
    "Trails::Conductor::ActionMailbox::InboundEmails::SourcesController",
  ],
  [() => m0.InboundEmailsController, "Trails::Conductor::ActionMailbox::InboundEmailsController"],
  [() => m2.IncineratesController, "Trails::Conductor::ActionMailbox::IncineratesController"],
  [() => m3.ReroutesController, "Trails::Conductor::ActionMailbox::ReroutesController"],
]);
