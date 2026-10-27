import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./abstract-controller/base.js";
import * as m1 from "./abstract-controller/callbacks.js";
import * as m2 from "./abstract-controller/error.js";
import * as m3 from "./abstract-controller/rendering.js";
import * as m4 from "./action-controller/api.js";
import * as m5 from "./action-controller/base.js";
import * as m6 from "./action-controller/log-subscriber.js";
import * as m7 from "./action-controller/metal.js";
import * as m8 from "./action-controller/metal/allow-browser.js";
import * as m9 from "./action-controller/metal/exceptions.js";
import * as m10 from "./action-controller/metal/live.js";
import * as m11 from "./action-controller/metal/mime-responds.js";
import * as m12 from "./action-controller/metal/params-wrapper.js";
import * as m13 from "./action-controller/metal/redirecting.js";
import * as m14 from "./action-controller/metal/renderers.js";
import * as m15 from "./action-controller/metal/request-forgery-protection.js";
import * as m16 from "./action-controller/metal/strong-parameters.js";
import * as m17 from "./action-controller/renderer.js";
import * as m18 from "./action-controller/test-case.js";
import * as m19 from "./action-dispatch/http/content-disposition.js";
import * as m20 from "./action-dispatch/http/content-security-policy.js";
import * as m21 from "./action-dispatch/http/headers.js";
import * as m22 from "./action-dispatch/http/mime-negotiation.js";
import * as m23 from "./action-dispatch/http/mime-type.js";
import * as m24 from "./action-dispatch/http/param-builder.js";
import * as m25 from "./action-dispatch/http/param-error.js";
import * as m26 from "./action-dispatch/http/parameters.js";
import * as m27 from "./action-dispatch/http/permissions-policy.js";
import * as m28 from "./action-dispatch/http/query-parser.js";
import * as m29 from "./action-dispatch/http/request.js";
import * as m30 from "./action-dispatch/http/response.js";
import * as m31 from "./action-dispatch/http/upload.js";
import * as m32 from "./action-dispatch/journey/formatter.js";
import * as m33 from "./action-dispatch/journey/gtg/builder.js";
import * as m34 from "./action-dispatch/journey/gtg/simulator.js";
import * as m35 from "./action-dispatch/journey/gtg/transition-table.js";
import * as m36 from "./action-dispatch/journey/nodes/node.js";
import * as m37 from "./action-dispatch/journey/parser.js";
import * as m38 from "./action-dispatch/journey/path/pattern.js";
import * as m39 from "./action-dispatch/journey/route.js";
import * as m40 from "./action-dispatch/journey/router.js";
import * as m41 from "./action-dispatch/journey/router/utils.js";
import * as m42 from "./action-dispatch/journey/routes.js";
import * as m43 from "./action-dispatch/journey/visitors.js";
import * as m44 from "./action-dispatch/log-subscriber.js";
import * as m45 from "./action-dispatch/middleware/actionable-exceptions.js";
import * as m46 from "./action-dispatch/middleware/assume-ssl.js";
import * as m47 from "./action-dispatch/middleware/callbacks.js";
import * as m48 from "./action-dispatch/middleware/cookies.js";
import * as m49 from "./action-dispatch/middleware/debug-exceptions.js";
import * as m50 from "./action-dispatch/middleware/debug-locks.js";
import * as m51 from "./action-dispatch/middleware/debug-view.js";
import * as m52 from "./action-dispatch/middleware/exception-wrapper.js";
import * as m53 from "./action-dispatch/middleware/executor.js";
import * as m54 from "./action-dispatch/middleware/flash.js";
import * as m55 from "./action-dispatch/middleware/host-authorization.js";
import * as m56 from "./action-dispatch/middleware/public-exceptions.js";
import * as m57 from "./action-dispatch/middleware/reloader.js";
import * as m58 from "./action-dispatch/middleware/remote-ip.js";
import * as m59 from "./action-dispatch/middleware/request-id.js";
import * as m60 from "./action-dispatch/middleware/server-timing.js";
import * as m61 from "./action-dispatch/middleware/session/abstract-store.js";
import * as m62 from "./action-dispatch/middleware/session/cache-store.js";
import * as m63 from "./action-dispatch/middleware/session/cookie-store.js";
import * as m64 from "./action-dispatch/middleware/session/mem-cache-store.js";
import * as m65 from "./action-dispatch/middleware/show-exceptions.js";
import * as m66 from "./action-dispatch/middleware/ssl.js";
import * as m67 from "./action-dispatch/middleware/stack.js";
import * as m68 from "./action-dispatch/middleware/static.js";
import * as m69 from "./action-dispatch/request/session.js";
import * as m70 from "./action-dispatch/request/utils.js";
import * as m71 from "./action-dispatch/routing/endpoint.js";
import * as m72 from "./action-dispatch/routing/inspector.js";
import * as m73 from "./action-dispatch/routing/mapper.js";
import * as m74 from "./action-dispatch/routing/polymorphic-routes.js";
import * as m75 from "./action-dispatch/routing/redirection.js";
import * as m76 from "./action-dispatch/routing/route-set.js";
import * as m77 from "./action-dispatch/routing/routes-proxy.js";
import * as m78 from "./action-dispatch/system-test-case.js";
import * as m79 from "./action-dispatch/system-testing/browser.js";
import * as m80 from "./action-dispatch/system-testing/driver.js";
import * as m81 from "./action-dispatch/system-testing/server.js";
import * as m82 from "./action-dispatch/testing/assertion-response.js";
import * as m83 from "./action-dispatch/testing/integration.js";
import * as m84 from "./action-dispatch/testing/request-encoder.js";
import * as m85 from "./action-dispatch/testing/test-helpers/page-dump-helper.js";
import * as m86 from "./action-dispatch/testing/test-request.js";
import * as m87 from "./action-dispatch/testing/test-response.js";

