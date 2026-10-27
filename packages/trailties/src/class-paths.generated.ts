import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./application-controller.js";
import * as m1 from "./application.js";
import * as m2 from "./application/bootstrap.js";
import * as m3 from "./application/configuration.js";
import * as m4 from "./application/default-middleware-stack.js";
import * as m5 from "./application/finisher.js";
import * as m6 from "./application/routes-reloader.js";
import * as m7 from "./backtrace-cleaner.js";
import * as m8 from "./configuration.js";
import * as m9 from "./engine.js";
import * as m10 from "./engine/lazy-route-set.js";
import * as m11 from "./engine/trailties.js";
import * as m12 from "./gem-version.js";
import * as m13 from "./health-controller.js";
import * as m14 from "./info-controller.js";
import * as m15 from "./info.js";
import * as m16 from "./initializable.js";
import * as m17 from "./paths.js";
import * as m18 from "./pwa-controller.js";
import * as m19 from "./rack/logger.js";
import * as m20 from "./rack/silence-request.js";
import * as m21 from "./trailtie.js";
import * as m22 from "./trailtie/configuration.js";
import * as m23 from "./welcome-controller.js";

registerClassPaths([
  [() => m1.Application, "Rails::Application"],
  [() => m2.Bootstrap, "Rails::Application::Bootstrap"],
  [() => m3.Configuration, "Rails::Application::Configuration"],
  [() => m3.Custom, "Rails::Application::Configuration::Custom"],
  [() => m4.DefaultMiddlewareStack, "Rails::Application::DefaultMiddlewareStack"],
  [() => m5.Finisher, "Rails::Application::Finisher"],
  [() => m6.RoutesReloader, "Rails::Application::RoutesReloader"],
  [() => m0.ApplicationController, "Rails::ApplicationController"],
  [() => m7.BacktraceCleaner, "Rails::BacktraceCleaner"],
  [() => m8.Generators, "Rails::Configuration::Generators"],
  [() => m8.MiddlewareStackProxy, "Rails::Configuration::MiddlewareStackProxy"],
  [() => m9.Engine, "Rails::Engine"],
  [() => m10.LazyRouteSet, "Rails::Engine::LazyRouteSet"],
  [() => m11.Trailties, "Rails::Engine::Railties"],
  [() => m13.HealthController, "Rails::HealthController"],
  [() => m15.Info, "Rails::Info"],
  [() => m14.InfoController, "Rails::InfoController"],
  [() => m16.Initializable, "Rails::Initializable"],
  [() => m16.Collection, "Rails::Initializable::Collection"],
  [() => m16.Initializer, "Rails::Initializable::Initializer"],
  [() => m17.Path, "Rails::Paths::Path"],
  [() => m17.Root, "Rails::Paths::Root"],
  [() => m18.PwaController, "Rails::PwaController"],
  [() => m19.Logger, "Rails::Rack::Logger"],
  [() => m20.SilenceRequest, "Rails::Rack::SilenceRequest"],
  [() => m21.Trailtie, "Rails::Railtie"],
  [() => m22.Configuration, "Rails::Railtie::Configuration"],
  [() => m12.VERSION, "Rails::VERSION"],
  [() => m23.WelcomeController, "Rails::WelcomeController"],
]);
