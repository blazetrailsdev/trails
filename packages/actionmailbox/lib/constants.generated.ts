import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./app/controllers/action-mailbox/base-controller.js";
import * as m1 from "./app/controllers/action-mailbox/ingresses/mailgun/inbound-emails-controller.js";
import * as m2 from "./app/controllers/action-mailbox/ingresses/mandrill/inbound-emails-controller.js";
import * as m3 from "./app/controllers/action-mailbox/ingresses/postmark/inbound-emails-controller.js";
import * as m4 from "./app/controllers/action-mailbox/ingresses/relay/inbound-emails-controller.js";
import * as m5 from "./app/controllers/action-mailbox/ingresses/sendgrid/inbound-emails-controller.js";
import * as m6 from "./app/controllers/trails/conductor/action-mailbox/inbound-emails-controller.js";
import * as m7 from "./app/controllers/trails/conductor/action-mailbox/inbound-emails/sources-controller.js";
import * as m8 from "./app/controllers/trails/conductor/action-mailbox/incinerates-controller.js";
import * as m9 from "./app/controllers/trails/conductor/action-mailbox/reroutes-controller.js";
import * as m10 from "./app/controllers/trails/conductor/base-controller.js";
import * as m11 from "./base.js";
import * as m12 from "./callbacks.js";
import * as m13 from "./gem-version.js";
import * as m14 from "./incineration-job.js";
import * as m15 from "./record.js";
import * as m16 from "./relayer.js";
import * as m17 from "./router.js";
import * as m18 from "./router/route.js";
import * as m19 from "./routing-job.js";
import * as m20 from "./routing.js";

defineConstants([
  [m11, "Base", "ActionMailbox::Base"],
  [m0, "BaseController", "ActionMailbox::BaseController"],
  [m12, "Callbacks", "ActionMailbox::Callbacks"],
  [m12, "ClassMethods", "ActionMailbox::Callbacks::ClassMethods"],
  [m14, "IncinerationJob", "ActionMailbox::IncinerationJob"],
  [m1, "InboundEmailsController", "ActionMailbox::Ingresses::Mailgun::InboundEmailsController"],
  [
    m1,
    "InboundEmailsController.Authenticator",
    "ActionMailbox::Ingresses::Mailgun::InboundEmailsController::Authenticator",
  ],
  [m2, "InboundEmailsController", "ActionMailbox::Ingresses::Mandrill::InboundEmailsController"],
  [
    m2,
    "InboundEmailsController.Authenticator",
    "ActionMailbox::Ingresses::Mandrill::InboundEmailsController::Authenticator",
  ],
  [m3, "InboundEmailsController", "ActionMailbox::Ingresses::Postmark::InboundEmailsController"],
  [m4, "InboundEmailsController", "ActionMailbox::Ingresses::Relay::InboundEmailsController"],
  [m5, "InboundEmailsController", "ActionMailbox::Ingresses::Sendgrid::InboundEmailsController"],
  [m15, "Record", "ActionMailbox::Record"],
  [m16, "Relayer", "ActionMailbox::Relayer"],
  [m16, "Relayer.Result", "ActionMailbox::Relayer::Result"],
  [m17, "Router", "ActionMailbox::Router"],
  [m18, "Route", "ActionMailbox::Router::Route"],
  [m17, "Router.RoutingError", "ActionMailbox::Router::RoutingError"],
  [m20, "Routing", "ActionMailbox::Routing"],
  [m20, "ClassMethods", "ActionMailbox::Routing::ClassMethods"],
  [m19, "RoutingJob", "ActionMailbox::RoutingJob"],
  [m13, "VERSION", "ActionMailbox::VERSION"],
  [m7, "SourcesController", "Trails::Conductor::ActionMailbox::InboundEmails::SourcesController"],
  [m6, "InboundEmailsController", "Trails::Conductor::ActionMailbox::InboundEmailsController"],
  [m8, "IncineratesController", "Trails::Conductor::ActionMailbox::IncineratesController"],
  [m9, "ReroutesController", "Trails::Conductor::ActionMailbox::ReroutesController"],
  [m10, "BaseController", "Trails::Conductor::BaseController"],
]);
