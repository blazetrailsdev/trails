import { Net } from "../protocol.js";
import { HTTPResponse } from "./response.js";

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:7` */
export class HTTPUnknownResponse extends HTTPResponse {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:21` */
export class HTTPInformation extends HTTPResponse {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = false;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:36` */
export class HTTPSuccess extends HTTPResponse {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:51` */
export class HTTPRedirection extends HTTPResponse {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:65` */
export class HTTPClientError extends HTTPResponse {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:79` */
export class HTTPServerError extends HTTPResponse {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:96` */
export class HTTPContinue extends HTTPInformation {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = false;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:113` */
export class HTTPSwitchProtocol extends HTTPInformation {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = false;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:129` */
export class HTTPProcessing extends HTTPInformation {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = false;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:147` */
export class HTTPEarlyHints extends HTTPInformation {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = false;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:164` */
export class HTTPOK extends HTTPSuccess {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:181` */
export class HTTPCreated extends HTTPSuccess {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:198` */
export class HTTPAccepted extends HTTPSuccess {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:217` */
export class HTTPNonAuthoritativeInformation extends HTTPSuccess {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:234` */
export class HTTPNoContent extends HTTPSuccess {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = false;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:252` */
export class HTTPResetContent extends HTTPSuccess {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = false;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:270` */
export class HTTPPartialContent extends HTTPSuccess {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:287` */
export class HTTPMultiStatus extends HTTPSuccess {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:306` */
export class HTTPAlreadyReported extends HTTPSuccess {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:323` */
export class HTTPIMUsed extends HTTPSuccess {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:340` */
export class HTTPMultipleChoices extends HTTPRedirection {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:358` */
export class HTTPMovedPermanently extends HTTPRedirection {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:375` */
export class HTTPFound extends HTTPRedirection {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:392` */
export class HTTPSeeOther extends HTTPRedirection {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:409` */
export class HTTPNotModified extends HTTPRedirection {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = false;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:425` */
export class HTTPUseProxy extends HTTPRedirection {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = false;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:442` */
export class HTTPTemporaryRedirect extends HTTPRedirection {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:458` */
export class HTTPPermanentRedirect extends HTTPRedirection {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:474` */
export class HTTPBadRequest extends HTTPClientError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:490` */
export class HTTPUnauthorized extends HTTPClientError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:506` */
export class HTTPPaymentRequired extends HTTPClientError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:523` */
export class HTTPForbidden extends HTTPClientError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:539` */
export class HTTPNotFound extends HTTPClientError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:555` */
export class HTTPMethodNotAllowed extends HTTPClientError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:572` */
export class HTTPNotAcceptable extends HTTPClientError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:588` */
export class HTTPProxyAuthenticationRequired extends HTTPClientError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:604` */
export class HTTPRequestTimeout extends HTTPClientError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:621` */
export class HTTPConflict extends HTTPClientError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:638` */
export class HTTPGone extends HTTPClientError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:655` */
export class HTTPLengthRequired extends HTTPClientError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:672` */
export class HTTPPreconditionFailed extends HTTPClientError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:688` */
export class HTTPPayloadTooLarge extends HTTPClientError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:705` */
export class HTTPURITooLong extends HTTPClientError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:723` */
export class HTTPUnsupportedMediaType extends HTTPClientError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:739` */
export class HTTPRangeNotSatisfiable extends HTTPClientError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:756` */
export class HTTPExpectationFailed extends HTTPClientError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:776` */
export class HTTPMisdirectedRequest extends HTTPClientError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:792` */
export class HTTPUnprocessableEntity extends HTTPClientError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:807` */
export class HTTPLocked extends HTTPClientError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:823` */
export class HTTPFailedDependency extends HTTPClientError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:842` */
export class HTTPUpgradeRequired extends HTTPClientError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:858` */
export class HTTPPreconditionRequired extends HTTPClientError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:874` */
export class HTTPTooManyRequests extends HTTPClientError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:891` */
export class HTTPRequestHeaderFieldsTooLarge extends HTTPClientError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:908` */
export class HTTPUnavailableForLegalReasons extends HTTPClientError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:928` */
export class HTTPInternalServerError extends HTTPServerError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:945` */
export class HTTPNotImplemented extends HTTPServerError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:962` */
export class HTTPBadGateway extends HTTPServerError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:979` */
export class HTTPServiceUnavailable extends HTTPServerError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:996` */
export class HTTPGatewayTimeout extends HTTPServerError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:1013` */
export class HTTPVersionNotSupported extends HTTPServerError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:1029` */
export class HTTPVariantAlsoNegotiates extends HTTPServerError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:1045` */
export class HTTPInsufficientStorage extends HTTPServerError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:1061` */
export class HTTPLoopDetected extends HTTPServerError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:1078` */
export class HTTPNotExtended extends HTTPServerError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:1094` */
export class HTTPNetworkAuthenticationRequired extends HTTPServerError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

HTTPResponse.CODE_CLASS_TO_OBJ = {
  "1": HTTPInformation,
  "2": HTTPSuccess,
  "3": HTTPRedirection,
  "4": HTTPClientError,
  "5": HTTPServerError,
};
HTTPResponse.CODE_TO_OBJ = {
  "100": HTTPContinue,
  "101": HTTPSwitchProtocol,
  "102": HTTPProcessing,
  "103": HTTPEarlyHints,
  "200": HTTPOK,
  "201": HTTPCreated,
  "202": HTTPAccepted,
  "203": HTTPNonAuthoritativeInformation,
  "204": HTTPNoContent,
  "205": HTTPResetContent,
  "206": HTTPPartialContent,
  "207": HTTPMultiStatus,
  "208": HTTPAlreadyReported,
  "226": HTTPIMUsed,
  "300": HTTPMultipleChoices,
  "301": HTTPMovedPermanently,
  "302": HTTPFound,
  "303": HTTPSeeOther,
  "304": HTTPNotModified,
  "305": HTTPUseProxy,
  "307": HTTPTemporaryRedirect,
  "308": HTTPPermanentRedirect,
  "400": HTTPBadRequest,
  "401": HTTPUnauthorized,
  "402": HTTPPaymentRequired,
  "403": HTTPForbidden,
  "404": HTTPNotFound,
  "405": HTTPMethodNotAllowed,
  "406": HTTPNotAcceptable,
  "407": HTTPProxyAuthenticationRequired,
  "408": HTTPRequestTimeout,
  "409": HTTPConflict,
  "410": HTTPGone,
  "411": HTTPLengthRequired,
  "412": HTTPPreconditionFailed,
  "413": HTTPPayloadTooLarge,
  "414": HTTPURITooLong,
  "415": HTTPUnsupportedMediaType,
  "416": HTTPRangeNotSatisfiable,
  "417": HTTPExpectationFailed,
  "421": HTTPMisdirectedRequest,
  "422": HTTPUnprocessableEntity,
  "423": HTTPLocked,
  "424": HTTPFailedDependency,
  "426": HTTPUpgradeRequired,
  "428": HTTPPreconditionRequired,
  "429": HTTPTooManyRequests,
  "431": HTTPRequestHeaderFieldsTooLarge,
  "451": HTTPUnavailableForLegalReasons,
  "500": HTTPInternalServerError,
  "501": HTTPNotImplemented,
  "502": HTTPBadGateway,
  "503": HTTPServiceUnavailable,
  "504": HTTPGatewayTimeout,
  "505": HTTPVersionNotSupported,
  "506": HTTPVariantAlsoNegotiates,
  "507": HTTPInsufficientStorage,
  "508": HTTPLoopDetected,
  "510": HTTPNotExtended,
  "511": HTTPNetworkAuthenticationRequired,
};

Net.HTTPResponse = HTTPResponse;
Net.HTTPUnknownResponse = HTTPUnknownResponse;
Net.HTTPInformation = HTTPInformation;
Net.HTTPSuccess = HTTPSuccess;
Net.HTTPRedirection = HTTPRedirection;
Net.HTTPClientError = HTTPClientError;
Net.HTTPServerError = HTTPServerError;
Net.HTTPContinue = HTTPContinue;
Net.HTTPSwitchProtocol = HTTPSwitchProtocol;
Net.HTTPProcessing = HTTPProcessing;
Net.HTTPEarlyHints = HTTPEarlyHints;
Net.HTTPOK = HTTPOK;
Net.HTTPCreated = HTTPCreated;
Net.HTTPAccepted = HTTPAccepted;
Net.HTTPNonAuthoritativeInformation = HTTPNonAuthoritativeInformation;
Net.HTTPNoContent = HTTPNoContent;
Net.HTTPResetContent = HTTPResetContent;
Net.HTTPPartialContent = HTTPPartialContent;
Net.HTTPMultiStatus = HTTPMultiStatus;
Net.HTTPAlreadyReported = HTTPAlreadyReported;
Net.HTTPIMUsed = HTTPIMUsed;
Net.HTTPMultipleChoices = HTTPMultipleChoices;
Net.HTTPMovedPermanently = HTTPMovedPermanently;
Net.HTTPFound = HTTPFound;
Net.HTTPSeeOther = HTTPSeeOther;
Net.HTTPNotModified = HTTPNotModified;
Net.HTTPUseProxy = HTTPUseProxy;
Net.HTTPTemporaryRedirect = HTTPTemporaryRedirect;
Net.HTTPPermanentRedirect = HTTPPermanentRedirect;
Net.HTTPBadRequest = HTTPBadRequest;
Net.HTTPUnauthorized = HTTPUnauthorized;
Net.HTTPPaymentRequired = HTTPPaymentRequired;
Net.HTTPForbidden = HTTPForbidden;
Net.HTTPNotFound = HTTPNotFound;
Net.HTTPMethodNotAllowed = HTTPMethodNotAllowed;
Net.HTTPNotAcceptable = HTTPNotAcceptable;
Net.HTTPProxyAuthenticationRequired = HTTPProxyAuthenticationRequired;
Net.HTTPRequestTimeout = HTTPRequestTimeout;
Net.HTTPConflict = HTTPConflict;
Net.HTTPGone = HTTPGone;
Net.HTTPLengthRequired = HTTPLengthRequired;
Net.HTTPPreconditionFailed = HTTPPreconditionFailed;
Net.HTTPPayloadTooLarge = HTTPPayloadTooLarge;
Net.HTTPURITooLong = HTTPURITooLong;
Net.HTTPUnsupportedMediaType = HTTPUnsupportedMediaType;
Net.HTTPRangeNotSatisfiable = HTTPRangeNotSatisfiable;
Net.HTTPExpectationFailed = HTTPExpectationFailed;
Net.HTTPMisdirectedRequest = HTTPMisdirectedRequest;
Net.HTTPUnprocessableEntity = HTTPUnprocessableEntity;
Net.HTTPLocked = HTTPLocked;
Net.HTTPFailedDependency = HTTPFailedDependency;
Net.HTTPUpgradeRequired = HTTPUpgradeRequired;
Net.HTTPPreconditionRequired = HTTPPreconditionRequired;
Net.HTTPTooManyRequests = HTTPTooManyRequests;
Net.HTTPRequestHeaderFieldsTooLarge = HTTPRequestHeaderFieldsTooLarge;
Net.HTTPUnavailableForLegalReasons = HTTPUnavailableForLegalReasons;
Net.HTTPInternalServerError = HTTPInternalServerError;
Net.HTTPNotImplemented = HTTPNotImplemented;
Net.HTTPBadGateway = HTTPBadGateway;
Net.HTTPServiceUnavailable = HTTPServiceUnavailable;
Net.HTTPGatewayTimeout = HTTPGatewayTimeout;
Net.HTTPVersionNotSupported = HTTPVersionNotSupported;
Net.HTTPVariantAlsoNegotiates = HTTPVariantAlsoNegotiates;
Net.HTTPInsufficientStorage = HTTPInsufficientStorage;
Net.HTTPLoopDetected = HTTPLoopDetected;
Net.HTTPNotExtended = HTTPNotExtended;
Net.HTTPNetworkAuthenticationRequired = HTTPNetworkAuthenticationRequired;
