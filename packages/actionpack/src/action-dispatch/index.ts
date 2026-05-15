export const VERSION = "8.0.2";

export { Deprecator, deprecator } from "./deprecator.js";
export { LogSubscriber } from "./log-subscriber.js";
export * as Constants from "./constants.js";

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
  type Dispatcher,
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
