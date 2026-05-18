export const VERSION = "8.0.2";

export { Deprecator, deprecator } from "./deprecator.js";
export { Trailtie, type ActionDispatchConfig } from "./trailtie.js";
export { LogSubscriber } from "./log-subscriber.js";
export * as Constants from "./constants.js";
export * as Journey from "./journey/index.js";

import { LogSubscriber as _LogSubscriber } from "./log-subscriber.js";
_LogSubscriber.attachTo("action_dispatch");

export {
  Route,
  Mapper,
  RouteSet,
  RoutesInspector,
  type MatchedRoute,
  type RouteOptions,
  type RouteConstraints,
  type DrawCallback,
  Dispatcher,
  StaticDispatcher,
  type DispatcherCallback,
  escapePath,
  escapeSegment,
  escapeFragment,
  unescapeUri,
} from "./routing/index.js";

export { Request } from "./http/request.js";
export { Response, type CookieOptions } from "./http/response.js";
export {
  Parameters,
  ParameterMissing,
  ExpectedParameterMissing,
  UnpermittedParameters,
  UnfilteredParameters,
  InvalidParameterKey,
} from "../action-controller/metal/strong-parameters.js";
export { urlFor, type UrlOptions } from "./url-for.js";
export {
  CookieJar,
  SignedCookieJar,
  EncryptedCookieJar,
  PermanentCookieJar,
  type CookieJarOptions,
  type SetCookieOptions,
} from "./middleware/cookies.js";
export { SSL, type SSLOptions, type HSTSOptions } from "./middleware/ssl.js";
export {
  HostAuthorization,
  type HostAuthorizationOptions,
} from "./middleware/host-authorization.js";
export { MiddlewareStack } from "./middleware/stack.js";
export { MimeType } from "./http/mime-type.js";
export { ContentSecurityPolicy, type CSPSource } from "./http/content-security-policy.js";
export { redirectTo, redirectBack, type RedirectResult } from "./redirect.js";
export { FlashHash } from "./middleware/flash.js";
export { Static, type StaticOptions } from "./middleware/static.js";
export {
  RequestForgeryProtection,
  InvalidAuthenticityToken,
  type CsrfOptions,
  type CsrfStrategy,
} from "./request-forgery-protection.js";
export { respondTo, Collector, UnknownFormat } from "./respond-to.js";
export {
  PermissionsPolicy,
  type PermissionSource,
  type DirectiveName,
} from "./http/permissions-policy.js";
export { UploadedFile, type UploadedFileOptions } from "./http/upload.js";
export { ContentDisposition, type ContentDispositionOptions } from "./http/content-disposition.js";
export { QueryParser, type QueryPair } from "./http/query-parser.js";
export {
  PARAMETERS_KEY,
  DEFAULT_PARSERS,
  ParseError,
  parameters,
  pathParameters,
  setPathParameters,
  parseFormattedParameters,
  parameterParsers,
  setParameterParsers,
  logParseErrorOnce,
  paramsParsers,
  type ParameterParser,
  type ParameterParsers,
  type ParametersHost,
} from "./http/parameters.js";
export { RequestId, type RequestIdOptions } from "./middleware/request-id.js";
export {
  BasicAuth,
  TokenAuth,
  DigestAuth,
  type BasicAuthCredentials,
  type TokenAuthCredentials,
  type DigestAuthParams,
} from "./http-authentication.js";
export { ExceptionWrapper } from "./middleware/exception-wrapper.js";
export { AssumeSSL } from "./middleware/assume-ssl.js";
export { ActionableExceptions } from "./middleware/actionable-exceptions.js";
export { Callbacks } from "./middleware/callbacks.js";
export { ServerTiming } from "./middleware/server-timing.js";
export {
  DebugLocks,
  type InterlockLike,
  type ThreadLike,
  type ThreadInfo,
} from "./middleware/debug-locks.js";
export {
  Executor,
  type ExecutorLike,
  type ExecutorState,
  type ErrorReporterLike,
} from "./middleware/executor.js";
export { Reloader } from "./middleware/reloader.js";
export { PublicExceptions } from "./middleware/public-exceptions.js";
export {
  RemoteIp,
  GetIp,
  IpSpoofAttackError,
  TRUSTED_PROXIES,
  type Proxy,
} from "./middleware/remote-ip.js";
