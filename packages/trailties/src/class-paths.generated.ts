import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./application-controller.js";
import * as m1 from "./application.js";
import * as m2 from "./application/bootstrap.js";
import * as m3 from "./application/configuration.js";
import * as m4 from "./application/default-middleware-stack.js";
import * as m5 from "./application/finisher.js";
import * as m6 from "./application/routes-reloader.js";
import * as m7 from "./autoloaders.js";
import * as m8 from "./autoloaders/inflector.js";
import * as m9 from "./backtrace-cleaner.js";
import * as m10 from "./configuration.js";
import * as m11 from "./engine.js";
import * as m12 from "./engine/configuration.js";
import * as m13 from "./engine/lazy-route-set.js";
import * as m14 from "./engine/trailties.js";
import * as m15 from "./gem-version.js";
import * as m16 from "./health-controller.js";
import * as m17 from "./info-controller.js";
import * as m18 from "./info.js";
import * as m19 from "./initializable.js";
import * as m20 from "./paths.js";
import * as m21 from "./pwa-controller.js";
import * as m22 from "./rack/logger.js";
import * as m23 from "./rack/silence-request.js";
import * as m24 from "./source-annotation-extractor.js";
import * as m25 from "./trailtie.js";
import * as m26 from "./trailtie/configuration.js";
import * as m27 from "./welcome-controller.js";

registerClassPaths([
  [() => m1.Application, "Rails::Application"],
  [() => m2.Bootstrap, "Rails::Application::Bootstrap"],
  [() => m3.Configuration, "Rails::Application::Configuration"],
  [() => m3.Custom, "Rails::Application::Configuration::Custom"],
  [() => m4.DefaultMiddlewareStack, "Rails::Application::DefaultMiddlewareStack"],
  [() => m5.Finisher, "Rails::Application::Finisher"],
  [() => m5.InterlockHook, "Rails::Application::Finisher::InterlockHook"],
  [() => m5.MonitorHook, "Rails::Application::Finisher::MonitorHook"],
  [() => m6.RoutesReloader, "Rails::Application::RoutesReloader"],
  [() => m0.ApplicationController, "Rails::ApplicationController"],
  [() => m7.Autoloaders, "Rails::Autoloaders"],
  [() => m8.Inflector, "Rails::Autoloaders::Inflector"],
  [() => m9.BacktraceCleaner, "Rails::BacktraceCleaner"],
  [() => m10.Generators, "Rails::Configuration::Generators"],
  [() => m10.MiddlewareStackProxy, "Rails::Configuration::MiddlewareStackProxy"],
  [() => m11.Engine, "Rails::Engine"],
  [() => m12.EngineConfiguration, "Rails::Engine::Configuration"],
  [() => m13.LazyRouteSet, "Rails::Engine::LazyRouteSet"],
  [() => m14.Trailties, "Rails::Engine::Trailties"],
  [() => m16.HealthController, "Rails::HealthController"],
  [() => m18.Info, "Rails::Info"],
  [() => m17.InfoController, "Rails::InfoController"],
  [() => m19.Initializable, "Rails::Initializable"],
  [() => m19.Collection, "Rails::Initializable::Collection"],
  [() => m19.Initializer, "Rails::Initializable::Initializer"],
  [() => m20.Path, "Rails::Paths::Path"],
  [() => m20.Root, "Rails::Paths::Root"],
  [() => m21.PwaController, "Rails::PwaController"],
  [() => m22.Logger, "Rails::Rack::Logger"],
  [() => m23.SilenceRequest, "Rails::Rack::SilenceRequest"],
  [() => m24.SourceAnnotationExtractor, "Rails::SourceAnnotationExtractor"],
  [() => m24.Annotation, "Rails::SourceAnnotationExtractor::Annotation"],
  [() => m24.ParserExtractor, "Rails::SourceAnnotationExtractor::ParserExtractor"],
  [() => m24.Parser, "Rails::SourceAnnotationExtractor::ParserExtractor::Parser"],
  [() => m24.PatternExtractor, "Rails::SourceAnnotationExtractor::PatternExtractor"],
  [() => m25.Trailtie, "Rails::Trailtie"],
  [() => m26.Configuration, "Rails::Trailtie::Configuration"],
  [() => m15.VERSION, "Rails::VERSION"],
  [() => m27.WelcomeController, "Rails::WelcomeController"],
]);
