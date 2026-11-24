import { defineConstants } from "@blazetrails/ruby-compat/classpath";
import * as m0 from "./application.js";
import * as m1 from "./application/bootstrap.js";
import * as m2 from "./application/configuration.js";
import * as m3 from "./application/default-middleware-stack.js";
import * as m4 from "./application/finisher.js";
import * as m5 from "./application/routes-reloader.js";
import * as m6 from "./backtrace-cleaner.js";
import * as m7 from "./configuration.js";
import * as m8 from "./engine/configuration.js";
import * as m9 from "./engine/lazy-route-set.js";
import * as m10 from "./engine/trailties.js";
import * as m11 from "./gem-version.js";
import * as m12 from "./initializable.js";
import * as m13 from "./paths.js";
import * as m14 from "./rack.js";
import * as m15 from "./rack/logger.js";
import * as m16 from "./rack/silence-request.js";
import * as m17 from "./source-annotation-extractor.js";
import * as m18 from "./trailtie/configurable.js";

defineConstants([
  [() => m0, "Application", "Trails::Application"],
  [() => m1, "Bootstrap", "Trails::Application::Bootstrap"],
  [() => m2, "Configuration", "Trails::Application::Configuration"],
  [() => m2, "Custom", "Trails::Application::Configuration::Custom"],
  [() => m3, "DefaultMiddlewareStack", "Trails::Application::DefaultMiddlewareStack"],
  [() => m4, "Finisher", "Trails::Application::Finisher"],
  [() => m4, "InterlockHook", "Trails::Application::Finisher::InterlockHook"],
  [() => m4, "MonitorHook", "Trails::Application::Finisher::MonitorHook"],
  [() => m5, "RoutesReloader", "Trails::Application::RoutesReloader"],
  [() => m6, "BacktraceCleaner", "Trails::BacktraceCleaner"],
  [() => m7, "Generators", "Trails::Configuration::Generators"],
  [() => m7, "MiddlewareStackProxy", "Trails::Configuration::MiddlewareStackProxy"],
  [() => m8, "Configuration", "Trails::Engine::Configuration"],
  [() => m9, "LazyRouteSet", "Trails::Engine::LazyRouteSet"],
  [() => m9, "NamedRouteCollection", "Trails::Engine::LazyRouteSet::NamedRouteCollection"],
  [() => m9, "LazyRouteSet.ProxyUrlHelpers", "Trails::Engine::LazyRouteSet::ProxyUrlHelpers"],
  [() => m10, "Trailties", "Trails::Engine::Trailties"],
  [() => m12, "Initializable", "Trails::Initializable"],
  [() => m12, "ClassMethods", "Trails::Initializable::ClassMethods"],
  [() => m12, "Collection", "Trails::Initializable::Collection"],
  [() => m12, "Initializer", "Trails::Initializable::Initializer"],
  [() => m13, "Path", "Trails::Paths::Path"],
  [() => m13, "Root", "Trails::Paths::Root"],
  [() => m14, null, "Trails::Rack"],
  [() => m15, "Logger", "Trails::Rack::Logger"],
  [() => m16, "SilenceRequest", "Trails::Rack::SilenceRequest"],
  [() => m17, "SourceAnnotationExtractor", "Trails::SourceAnnotationExtractor"],
  [() => m17, "Annotation", "Trails::SourceAnnotationExtractor::Annotation"],
  [() => m17, "ParserExtractor", "Trails::SourceAnnotationExtractor::ParserExtractor"],
  [() => m17, "PatternExtractor", "Trails::SourceAnnotationExtractor::PatternExtractor"],
  [() => m18, "Configurable", "Trails::Trailtie::Configurable"],
  [() => m18, "ClassMethods", "Trails::Trailtie::Configurable::ClassMethods"],
  [() => m11, "VERSION", "Trails::VERSION"],
]);
