import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./application-controller.js";
import * as m1 from "./application.js";
import * as m2 from "./application/bootstrap.js";
import * as m3 from "./application/configuration.js";
import * as m4 from "./application/default-middleware-stack.js";
import * as m5 from "./application/dummy-config.js";
import * as m6 from "./application/finisher.js";
import * as m7 from "./application/routes-reloader.js";
import * as m8 from "./autoloaders.js";
import * as m9 from "./autoloaders/inflector.js";
import * as m10 from "./backtrace-cleaner.js";
import * as m11 from "./configuration.js";
import * as m12 from "./engine.js";
import * as m13 from "./engine/configuration.js";
import * as m14 from "./engine/lazy-route-set.js";
import * as m15 from "./engine/trailties.js";
import * as m16 from "./gem-version.js";
import * as m17 from "./health-controller.js";
import * as m18 from "./info-controller.js";
import * as m19 from "./info.js";
import * as m20 from "./initializable.js";
import * as m21 from "./paths.js";
import * as m22 from "./pwa-controller.js";
import * as m23 from "./rack.js";
import * as m24 from "./rack/logger.js";
import * as m25 from "./rack/silence-request.js";
import * as m26 from "./source-annotation-extractor.js";
import * as m27 from "./trailtie.js";
import * as m28 from "./trailtie/configuration.js";
import * as m29 from "./welcome-controller.js";
import * as m30 from "./zeitwerk-checker.js";

defineConstants([
  [() => m5.DummyConfig, "Rails::Application::DummyConfig"],
  [() => m1.Application, "Trails::Application"],
  [() => m2.Bootstrap, "Trails::Application::Bootstrap"],
  [() => m3.Configuration, "Trails::Application::Configuration"],
  [() => m3.Custom, "Trails::Application::Configuration::Custom"],
  [() => m4.DefaultMiddlewareStack, "Trails::Application::DefaultMiddlewareStack"],
  [() => m6.Finisher, "Trails::Application::Finisher"],
  [() => m6.InterlockHook, "Trails::Application::Finisher::InterlockHook"],
  [() => m6.MonitorHook, "Trails::Application::Finisher::MonitorHook"],
  [() => m7.RoutesReloader, "Trails::Application::RoutesReloader"],
  [() => m0.ApplicationController, "Trails::ApplicationController"],
  [() => m8.Autoloaders, "Trails::Autoloaders"],
  [() => m9.Inflector, "Trails::Autoloaders::Inflector"],
  [() => m10.BacktraceCleaner, "Trails::BacktraceCleaner"],
  [() => m11.Generators, "Trails::Configuration::Generators"],
  [() => m11.MiddlewareStackProxy, "Trails::Configuration::MiddlewareStackProxy"],
  [() => m12.Engine, "Trails::Engine"],
  [() => m13.EngineConfiguration, "Trails::Engine::Configuration"],
  [() => m14.LazyRouteSet, "Trails::Engine::LazyRouteSet"],
  [() => m15.Trailties, "Trails::Engine::Trailties"],
  [() => m17.HealthController, "Trails::HealthController"],
  [() => m19.Info, "Trails::Info"],
  [() => m18.InfoController, "Trails::InfoController"],
  [() => m20.Initializable, "Trails::Initializable"],
  [() => m20.Collection, "Trails::Initializable::Collection"],
  [() => m20.Initializer, "Trails::Initializable::Initializer"],
  [() => m21.Path, "Trails::Paths::Path"],
  [() => m21.Root, "Trails::Paths::Root"],
  [() => m22.PwaController, "Trails::PwaController"],
  [() => m23, "Trails::Rack"],
  [() => m24.Logger, "Trails::Rack::Logger"],
  [() => m25.SilenceRequest, "Trails::Rack::SilenceRequest"],
  [() => m26.SourceAnnotationExtractor, "Trails::SourceAnnotationExtractor"],
  [() => m26.Annotation, "Trails::SourceAnnotationExtractor::Annotation"],
  [() => m26.ParserExtractor, "Trails::SourceAnnotationExtractor::ParserExtractor"],
  [() => m26.Parser, "Trails::SourceAnnotationExtractor::ParserExtractor::Parser"],
  [() => m26.PatternExtractor, "Trails::SourceAnnotationExtractor::PatternExtractor"],
  [() => m27.Trailtie, "Trails::Trailtie"],
  [() => m28.Configuration, "Trails::Trailtie::Configuration"],
  [() => m16.VERSION, "Trails::VERSION"],
  [() => m29.WelcomeController, "Trails::WelcomeController"],
  [() => m30.ZeitwerkChecker, "Trails::ZeitwerkChecker"],
]);
