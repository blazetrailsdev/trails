import { Logger } from "@blazetrails/activesupport";
import { Exception, StandardError, stderr } from "@blazetrails/ruby-compat";

import { merge } from "@blazetrails/ruby-compat";
import { ParameterTypeError, InvalidParameterError } from "@blazetrails/rack";
import { Mime, MimeType } from "./mime-type.js";
import type { ParamHash } from "../request/utils.js";
import { ActionDispatch } from "../../namespaces.js";
import { BadRequest } from "../../action-controller/metal/exceptions.js";

export const PARAMETERS_KEY = "action_dispatch.request.path_parameters";

export type ParameterParser = (rawPost: string) => Record<string, unknown>;

export type ParameterParsers = Record<string, ParameterParser>;

export const DEFAULT_PARSERS: ParameterParsers = {
  [Mime.get(":json")!.symbol!]: (rawPost: string) => {
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
  controllerClassFor(name: string): unknown;
  getHeader(key: string): unknown;
  setHeader(key: string, value: unknown): unknown;
  deleteHeader(key: string): void;
  queryParameters: Record<string, unknown>;
  requestParameters: Record<string, unknown>;
  contentLength: number;
  contentMimeType: MimeType | null;
  rawPost: string;
  logger?: { debug(message: string): void } | null;
}

export class Parameters {
  declare controllerClassFor: ParametersHost["controllerClassFor"];
  declare protected setHeader: ParametersHost["setHeader"];
  declare protected deleteHeader: ParametersHost["deleteHeader"];

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
    try {
      this.deleteHeader("action_dispatch.request.parameters");

      parameters = ActionDispatch.Request.Utils.setBinaryEncoding(
        this,
        parameters as ParamHash,
        parameters["controller"] as string | undefined,
        parameters["action"] as string | undefined,
      );
      ActionDispatch.Request.Utils.checkParamEncoding(parameters as ParamHash);

      this.setHeader(PARAMETERS_KEY, parameters);
    } catch (e) {
      if (e instanceof ParameterTypeError || e instanceof InvalidParameterError) {
        throw new BadRequest(`Invalid path parameters: ${e.message}`);
      }
      throw e;
    }
  }
}

export function parameters(this: ParametersHost): Record<string, unknown> {
  const cached = this.getHeader("action_dispatch.request.parameters");
  if (cached) return cached as Record<string, unknown>;

  const params: Record<string, unknown> = merge(this.requestParameters, this.queryParameters);
  Object.assign(params, pathParameters.call(this));
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
  const strategy = parsers[this.contentMimeType.symbol!];
  if (!strategy) return fallback();

  try {
    return strategy(this.rawPost);
  } catch (e) {
    if (e instanceof Exception && !(e instanceof StandardError)) throw e;
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
