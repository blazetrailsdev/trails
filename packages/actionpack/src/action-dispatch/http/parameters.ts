/**
 * ActionDispatch::Http::Parameters
 *
 * Port of `actionpack/lib/action_dispatch/http/parameters.rb`. Provides the
 * parameter-parser registry, the {@link ParseError} class, and the host
 * functions (`parameters`, `pathParameters`, `setPathParameters`,
 * `parseFormattedParameters`) that Rails mixes into `ActionDispatch::Request`
 * via `extend ActiveSupport::Concern`.
 *
 * In Ruby these are mixed into `Request`. In TypeScript we expose them as
 * `this`-typed functions per the mixin convention in CLAUDE.md so they can be
 * assigned directly onto the host class.
 */

import { Logger } from "@blazetrails/activesupport";
import { stderr } from "@blazetrails/activesupport/process-adapter";
import {
  ParameterTypeError as RackParameterTypeError,
  InvalidParameterError as RackInvalidParameterError,
  ParamsTooDeepError as RackParamsTooDeepError,
} from "@blazetrails/rack";
import { MimeType } from "./mime-type.js";

export const PARAMETERS_KEY = "action_dispatch.request.path_parameters";

/** Function that parses a raw request body into a params hash. */
export type ParameterParser = (rawPost: string) => Record<string, unknown>;

/** Map of MIME symbol → parser. */
export type ParameterParsers = Record<string, ParameterParser>;

/**
 * Default parser map. Mirrors the Ruby `DEFAULT_PARSERS` constant: the JSON
 * parser wraps non-Hash payloads in `{ _json: data }`.
 */
export const DEFAULT_PARSERS: ParameterParsers = {
  [MimeType.JSON.symbol]: (rawPost: string) => {
    const data = JSON.parse(rawPost);
    if (data !== null && typeof data === "object" && !Array.isArray(data)) {
      return data as Record<string, unknown>;
    }
    return { _json: data };
  },
};

/**
 * Raised when raw data from the request cannot be parsed by the parser
 * defined for the request's content MIME type.
 */
export class ParseError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "ActionDispatch::Http::Parameters::ParseError";
  }
}

/**
 * Minimal host surface required by the {@link Parameters} mixin functions.
 * Mirrors the methods Rails' `Http::Parameters` calls on `self`.
 */
export interface ParametersHost {
  getHeader(key: string): unknown;
  setHeader(key: string, value: unknown): unknown;
  deleteHeader(key: string): void;
  queryParameters: Record<string, unknown>;
  requestParameters: Record<string, unknown>;
  contentLength: number | undefined;
  contentMimeType: MimeType | null;
  rawPost: string;
  logger?: { debug(message: string): void } | null;
}

/**
 * Class-level parameter-parser registry. Mirrors Rails'
 * `Request.parameter_parsers` attr_accessor. Symbol keys are normalized via
 * `key.symbol` (`MimeType#symbol`) when present, matching the Ruby setter.
 */
let _parameterParsers: ParameterParsers = DEFAULT_PARSERS;

export function parameterParsers(): ParameterParsers {
  return _parameterParsers;
}

export function setParameterParsers(
  parsers: Record<string | symbol, ParameterParser> | Map<unknown, ParameterParser>,
): void {
  const normalized: ParameterParsers = {};
  const entries: Iterable<[unknown, ParameterParser]> =
    parsers instanceof Map
      ? parsers.entries()
      : (Reflect.ownKeys(parsers).map((k) => [
          k,
          (parsers as Record<string | symbol, ParameterParser>)[k as never],
        ]) as Array<[unknown, ParameterParser]>);
  for (const [key, value] of entries) {
    const sym =
      key !== null && typeof key === "object" && "symbol" in (key as object)
        ? String((key as { symbol: unknown }).symbol)
        : typeof key === "symbol"
          ? (key.description ?? String(key))
          : String(key);
    normalized[sym] = value;
  }
  _parameterParsers = normalized;
}

/**
 * Returns both GET and POST parameters in a single hash. Caches the merged
 * hash on the request env under `action_dispatch.request.parameters`.
 */
export function parameters(this: ParametersHost): Record<string, unknown> {
  const cached = this.getHeader("action_dispatch.request.parameters");
  if (cached) return cached as Record<string, unknown>;

  // Rails rescues only `EOFError` from `request_parameters.merge(...)`; ParseError
  // and other failures propagate so malformed bodies surface as 400s upstream
  // instead of being silently dropped. TS has no EOFError equivalent and the
  // trails `requestParameters` getter returns `{}` for empty bodies, so no
  // try/catch is needed.
  let params: Record<string, unknown> = { ...this.requestParameters, ...this.queryParameters };
  params = { ...params, ...pathParameters.call(this) };
  this.setHeader("action_dispatch.request.parameters", params);
  return params;
}

