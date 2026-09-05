export { RELEASE, release } from "./version.js";
export { RELEASE as VERSION } from "./version.js";

export type RackEnv = Record<string, unknown>;

export type RackBody = AsyncIterable<string | Uint8Array>;

export type RackResponse = [number, Record<string, string | string[]>, RackBody];

export type RackApp = (env: RackEnv) => Promise<RackResponse>;

export interface RackMiddleware {
  call(env: RackEnv): Promise<RackResponse>;
}

export async function* bodyFromString(str: string): RackBody {
  yield str;
}

export async function bodyToString(body: RackBody): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of body) {
    chunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
  }
  return chunks.join("");
}

export {
  parseNestedQuery,
  buildNestedQuery,
  HTTP_STATUS_CODES,
  statusCode,
  InvalidParameterError,
  ParameterTypeError,
  ParamsTooDeepError,
  QueryLimitError,
  QueryParser,
  Params,
  getDefaultQueryParser,
  setDefaultQueryParser,
  getParamDepthLimit,
  setParamDepthLimit,
  getMultipartFileLimit,
  setMultipartFileLimit,
  getMultipartTotalPartLimit,
  setMultipartTotalPartLimit,
  setCookieHeader,
  deleteSetCookieHeaderBang,
  unescape,
  escape,
  escapePath,
} from "./utils.js";
export { Headers } from "./headers.js";
export { BodyProxy } from "./body-proxy.js";
export { Request, Helpers as RequestHelpers } from "./request.js";
export { Response, ResponseRaw } from "./response.js";
export {
  CONTENT_TYPE,
  CONTENT_LENGTH,
  RACK_ERRORS,
  RACK_SESSION,
  RACK_SESSION_OPTIONS,
} from "./constants.js";
export { Files } from "./files.js";
export { Lint, LintError } from "./lint.js";
export { Multipart } from "./multipart.js";
export { MockRequest, FatalWarning } from "./mock-request.js";
export { MockResponse } from "./mock-response.js";
export * as Mime from "./mime.js";
export * as Utils from "./utils.js";
export * as Handler from "./handler/index.js";
