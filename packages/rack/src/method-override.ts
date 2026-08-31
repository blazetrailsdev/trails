import { REQUEST_METHOD, RACK_METHODOVERRIDE_ORIGINAL_METHOD, RACK_ERRORS } from "./constants.js";
import type { RackApp } from "./mock-request.js";
import { Request } from "./request.js";

/** `rack.errors` is a Ruby IO in Rails; trails sees `puts` or `write` sinks. */
function putsError(errors: any, message: string): void {
  if (errors && typeof errors.puts === "function") {
    errors.puts(message);
  } else if (errors && typeof errors.write === "function") {
    errors.write(message + "\n");
  }
}

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
        putsError(env[RACK_ERRORS], "Invalid string for method");
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
    } catch (e: any) {
      const message =
        e instanceof RangeError || /too deep|Invalid/.test(String(e?.message))
          ? "Invalid or incomplete POST params"
          : "Bad request content body";
      putsError(req.getHeader(RACK_ERRORS), message);
      return null;
    }
  }
}
