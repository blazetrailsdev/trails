import { defineConstants } from "@blazetrails/ruby-compat";
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
import * as m22 from "./rack.js";
import * as m23 from "./rack/logger.js";
import * as m24 from "./rack/silence-request.js";
import * as m25 from "./source-annotation-extractor.js";
import * as m26 from "./trailtie.js";
import * as m27 from "./trailtie/configurable.js";
import * as m28 from "./trailtie/configuration.js";
import * as m29 from "./welcome-controller.js";
import * as m30 from "./zeitwerk-checker.js";

defineConstants([
  [() => m1.Application, "Trails::Application"],
  [() => m2.Bootstrap, "Trails::Application::Bootstrap"],
  [() => m3.Configuration, "Trails::Application::Configuration"],
  [() => m3.Custom, "Trails::Application::Configuration::Custom"],
  [() => m4.DefaultMiddlewareStack, "Trails::Application::DefaultMiddlewareStack"],
  [() => m5.Finisher, "Trails::Application::Finisher"],
  [() => m5.InterlockHook, "Trails::Application::Finisher::InterlockHook"],
  [() => m5.MonitorHook, "Trails::Application::Finisher::MonitorHook"],
  [() => m6.RoutesReloader, "Trails::Application::RoutesReloader"],
  [() => m0.ApplicationController, "Trails::ApplicationController"],
  [() => m7.Autoloaders, "Trails::Autoloaders"],
  [() => m8.Inflector, "Trails::Autoloaders::Inflector"],
  [() => m9.BacktraceCleaner, "Trails::BacktraceCleaner"],
  [() => m10.Generators, "Trails::Configuration::Generators"],
  [() => m10.MiddlewareStackProxy, "Trails::Configuration::MiddlewareStackProxy"],
  [() => m11.Engine, "Trails::Engine"],
  [() => m12.EngineConfiguration, "Trails::Engine::Configuration"],
  [() => m13.LazyRouteSet, "Trails::Engine::LazyRouteSet"],
  [() => m14.Trailties, "Trails::Engine::Trailties"],
  [() => m16.HealthController, "Trails::HealthController"],
  [() => m18.Info, "Trails::Info"],
  [() => m17.InfoController, "Trails::InfoController"],
  [() => m19.Initializable, "Trails::Initializable"],
  [() => m19.Collection, "Trails::Initializable::Collection"],
  [() => m19.Initializer, "Trails::Initializable::Initializer"],
  [() => m20.Path, "Trails::Paths::Path"],
  [() => m20.Root, "Trails::Paths::Root"],
  [() => m21.PwaController, "Trails::PwaController"],
  [() => m22, "Trails::Rack"],
  [() => m23.Logger, "Trails::Rack::Logger"],
  [() => m24.SilenceRequest, "Trails::Rack::SilenceRequest"],
  [() => m25.SourceAnnotationExtractor, "Trails::SourceAnnotationExtractor"],
  [() => m25.Annotation, "Trails::SourceAnnotationExtractor::Annotation"],
  [() => m25.ParserExtractor, "Trails::SourceAnnotationExtractor::ParserExtractor"],
  [() => m25.Parser, "Trails::SourceAnnotationExtractor::ParserExtractor::Parser"],
  [() => m25.PatternExtractor, "Trails::SourceAnnotationExtractor::PatternExtractor"],
  [() => m26.Trailtie, "Trails::Trailtie"],
  [() => m27.Configurable, "Trails::Trailtie::Configurable"],
  [() => m28.Configuration, "Trails::Trailtie::Configuration"],
  [() => m15.VERSION, "Trails::VERSION"],
  [() => m29.WelcomeController, "Trails::WelcomeController"],
  [() => m30.ZeitwerkChecker, "Trails::ZeitwerkChecker"],
]);