registerClassPaths([
  [() => m0.ActionNotFound, "AbstractController::ActionNotFound"],
  [() => m0.Base, "AbstractController::Base"],
  [() => m1.ActionFilter, "AbstractController::Callbacks::ActionFilter"],
  [() => m3.DoubleRenderError, "AbstractController::DoubleRenderError"],
  [() => m2.Error, "AbstractController::Error"],
  [() => m9.ActionControllerError, "ActionController::ActionControllerError"],
  [() => m8.BrowserBlocker, "ActionController::AllowBrowser::BrowserBlocker"],
  [() => m4.API, "ActionController::API"],
  [() => m9.BadRequest, "ActionController::BadRequest"],
  [() => m5.Base, "ActionController::Base"],
  [() => m16.ExpectedParameterMissing, "ActionController::ExpectedParameterMissing"],
  [() => m15.InvalidAuthenticityToken, "ActionController::InvalidAuthenticityToken"],
  [() => m15.InvalidCrossOriginRequest, "ActionController::InvalidCrossOriginRequest"],
  [() => m16.InvalidParameterKey, "ActionController::InvalidParameterKey"],
  [() => m10.Buffer, "ActionController::Live::Buffer"],
  [() => m10.ClientDisconnected, "ActionController::Live::ClientDisconnected"],
  [() => m10.Response, "ActionController::Live::Response"],
  [() => m10.SSE, "ActionController::Live::SSE"],
  [() => m18.LiveTestResponse, "ActionController::LiveTestResponse"],
  [() => m6.LogSubscriber, "ActionController::LogSubscriber"],
  [() => m7.Metal, "ActionController::Metal"],
  [() => m9.MethodNotAllowed, "ActionController::MethodNotAllowed"],
  [() => m7.MiddlewareStack, "ActionController::MiddlewareStack"],
  [() => m7.Middleware, "ActionController::MiddlewareStack::Middleware"],
  [() => m11.Collector, "ActionController::MimeResponds::Collector"],
  [() => m11.VariantCollector, "ActionController::MimeResponds::Collector::VariantCollector"],
  [() => m9.MissingExactTemplate, "ActionController::MissingExactTemplate"],
  [() => m9.MissingFile, "ActionController::MissingFile"],
  [() => m14.MissingRenderer, "ActionController::MissingRenderer"],
  [() => m9.NotImplemented, "ActionController::NotImplemented"],
  [() => m16.ParameterMissing, "ActionController::ParameterMissing"],
  [() => m16.Parameters, "ActionController::Parameters"],
  [() => m12.Options, "ActionController::ParamsWrapper::Options"],
  [() => m13.UnsafeRedirectError, "ActionController::Redirecting::UnsafeRedirectError"],
  [() => m17.Renderer, "ActionController::Renderer"],
  [() => m9.RenderError, "ActionController::RenderError"],
  [() => m15.CookieStore, "ActionController::RequestForgeryProtection::CookieStore"],
  [() => m15.Exception, "ActionController::RequestForgeryProtection::ProtectionMethods::Exception"],
  [
    () => m15.NullSession,
    "ActionController::RequestForgeryProtection::ProtectionMethods::NullSession",
  ],
  [
    () => m15.NullCookieJar,
    "ActionController::RequestForgeryProtection::ProtectionMethods::NullSession::NullCookieJar",
  ],
  [
    () => m15.NullSessionHash,
    "ActionController::RequestForgeryProtection::ProtectionMethods::NullSession::NullSessionHash",
  ],
  [
    () => m15.ResetSession,
    "ActionController::RequestForgeryProtection::ProtectionMethods::ResetSession",
  ],
  [() => m15.SessionStore, "ActionController::RequestForgeryProtection::SessionStore"],
  [() => m9.RespondToMismatchError, "ActionController::RespondToMismatchError"],
  [() => m9.RoutingError, "ActionController::RoutingError"],
  [() => m9.SessionOverflowError, "ActionController::SessionOverflowError"],
  [() => m18.TestCase, "ActionController::TestCase"],
  [() => m18.TestRequest, "ActionController::TestRequest"],
  [() => m18.TestSession, "ActionController::TestSession"],
  [() => m16.UnfilteredParameters, "ActionController::UnfilteredParameters"],
  [() => m9.UnknownFormat, "ActionController::UnknownFormat"],
  [() => m9.UnknownHttpMethod, "ActionController::UnknownHttpMethod"],
  [() => m16.UnpermittedParameters, "ActionController::UnpermittedParameters"],
  [() => m9.UrlGenerationError, "ActionController::UrlGenerationError"],
  [() => m45.ActionableExceptions, "ActionDispatch::ActionableExceptions"],
  [() => m82.AssertionResponse, "ActionDispatch::AssertionResponse"],
  [() => m46.AssumeSSL, "ActionDispatch::AssumeSSL"],
  [() => m47.Callbacks, "ActionDispatch::Callbacks"],
  [() => m20.ContentSecurityPolicy, "ActionDispatch::ContentSecurityPolicy"],
  [() => m20.InvalidDirectiveError, "ActionDispatch::ContentSecurityPolicy::InvalidDirectiveError"],
  [() => m20.Middleware, "ActionDispatch::ContentSecurityPolicy::Middleware"],
  [() => m48.Cookies, "ActionDispatch::Cookies"],
  [() => m48.AbstractCookieJar, "ActionDispatch::Cookies::AbstractCookieJar"],
  [() => m48.CookieJar, "ActionDispatch::Cookies::CookieJar"],
  [
    () => m48.EncryptedKeyRotatingCookieJar,
    "ActionDispatch::Cookies::EncryptedKeyRotatingCookieJar",
  ],
  [() => m48.PermanentCookieJar, "ActionDispatch::Cookies::PermanentCookieJar"],
  [() => m48.SignedKeyRotatingCookieJar, "ActionDispatch::Cookies::SignedKeyRotatingCookieJar"],
  [() => m49.DebugExceptions, "ActionDispatch::DebugExceptions"],
  [() => m50.DebugLocks, "ActionDispatch::DebugLocks"],
  [() => m51.DebugView, "ActionDispatch::DebugView"],
  [() => m52.ExceptionWrapper, "ActionDispatch::ExceptionWrapper"],
  [() => m52.SourceMapLocation, "ActionDispatch::ExceptionWrapper::SourceMapLocation"],
  [() => m53.Executor, "ActionDispatch::Executor"],
  [() => m68.FileHandler, "ActionDispatch::FileHandler"],
  [() => m54.Flash, "ActionDispatch::Flash"],
  [() => m54.FlashHash, "ActionDispatch::Flash::FlashHash"],
  [() => m54.FlashNow, "ActionDispatch::Flash::FlashNow"],
  [() => m55.HostAuthorization, "ActionDispatch::HostAuthorization"],
  [() => m55.DefaultResponseApp, "ActionDispatch::HostAuthorization::DefaultResponseApp"],
  [() => m55.Permissions, "ActionDispatch::HostAuthorization::Permissions"],
  [() => m19.ContentDisposition, "ActionDispatch::Http::ContentDisposition"],
  [() => m21.Headers, "ActionDispatch::Http::Headers"],
  [() => m22.InvalidType, "ActionDispatch::Http::MimeNegotiation::InvalidType"],
  [() => m26.ParseError, "ActionDispatch::Http::Parameters::ParseError"],
  [() => m31.UploadedFile, "ActionDispatch::Http::UploadedFile"],
  [() => m83.Session, "ActionDispatch::Integration::Session"],
  [() => m83.IntegrationTest, "ActionDispatch::IntegrationTest"],
  [() => m25.InvalidParameterError, "ActionDispatch::InvalidParameterError"],
  [() => m36.Ast, "ActionDispatch::Journey::Ast"],
  [() => m43.Format, "ActionDispatch::Journey::Format"],
  [() => m43.Parameter, "ActionDispatch::Journey::Format::Parameter"],
  [() => m32.Formatter, "ActionDispatch::Journey::Formatter"],
  [() => m32.MissingRoute, "ActionDispatch::Journey::Formatter::MissingRoute"],
  [() => m32.RouteWithParams, "ActionDispatch::Journey::Formatter::RouteWithParams"],
  [() => m33.Builder, "ActionDispatch::Journey::GTG::Builder"],
  [() => m34.MatchData, "ActionDispatch::Journey::GTG::MatchData"],
  [() => m34.Simulator, "ActionDispatch::Journey::GTG::Simulator"],
  [() => m35.TransitionTable, "ActionDispatch::Journey::GTG::TransitionTable"],
  [() => m36.Binary, "ActionDispatch::Journey::Nodes::Binary"],
  [() => m36.Cat, "ActionDispatch::Journey::Nodes::Cat"],
  [() => m36.Dot, "ActionDispatch::Journey::Nodes::Dot"],
  [() => m36.Dummy, "ActionDispatch::Journey::Nodes::Dummy"],
  [() => m36.Group, "ActionDispatch::Journey::Nodes::Group"],
  [() => m36.Literal, "ActionDispatch::Journey::Nodes::Literal"],
  [() => m36.Node, "ActionDispatch::Journey::Nodes::Node"],
  [() => m36.Or, "ActionDispatch::Journey::Nodes::Or"],
  [() => m36.Slash, "ActionDispatch::Journey::Nodes::Slash"],
  [() => m36.Star, "ActionDispatch::Journey::Nodes::Star"],
  [() => m36.Symbol, "ActionDispatch::Journey::Nodes::Symbol"],
  [() => m36.Terminal, "ActionDispatch::Journey::Nodes::Terminal"],
  [() => m36.Unary, "ActionDispatch::Journey::Nodes::Unary"],
  [() => m37.Parser, "ActionDispatch::Journey::Parser"],
  [() => m38.Pattern, "ActionDispatch::Journey::Path::Pattern"],
  [() => m38.AnchoredRegexp, "ActionDispatch::Journey::Path::Pattern::AnchoredRegexp"],
  [() => m38.MatchData, "ActionDispatch::Journey::Path::Pattern::MatchData"],
  [() => m38.UnanchoredRegexp, "ActionDispatch::Journey::Path::Pattern::UnanchoredRegexp"],
  [() => m39.Route, "ActionDispatch::Journey::Route"],
  [() => m39.All, "ActionDispatch::Journey::Route::VerbMatchers::All"],
  [() => m39.Unknown, "ActionDispatch::Journey::Route::VerbMatchers::Unknown"],
  [() => m40.Router, "ActionDispatch::Journey::Router"],
  [() => m41.Utils, "ActionDispatch::Journey::Router::Utils"],
  [() => m41.UriEncoder, "ActionDispatch::Journey::Router::Utils::UriEncoder"],
  [() => m42.Routes, "ActionDispatch::Journey::Routes"],
  [() => m43.Dot, "ActionDispatch::Journey::Visitors::Dot"],
  [() => m43.Each, "ActionDispatch::Journey::Visitors::Each"],
  [() => m43.FormatBuilder, "ActionDispatch::Journey::Visitors::FormatBuilder"],
  [() => m43.FunctionalVisitor, "ActionDispatch::Journey::Visitors::FunctionalVisitor"],
  [() => m43.String, "ActionDispatch::Journey::Visitors::String"],
  [() => m43.Visitor, "ActionDispatch::Journey::Visitors::Visitor"],
  [() => m44.LogSubscriber, "ActionDispatch::LogSubscriber"],
  [() => m67.MiddlewareStack, "ActionDispatch::MiddlewareStack"],
  [() => m67.InstrumentationProxy, "ActionDispatch::MiddlewareStack::InstrumentationProxy"],
  [() => m67.Middleware, "ActionDispatch::MiddlewareStack::Middleware"],
  [() => m24.ParamBuilder, "ActionDispatch::ParamBuilder"],
  [() => m25.ParamError, "ActionDispatch::ParamError"],
  [() => m25.ParameterTypeError, "ActionDispatch::ParameterTypeError"],
  [() => m25.ParamsTooDeepError, "ActionDispatch::ParamsTooDeepError"],
  [() => m27.PermissionsPolicy, "ActionDispatch::PermissionsPolicy"],
  [() => m27.Middleware, "ActionDispatch::PermissionsPolicy::Middleware"],
  [() => m56.PublicExceptions, "ActionDispatch::PublicExceptions"],
  [() => m28.QueryParser, "ActionDispatch::QueryParser"],
  [() => m57.Reloader, "ActionDispatch::Reloader"],
  [() => m58.RemoteIp, "ActionDispatch::RemoteIp"],
  [() => m58.GetIp, "ActionDispatch::RemoteIp::GetIp"],
  [() => m58.IpSpoofAttackError, "ActionDispatch::RemoteIp::IpSpoofAttackError"],
  [() => m29.Request, "ActionDispatch::Request"],
  [() => m29.PASS_NOT_FOUND, "ActionDispatch::Request::PASS_NOT_FOUND"],
  [() => m69.Session, "ActionDispatch::Request::Session"],
  [() => m69.Options, "ActionDispatch::Request::Session::Options"],
  [() => m70.Utils, "ActionDispatch::Request::Utils"],
  [() => m70.CustomParamEncoder, "ActionDispatch::Request::Utils::CustomParamEncoder"],
  [() => m70.NoNilParamEncoder, "ActionDispatch::Request::Utils::NoNilParamEncoder"],
  [() => m70.ParamEncoder, "ActionDispatch::Request::Utils::ParamEncoder"],
  [() => m84.RequestEncoder, "ActionDispatch::RequestEncoder"],
  [() => m84.IdentityEncoder, "ActionDispatch::RequestEncoder::IdentityEncoder"],
  [() => m59.RequestId, "ActionDispatch::RequestId"],
  [() => m30.Response, "ActionDispatch::Response"],
  [() => m30.Buffer, "ActionDispatch::Response::Buffer"],
  [() => m30.ContentTypeHeader, "ActionDispatch::Response::ContentTypeHeader"],
  [() => m30.FileBody, "ActionDispatch::Response::FileBody"],
  [() => m30.RackBody, "ActionDispatch::Response::RackBody"],
  [() => m72.Base, "ActionDispatch::Routing::ConsoleFormatter::Base"],
  [() => m72.Expanded, "ActionDispatch::Routing::ConsoleFormatter::Expanded"],
  [() => m72.Sheet, "ActionDispatch::Routing::ConsoleFormatter::Sheet"],
  [() => m72.Unused, "ActionDispatch::Routing::ConsoleFormatter::Unused"],
  [() => m71.Endpoint, "ActionDispatch::Routing::Endpoint"],
  [() => m72.HtmlTableFormatter, "ActionDispatch::Routing::HtmlTableFormatter"],
  [() => m73.Mapper, "ActionDispatch::Routing::Mapper"],
  [() => m73.Constraints, "ActionDispatch::Routing::Mapper::Constraints"],
  [() => m73.Mapping, "ActionDispatch::Routing::Mapper::Mapping"],
  [() => m73.Resource, "ActionDispatch::Routing::Mapper::Resources::Resource"],
  [() => m73.SingletonResource, "ActionDispatch::Routing::Mapper::Resources::SingletonResource"],
  [() => m73.Scope, "ActionDispatch::Routing::Mapper::Scope"],
  [() => m75.OptionRedirect, "ActionDispatch::Routing::OptionRedirect"],
  [() => m75.PathRedirect, "ActionDispatch::Routing::PathRedirect"],
  [
    () => m74.HelperMethodBuilder,
    "ActionDispatch::Routing::PolymorphicRoutes::HelperMethodBuilder",
  ],
  [() => m75.Redirect, "ActionDispatch::Routing::Redirect"],
  [() => m76.RouteSet, "ActionDispatch::Routing::RouteSet"],
  [() => m76.Config, "ActionDispatch::Routing::RouteSet::Config"],
  [() => m76.CustomUrlHelper, "ActionDispatch::Routing::RouteSet::CustomUrlHelper"],
  [() => m76.Dispatcher, "ActionDispatch::Routing::RouteSet::Dispatcher"],
  [() => m76.Generator, "ActionDispatch::Routing::RouteSet::Generator"],
  [() => m76.NamedRouteCollection, "ActionDispatch::Routing::RouteSet::NamedRouteCollection"],
  [() => m76.UrlHelper, "ActionDispatch::Routing::RouteSet::NamedRouteCollection::UrlHelper"],
  [
    () => m76.OptimizedUrlHelper,
    "ActionDispatch::Routing::RouteSet::NamedRouteCollection::UrlHelper::OptimizedUrlHelper",
  ],
  [() => m76.StaticDispatcher, "ActionDispatch::Routing::RouteSet::StaticDispatcher"],
  [() => m72.RoutesInspector, "ActionDispatch::Routing::RoutesInspector"],
  [() => m77.RoutesProxy, "ActionDispatch::Routing::RoutesProxy"],
  [() => m72.RouteWrapper, "ActionDispatch::Routing::RouteWrapper"],
  [() => m60.ServerTiming, "ActionDispatch::ServerTiming"],
  [() => m60.Subscriber, "ActionDispatch::ServerTiming::Subscriber"],
  [() => m61.AbstractSecureStore, "ActionDispatch::Session::AbstractSecureStore"],
  [() => m61.AbstractStore, "ActionDispatch::Session::AbstractStore"],
  [() => m62.CacheStore, "ActionDispatch::Session::CacheStore"],
  [() => m63.CookieStore, "ActionDispatch::Session::CookieStore"],
  [() => m63.SessionId, "ActionDispatch::Session::CookieStore::SessionId"],
  [() => m64.MemCacheStore, "ActionDispatch::Session::MemCacheStore"],
  [() => m61.SessionRestoreError, "ActionDispatch::Session::SessionRestoreError"],
  [() => m65.ShowExceptions, "ActionDispatch::ShowExceptions"],
  [() => m66.SSL, "ActionDispatch::SSL"],
  [() => m68.Static, "ActionDispatch::Static"],
  [() => m78.SystemTestCase, "ActionDispatch::SystemTestCase"],
  [() => m79.Browser, "ActionDispatch::SystemTesting::Browser"],
  [() => m80.Driver, "ActionDispatch::SystemTesting::Driver"],
  [() => m81.Server, "ActionDispatch::SystemTesting::Server"],
  [() => m85.InvalidResponse, "ActionDispatch::TestHelpers::PageDumpHelper::InvalidResponse"],
  [() => m86.TestRequest, "ActionDispatch::TestRequest"],
  [() => m87.TestResponse, "ActionDispatch::TestResponse"],
  [() => m23.AllType, "Mime::AllType"],
  [() => m23.Mimes, "Mime::Mimes"],
  [() => m23.NullType, "Mime::NullType"],
  [() => m23.AcceptItem, "Mime::Type::AcceptItem"],
  [() => m23.AcceptList, "Mime::Type::AcceptList"],
]);
