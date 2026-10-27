import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./application-controller.js";
import * as m1 from "./application.js";
import * as m2 from "./application/configuration.js";
import * as m3 from "./application/default-middleware-stack.js";
import * as m4 from "./application/routes-reloader.js";
import * as m5 from "./backtrace-cleaner.js";
import * as m6 from "./configuration.js";
import * as m7 from "./engine.js";
import * as m8 from "./engine/lazy-route-set.js";
import * as m9 from "./engine/trailties.js";
import * as m10 from "./health-controller.js";
import * as m11 from "./info-controller.js";
import * as m12 from "./initializable.js";
import * as m13 from "./paths.js";
import * as m14 from "./pwa-controller.js";
import * as m15 from "./rack/logger.js";
import * as m16 from "./rack/silence-request.js";
import * as m17 from "./trailtie.js";
import * as m18 from "./trailtie/configuration.js";
import * as m19 from "./welcome-controller.js";

registerClassPaths([
  [() => m1.Application, "Rails::Application"],
  [() => m2.Configuration, "Rails::Application::Configuration"],
  [() => m2.Custom, "Rails::Application::Configuration::Custom"],
  [() => m3.DefaultMiddlewareStack, "Rails::Application::DefaultMiddlewareStack"],
  [() => m4.RoutesReloader, "Rails::Application::RoutesReloader"],
  [() => m0.ApplicationController, "Rails::ApplicationController"],
  [() => m5.BacktraceCleaner, "Rails::BacktraceCleaner"],
  [() => m6.Generators, "Rails::Configuration::Generators"],
  [() => m6.MiddlewareStackProxy, "Rails::Configuration::MiddlewareStackProxy"],
  [() => m7.Engine, "Rails::Engine"],
  [() => m8.LazyRouteSet, "Rails::Engine::LazyRouteSet"],
  [() => m9.Trailties, "Rails::Engine::Railties"],
  [() => m10.HealthController, "Rails::HealthController"],
  [() => m11.InfoController, "Rails::InfoController"],
  [() => m12.Collection, "Rails::Initializable::Collection"],
  [() => m12.Initializer, "Rails::Initializable::Initializer"],
  [() => m13.Path, "Rails::Paths::Path"],
  [() => m13.Root, "Rails::Paths::Root"],
  [() => m14.PwaController, "Rails::PwaController"],
  [() => m15.Logger, "Rails::Rack::Logger"],
  [() => m16.SilenceRequest, "Rails::Rack::SilenceRequest"],
  [() => m17.Trailtie, "Rails::Railtie"],
  [() => m18.Configuration, "Rails::Railtie::Configuration"],
  [() => m19.WelcomeController, "Rails::WelcomeController"],
]);