/**
 * Returns a hash with the parameters used to form the path of the request.
 *
 *     { action: "my_action", controller: "my_controller" }
 */
export function pathParameters(this: ParametersHost): Record<string, unknown> {
  const cached = this.getHeader(PARAMETERS_KEY);
  if (cached) return cached as Record<string, unknown>;
  const empty: Record<string, unknown> = {};
  this.setHeader(PARAMETERS_KEY, empty);
  return empty;
}

/**
 * Sets the path parameters, invalidating the merged-parameters cache. Mirrors
 * Rails' `path_parameters=` setter. Encoding-normalization (Rails calls
 * `Request::Utils.set_binary_encoding` + `check_param_encoding`) is omitted —
 * JS strings are UTF-16 and TS lacks Ruby's ASCII-8BIT vs UTF-8 distinction,
 * so there's nothing to coerce. Callers that need encoding validation should
 * apply it themselves before invoking this setter.
 */
export function setPathParameters(this: ParametersHost, parameters: Record<string, unknown>): void {
  this.deleteHeader("action_dispatch.request.parameters");
  this.setHeader(PARAMETERS_KEY, parameters);
}

/**
 * Invokes the parser registered for the request's content MIME type. If no
 * body or no matching parser is found, calls `fallback()` (matching the Ruby
 * `yield` semantics).
 *
 * @internal
 */
export function parseFormattedParameters(
  this: ParametersHost,
  parsers: ParameterParsers,
  fallback: () => Record<string, unknown>,
): Record<string, unknown> {
  // Rails: `content_length.zero? || content_mime_type.nil?` → yield. Our
  // `contentLength` returns `undefined` when the header is absent, so also
  // treat an empty `rawPost` as no body — otherwise JSON requests without a
  // `CONTENT_LENGTH` header would feed `""` to `JSON.parse` and raise
  // `ParseError` instead of returning the documented empty-body `{}`.
  if (this.contentLength === 0 || this.contentMimeType === null || !this.rawPost) {
    return fallback();
  }
  const strategy = parsers[this.contentMimeType.symbol];
  if (!strategy) return fallback();

  try {
    return strategy(this.rawPost);
  } catch (e) {
    // Pass ParamError-family failures (and already-wrapped ParseErrors)
    // through untouched so callers can `rescueFrom(ParamError)` and see the
    // specific subclass — mirrors Rails, where `ParamError.===` covers the
    // parallel Rack exceptions. Everything else collapses to a generic
    // ParseError so JSON / strategy bugs surface as a 400.
    if (e instanceof ParseError) throw e;
    if (
      e instanceof RackParameterTypeError ||
      e instanceof RackInvalidParameterError ||
      e instanceof RackParamsTooDeepError
    ) {
      throw e;
    }
    logParseErrorOnce.call(this);
    throw new ParseError("Error occurred while parsing request parameters");
  }
}

/**
 * Logs the parse failure exactly once per request. Mirrors Rails'
 * `log_parse_error_once`; the guard is persisted on the env under
 * `action_dispatch.request.parse_error_logged` so it survives across
 * throwaway host adapters (Rails uses `@parse_error_logged` on the
 * Request instance directly).
 *
 * @internal
 */
export function logParseErrorOnce(this: ParametersHost): void {
  // Rails stores `@parse_error_logged` on the Request instance. The trails
  // host adapter on `Request` can be a throwaway object created per access,
  // so persist the guard on the env via getHeader/setHeader instead.
  if (this.getHeader(PARSE_ERROR_LOGGED_KEY)) return;
  this.setHeader(PARSE_ERROR_LOGGED_KEY, true);
  const msg = `Error occurred while parsing request parameters.\nContents:\n\n${this.rawPost}`;
  if (this.logger) {
    this.logger.debug(msg);
    return;
  }
  // Rails uses `ActiveSupport::Logger.new($stderr)` as the fallback; in
  // browser hosts no process adapter is registered, so guard the write so
  // the log attempt never replaces the caller's `ParseError`.
  try {
    new Logger({ write: (s) => stderr.write(s) }).debug(msg);
  } catch {
    // no-op: log is informational, the ParseError remains the real signal.
  }
}

const PARSE_ERROR_LOGGED_KEY = "action_dispatch.request.parse_error_logged";

/**
 * Returns the currently-registered parameter parsers. Mirrors Rails'
 * private `params_parsers` which simply forwards to
 * `ActionDispatch::Request.parameter_parsers`.
 *
 * @internal
 */
export function paramsParsers(this: ParametersHost): ParameterParsers {
  return parameterParsers();
}
