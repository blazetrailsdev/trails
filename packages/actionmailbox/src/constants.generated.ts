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
import * as m10 from "./ingresses/postmark/inbound-emails-controller.js";
import * as m11 from "./ingresses/relay/inbound-emails-controller.js";
import * as m12 from "./ingresses/sendgrid/inbound-emails-controller.js";
import * as m13 from "./record.js";
import * as m14 from "./relayer.js";
import * as m15 from "./router.js";
import * as m16 from "./router/route.js";
import * as m17 from "./routing-job.js";
import * as m18 from "./routing.js";

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
  [
    () => m10.InboundEmailsController,
    "ActionMailbox::Ingresses::Postmark::InboundEmailsController",
  ],
  [() => m11.InboundEmailsController, "ActionMailbox::Ingresses::Relay::InboundEmailsController"],
  [
    () => m12.InboundEmailsController,
    "ActionMailbox::Ingresses::Sendgrid::InboundEmailsController",
  ],
  [() => m13.Record, "ActionMailbox::Record"],
  [() => m14.Relayer, "ActionMailbox::Relayer"],
  [() => m14.Relayer.Result, "ActionMailbox::Relayer::Result"],
  [() => m15.Router, "ActionMailbox::Router"],
  [() => m16.Route, "ActionMailbox::Router::Route"],
  [() => m15.Router.RoutingError, "ActionMailbox::Router::RoutingError"],
  [() => m18.Routing, "ActionMailbox::Routing"],
  [() => m17.RoutingJob, "ActionMailbox::RoutingJob"],
  [() => m6.VERSION, "ActionMailbox::VERSION"],
  [
    () => m1.SourcesController,
    "Trails::Conductor::ActionMailbox::InboundEmails::SourcesController",
  ],
  [() => m0.InboundEmailsController, "Trails::Conductor::ActionMailbox::InboundEmailsController"],
  [() => m2.IncineratesController, "Trails::Conductor::ActionMailbox::IncineratesController"],
  [() => m3.ReroutesController, "Trails::Conductor::ActionMailbox::ReroutesController"],
]);
