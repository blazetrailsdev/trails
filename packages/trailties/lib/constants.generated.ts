import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./application-controller.js";
import * as m1 from "./application.js";
import * as m2 from "./application/bootstrap.js";
import * as m3 from "./application/configuration.js";
import * as m4 from "./application/default-middleware-stack.js";
import * as m5 from "./application/finisher.js";
import * as m6 from "./application/routes-reloader.js";
import * as m7 from "./backtrace-cleaner.js";
import * as m8 from "./configuration.js";
import * as m9 from "./engine/configuration.js";
import * as m10 from "./engine/lazy-route-set.js";
import * as m11 from "./engine/trailties.js";
import * as m12 from "./gem-version.js";
import * as m13 from "./info-controller.js";
import * as m14 from "./info.js";
import * as m15 from "./initializable.js";
import * as m16 from "./paths.js";
import * as m17 from "./pwa-controller.js";
import * as m18 from "./rack.js";
import * as m19 from "./rack/logger.js";
import * as m20 from "./rack/silence-request.js";
import * as m21 from "./source-annotation-extractor.js";
import * as m22 from "./trailtie/configurable.js";
import * as m23 from "./welcome-controller.js";

defineConstants([
  [m1, "Application", "Trails::Application"],
  [m2, "Bootstrap", "Trails::Application::Bootstrap"],
  [m3, "Configuration", "Trails::Application::Configuration"],
  [m3, "Custom", "Trails::Application::Configuration::Custom"],
  [m4, "DefaultMiddlewareStack", "Trails::Application::DefaultMiddlewareStack"],
  [m5, "Finisher", "Trails::Application::Finisher"],
  [m5, "InterlockHook", "Trails::Application::Finisher::InterlockHook"],
  [m5, "MonitorHook", "Trails::Application::Finisher::MonitorHook"],
  [m6, "RoutesReloader", "Trails::Application::RoutesReloader"],
  [m0, "ApplicationController", "Trails::ApplicationController"],
  [m7, "BacktraceCleaner", "Trails::BacktraceCleaner"],
  [m8, "Generators", "Trails::Configuration::Generators"],
  [m8, "MiddlewareStackProxy", "Trails::Configuration::MiddlewareStackProxy"],
  [m9, "Configuration", "Trails::Engine::Configuration"],
  [m10, "LazyRouteSet", "Trails::Engine::LazyRouteSet"],
  [m10, "NamedRouteCollection", "Trails::Engine::LazyRouteSet::NamedRouteCollection"],
  [m10, "LazyRouteSet.ProxyUrlHelpers", "Trails::Engine::LazyRouteSet::ProxyUrlHelpers"],
  [m11, "Trailties", "Trails::Engine::Trailties"],
  [m14, "Info", "Trails::Info"],
  [m13, "InfoController", "Trails::InfoController"],
  [m15, "Initializable", "Trails::Initializable"],
  [m15, "Collection", "Trails::Initializable::Collection"],
  [m15, "Initializer", "Trails::Initializable::Initializer"],
  [m16, "Path", "Trails::Paths::Path"],
  [m16, "Root", "Trails::Paths::Root"],
  [m17, "PwaController", "Trails::PwaController"],
  [m18, null, "Trails::Rack"],
  [m19, "Logger", "Trails::Rack::Logger"],
  [m20, "SilenceRequest", "Trails::Rack::SilenceRequest"],
  [m21, "SourceAnnotationExtractor", "Trails::SourceAnnotationExtractor"],
  [m21, "Annotation", "Trails::SourceAnnotationExtractor::Annotation"],
  [m21, "ParserExtractor", "Trails::SourceAnnotationExtractor::ParserExtractor"],
  [m21, "PatternExtractor", "Trails::SourceAnnotationExtractor::PatternExtractor"],
  [m22, "Configurable", "Trails::Trailtie::Configurable"],
  [m22, "ClassMethods", "Trails::Trailtie::Configurable::ClassMethods"],
  [m12, "VERSION", "Trails::VERSION"],
  [m23, "WelcomeController", "Trails::WelcomeController"],
]);
