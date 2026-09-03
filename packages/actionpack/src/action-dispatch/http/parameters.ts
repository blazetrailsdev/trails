import { Logger } from "@blazetrails/activesupport";
import { stderr } from "@blazetrails/ruby-compat";
import {
  ParameterTypeError as RackParameterTypeError,
  InvalidParameterError as RackInvalidParameterError,
  ParamsTooDeepError as RackParamsTooDeepError,
} from "@blazetrails/rack";
import { merge, mergeBang } from "@blazetrails/ruby-compat";
import { MimeType } from "./mime-type.js";

export const PARAMETERS_KEY = "action_dispatch.request.path_parameters";

export type ParameterParser = (rawPost: string) => Record<string, unknown>;

export type ParameterParsers = Record<string, ParameterParser>;

export const DEFAULT_PARSERS: ParameterParsers = {
  [MimeType.JSON.symbol!]: (rawPost: string) => {
    const data = JSON.parse(rawPost);
    if (data !== null && typeof data === "object" && !Array.isArray(data)) {
      return data as Record<string, unknown>;
    }
    return { _json: data };
  },
};

export class ParseError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "ActionDispatch::Http::Parameters::ParseError";
  }
}

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

export class Parameters {
  declare setHeader: ParametersHost["setHeader"];
  declare deleteHeader: ParametersHost["deleteHeader"];

  /** @internal */
  private static _parameterParsers: ParameterParsers = DEFAULT_PARSERS;

  static get parameterParsers(): ParameterParsers {
    return Parameters._parameterParsers;
  }

  static set parameterParsers(
    parsers: Record<string | symbol, ParameterParser> | Map<unknown, ParameterParser>,
  ) {
    const normalized: ParameterParsers = {};
    const entries: Iterable<[unknown, ParameterParser]> =
      parsers instanceof Map
        ? parsers.entries()
        : (Reflect.ownKeys(parsers).map((k) => [k, parsers[k as never]]) as Array<
            [unknown, ParameterParser]
          >);
    for (const [key, value] of entries) {
      const sym =
        key !== null && typeof key === "object" && "symbol" in key
          ? String((key as { symbol: unknown }).symbol)
          : typeof key === "symbol"
            ? (key.description ?? String(key))
            : String(key);
      normalized[sym] = value;
    }
    Parameters._parameterParsers = normalized;
  }

  set pathParameters(parameters: Record<string, unknown>) {
    this.deleteHeader("action_dispatch.request.parameters");
    this.setHeader(PARAMETERS_KEY, parameters);
  }
}

export function parameters(this: ParametersHost): Record<string, unknown> {
  const cached = this.getHeader("action_dispatch.request.parameters");
  if (cached) return cached as Record<string, unknown>;

  const params: Record<string, unknown> = merge(this.requestParameters, this.queryParameters);
  mergeBang(params, pathParameters.call(this));
  this.setHeader("action_dispatch.request.parameters", params);
  return params;
}

export function pathParameters(this: ParametersHost): Record<string, unknown> {
  const cached = this.getHeader(PARAMETERS_KEY);
  if (cached) return cached as Record<string, unknown>;
  const empty: Record<string, unknown> = {};
  this.setHeader(PARAMETERS_KEY, empty);
  return empty;
}

/** @internal */
export function parseFormattedParameters(
  this: ParametersHost,
  parsers: ParameterParsers,
  fallback: () => Record<string, unknown>,
): Record<string, unknown> {
  if (this.contentLength === 0 || this.contentMimeType === null || !this.rawPost) {
    return fallback();
  }
  const symbol = this.contentMimeType.symbol ?? this.contentMimeType.toString();
  const strategy = parsers[symbol];
  if (!strategy) return fallback();

  try {
    return strategy(this.rawPost);
  } catch (e) {
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

/** @internal */
export function logParseErrorOnce(this: ParametersHost): void {
  if (this.getHeader(PARSE_ERROR_LOGGED_KEY)) return;
  this.setHeader(PARSE_ERROR_LOGGED_KEY, true);
  const msg = `Error occurred while parsing request parameters.\nContents:\n\n${this.rawPost}`;
  if (this.logger) {
    this.logger.debug(msg);
    return;
  }
  try {
    new Logger({ write: (s) => stderr.write(s) }).debug(msg);
  } catch {
    /** @empty */
  }
}

const PARSE_ERROR_LOGGED_KEY = "action_dispatch.request.parse_error_logged";

/** @internal */
export function paramsParsers(this: ParametersHost): ParameterParsers {
  return Parameters.parameterParsers;
}
