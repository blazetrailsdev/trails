import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./base-controller.js";
import * as m1 from "./base.js";
import * as m2 from "./gem-version.js";
import * as m3 from "./ingresses/relay/inbound-emails-controller.js";
import * as m4 from "./record.js";
import * as m5 from "./relayer.js";
import * as m6 from "./router.js";
import * as m7 from "./router/route.js";
import * as m8 from "./routing-job.js";

defineConstants([
  [() => m1.Base, "ActionMailbox::Base"],
  [() => m0.BaseController, "ActionMailbox::BaseController"],
  [() => m3.InboundEmailsController, "ActionMailbox::Ingresses::Relay::InboundEmailsController"],
  [() => m4.Record, "ActionMailbox::Record"],
  [() => m5.Relayer, "ActionMailbox::Relayer"],
  [() => m5.Relayer.Result, "ActionMailbox::Relayer::Result"],
  [() => m6.Router, "ActionMailbox::Router"],
  [() => m7.Route, "ActionMailbox::Router::Route"],
  [() => m6.Router.RoutingError, "ActionMailbox::Router::RoutingError"],
  [() => m8.RoutingJob, "ActionMailbox::RoutingJob"],
  [() => m2.VERSION, "ActionMailbox::VERSION"],
]);
