import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./gem-version.js";
import * as m1 from "./record.js";
import * as m2 from "./relayer.js";
import * as m3 from "./router.js";
import * as m4 from "./router/route.js";
import * as m5 from "./routing-job.js";

defineConstants([
  [() => m1.Record, "ActionMailbox::Record"],
  [() => m2.Relayer, "ActionMailbox::Relayer"],
  [() => m2.Relayer.Result, "ActionMailbox::Relayer::Result"],
  [() => m3.Router, "ActionMailbox::Router"],
  [() => m4.Route, "ActionMailbox::Router::Route"],
  [() => m3.Router.RoutingError, "ActionMailbox::Router::RoutingError"],
  [() => m5.RoutingJob, "ActionMailbox::RoutingJob"],
  [() => m0.VERSION, "ActionMailbox::VERSION"],
]);
