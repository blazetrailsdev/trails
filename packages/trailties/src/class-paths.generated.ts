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
import * as m10 from "./engine/configuration.js";
import * as m11 from "./engine/lazy-route-set.js";
import * as m12 from "./engine/trailties.js";
import * as m13 from "./gem-version.js";
import * as m14 from "./health-controller.js";
import * as m15 from "./info-controller.js";
import * as m16 from "./info.js";
import * as m17 from "./initializable.js";
import * as m18 from "./paths.js";
import * as m19 from "./pwa-controller.js";
import * as m20 from "./rack/logger.js";
import * as m21 from "./rack/silence-request.js";
import * as m22 from "./trailtie.js";
import * as m23 from "./trailtie/configuration.js";
import * as m24 from "./welcome-controller.js";

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
  [() => m10.EngineConfiguration, "Rails::Engine::Configuration"],
  [() => m11.LazyRouteSet, "Rails::Engine::LazyRouteSet"],
  [() => m12.Trailties, "Rails::Engine::Trailties"],
  [() => m14.HealthController, "Rails::HealthController"],
  [() => m16.Info, "Rails::Info"],
  [() => m15.InfoController, "Rails::InfoController"],
  [() => m17.Initializable, "Rails::Initializable"],
  [() => m17.Collection, "Rails::Initializable::Collection"],
  [() => m17.Initializer, "Rails::Initializable::Initializer"],
  [() => m18.Path, "Rails::Paths::Path"],
  [() => m18.Root, "Rails::Paths::Root"],
  [() => m19.PwaController, "Rails::PwaController"],
  [() => m20.Logger, "Rails::Rack::Logger"],
  [() => m21.SilenceRequest, "Rails::Rack::SilenceRequest"],
  [() => m22.Trailtie, "Rails::Trailtie"],
  [() => m23.Configuration, "Rails::Trailtie::Configuration"],
  [() => m13.VERSION, "Rails::VERSION"],
  [() => m24.WelcomeController, "Rails::WelcomeController"],
]);
