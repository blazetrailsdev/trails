import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./app/controllers/action-mailbox/ingresses/mailgun/inbound-emails-controller.js";
import * as m1 from "./app/controllers/action-mailbox/ingresses/mandrill/inbound-emails-controller.js";
import * as m2 from "./app/controllers/action-mailbox/ingresses/postmark/inbound-emails-controller.js";
import * as m3 from "./app/controllers/action-mailbox/ingresses/relay/inbound-emails-controller.js";
import * as m4 from "./app/controllers/action-mailbox/ingresses/sendgrid/inbound-emails-controller.js";
import * as m5 from "./app/controllers/trails/conductor/action-mailbox/inbound-emails-controller.js";
import * as m6 from "./app/controllers/trails/conductor/action-mailbox/inbound-emails/sources-controller.js";
import * as m7 from "./app/controllers/trails/conductor/action-mailbox/incinerates-controller.js";
import * as m8 from "./app/controllers/trails/conductor/action-mailbox/reroutes-controller.js";
import * as m9 from "./base.js";
import * as m10 from "./callbacks.js";
import * as m11 from "./gem-version.js";
import * as m12 from "./incineration-job.js";
import * as m13 from "./record.js";
import * as m14 from "./relayer.js";
import * as m15 from "./router.js";
import * as m16 from "./router/route.js";
import * as m17 from "./routing-job.js";
import * as m18 from "./routing.js";

defineConstants([
  [m9, "Base", "ActionMailbox::Base"],
  [m10, "Callbacks", "ActionMailbox::Callbacks"],
  [m10, "ClassMethods", "ActionMailbox::Callbacks::ClassMethods"],
  [m12, "IncinerationJob", "ActionMailbox::IncinerationJob"],
  [m0, "InboundEmailsController", "ActionMailbox::Ingresses::Mailgun::InboundEmailsController"],
  [
    m0,
    "InboundEmailsController.Authenticator",
    "ActionMailbox::Ingresses::Mailgun::InboundEmailsController::Authenticator",
  ],
  [m1, "InboundEmailsController", "ActionMailbox::Ingresses::Mandrill::InboundEmailsController"],
  [
    m1,
    "InboundEmailsController.Authenticator",
    "ActionMailbox::Ingresses::Mandrill::InboundEmailsController::Authenticator",
  ],
  [m2, "InboundEmailsController", "ActionMailbox::Ingresses::Postmark::InboundEmailsController"],
  [m3, "InboundEmailsController", "ActionMailbox::Ingresses::Relay::InboundEmailsController"],
  [m4, "InboundEmailsController", "ActionMailbox::Ingresses::Sendgrid::InboundEmailsController"],
  [m13, "Record", "ActionMailbox::Record"],
  [m14, "Relayer", "ActionMailbox::Relayer"],
  [m14, "Relayer.Result", "ActionMailbox::Relayer::Result"],
  [m15, "Router", "ActionMailbox::Router"],
  [m16, "Route", "ActionMailbox::Router::Route"],
  [m15, "Router.RoutingError", "ActionMailbox::Router::RoutingError"],
  [m18, "Routing", "ActionMailbox::Routing"],
  [m18, "ClassMethods", "ActionMailbox::Routing::ClassMethods"],
  [m17, "RoutingJob", "ActionMailbox::RoutingJob"],
  [m11, "VERSION", "ActionMailbox::VERSION"],
  [m6, "SourcesController", "Trails::Conductor::ActionMailbox::InboundEmails::SourcesController"],
  [m5, "InboundEmailsController", "Trails::Conductor::ActionMailbox::InboundEmailsController"],
  [m7, "IncineratesController", "Trails::Conductor::ActionMailbox::IncineratesController"],
  [m8, "ReroutesController", "Trails::Conductor::ActionMailbox::ReroutesController"],
]);
