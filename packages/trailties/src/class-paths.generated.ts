import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./application-controller.js";
import * as m1 from "./application.js";
import * as m2 from "./application/bootstrap.js";
import * as m3 from "./application/configuration.js";
import * as m4 from "./application/default-middleware-stack.js";
import * as m5 from "./application/finisher.js";
import * as m6 from "./application/routes-reloader.js";
import * as m7 from "./autoloaders/inflector.js";
import * as m8 from "./backtrace-cleaner.js";
import * as m9 from "./configuration.js";
import * as m10 from "./engine.js";
import * as m11 from "./engine/configuration.js";
import * as m12 from "./engine/lazy-route-set.js";
import * as m13 from "./engine/trailties.js";
import * as m14 from "./gem-version.js";
import * as m15 from "./health-controller.js";
import * as m16 from "./info-controller.js";
import * as m17 from "./info.js";
import * as m18 from "./initializable.js";
import * as m19 from "./paths.js";
import * as m20 from "./pwa-controller.js";
import * as m21 from "./rack/logger.js";
import * as m22 from "./rack/silence-request.js";
import * as m23 from "./source-annotation-extractor.js";
import * as m24 from "./trailtie.js";
import * as m25 from "./trailtie/configuration.js";
import * as m26 from "./welcome-controller.js";

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
  [() => m7.Inflector, "Rails::Autoloaders::Inflector"],
  [() => m8.BacktraceCleaner, "Rails::BacktraceCleaner"],
  [() => m9.Generators, "Rails::Configuration::Generators"],
  [() => m9.MiddlewareStackProxy, "Rails::Configuration::MiddlewareStackProxy"],
  [() => m10.Engine, "Rails::Engine"],
  [() => m11.EngineConfiguration, "Rails::Engine::Configuration"],
  [() => m12.LazyRouteSet, "Rails::Engine::LazyRouteSet"],
  [() => m13.Trailties, "Rails::Engine::Trailties"],
  [() => m15.HealthController, "Rails::HealthController"],
  [() => m17.Info, "Rails::Info"],
  [() => m16.InfoController, "Rails::InfoController"],
  [() => m18.Initializable, "Rails::Initializable"],
  [() => m18.Collection, "Rails::Initializable::Collection"],
  [() => m18.Initializer, "Rails::Initializable::Initializer"],
  [() => m19.Path, "Rails::Paths::Path"],
  [() => m19.Root, "Rails::Paths::Root"],
  [() => m20.PwaController, "Rails::PwaController"],
  [() => m21.Logger, "Rails::Rack::Logger"],
  [() => m22.SilenceRequest, "Rails::Rack::SilenceRequest"],
  [() => m23.SourceAnnotationExtractor, "Rails::SourceAnnotationExtractor"],
  [() => m23.Annotation, "Rails::SourceAnnotationExtractor::Annotation"],
  [() => m23.ParserExtractor, "Rails::SourceAnnotationExtractor::ParserExtractor"],
  [() => m23.Parser, "Rails::SourceAnnotationExtractor::ParserExtractor::Parser"],
  [() => m23.PatternExtractor, "Rails::SourceAnnotationExtractor::PatternExtractor"],
  [() => m24.Trailtie, "Rails::Trailtie"],
  [() => m25.Configuration, "Rails::Trailtie::Configuration"],
  [() => m14.VERSION, "Rails::VERSION"],
  [() => m26.WelcomeController, "Rails::WelcomeController"],
]);
