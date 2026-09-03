import { REQUEST_METHOD, RACK_METHODOVERRIDE_ORIGINAL_METHOD, RACK_ERRORS } from "./constants.js";
import type { RackApp } from "./mock-request.js";
import { Request } from "./request.js";
import { InvalidParameterError, ParameterTypeError, ParamsTooDeepError } from "./query-parser.js";
import { EmptyContentError } from "./multipart/parser.js";

const METHOD_OVERRIDE_PARAM_KEY = "_method";
const HTTP_METHOD_OVERRIDE_HEADER = "HTTP_X_HTTP_METHOD_OVERRIDE";
const HTTP_METHODS = ["GET", "HEAD", "PUT", "POST", "DELETE", "OPTIONS", "PATCH", "LINK", "UNLINK"];
const ALLOWED_METHODS = ["POST"];

export class MethodOverride {
  private app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
  }

  /** @internal */
  allowedMethods(): string[] {
    return ALLOWED_METHODS;
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, string>, any]> {
    if (ALLOWED_METHODS.includes(env[REQUEST_METHOD])) {
      const method = this.methodOverride(env);
      if (method && HTTP_METHODS.includes(method)) {
        env[RACK_METHODOVERRIDE_ORIGINAL_METHOD] = env[REQUEST_METHOD];
        env[REQUEST_METHOD] = method;
      }
    }
    return this.app(env);
  }

  private methodOverride(env: Record<string, any>): string | null {
    const req = new Request(env);
    const method = this.methodOverrideParam(req) || env[HTTP_METHOD_OVERRIDE_HEADER] || null;
    if (method) {
      try {
        return method.toString().toUpperCase();
      } catch {
        env[RACK_ERRORS].puts("Invalid string for method");
        return null;
      }
    }
    return null;
  }

  private methodOverrideParam(req: Request): string | null {
    try {
      if (req.formData || req.isParseableData()) {
        return req.POST[METHOD_OVERRIDE_PARAM_KEY] ?? null;
      }
      return null;
    } catch (e) {
      if (
        e instanceof InvalidParameterError ||
        e instanceof ParameterTypeError ||
        e instanceof ParamsTooDeepError
      ) {
        req.getHeader(RACK_ERRORS).puts("Invalid or incomplete POST params");
        return null;
      }
      if (e instanceof EmptyContentError) {
        req.getHeader(RACK_ERRORS).puts("Bad request content body");
        return null;
      }
      throw e;
    }
  }
}
