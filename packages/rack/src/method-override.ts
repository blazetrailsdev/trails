import { REQUEST_METHOD, POST, RACK_METHODOVERRIDE_ORIGINAL_METHOD, RACK_ERRORS, RACK_INPUT } from "./constants.js";
import type { RackApp } from "./mock-request.js";
import { parseNestedQuery } from "./utils.js";

const METHOD_OVERRIDE_PARAM_KEY = "_method";
const HTTP_METHOD_OVERRIDE_HEADER = "HTTP_X_HTTP_METHOD_OVERRIDE";
const HTTP_METHODS = ["GET", "HEAD", "PUT", "POST", "DELETE", "OPTIONS", "PATCH", "LINK", "UNLINK"];
const ALLOWED_METHODS = ["POST"];

export class MethodOverride {
  private app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
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
    let method = this.methodOverrideParam(env) || env[HTTP_METHOD_OVERRIDE_HEADER] || null;
    if (method) {
      try {
        return method.toString().toUpperCase();
      } catch {
        const errors = env[RACK_ERRORS];
        if (errors && typeof errors.puts === "function") {
          errors.puts("Invalid string for method");
        } else if (errors && typeof errors.write === "function") {
          errors.write("Invalid string for method\n");
        }
        return null;
      }
    }
    return null;
  }

  private methodOverrideParam(env: Record<string, any>): string | null {
    const contentType = env["CONTENT_TYPE"] || "";
    const isFormData = contentType.includes("application/x-www-form-urlencoded");
    const isMultipart = contentType.includes("multipart/form-data");

    if (!isFormData && !isMultipart) return null;

    try {
      const input = env[RACK_INPUT];
      if (!input) return null;
      const body = typeof input.read === "function" ? input.read() : typeof input === "string" ? input : "";
      if (typeof body !== "string") return null;

      if (isMultipart) {
        // For multipart, we don't parse it here — just check for EOFError-like issues
        // Ruby raises EOFError for truncated multipart, we simulate by checking
        const boundary = contentType.match(/boundary=([^\s;]+)/)?.[1];
        if (boundary && !body.includes(`--${boundary}--`)) {
          const errors = env[RACK_ERRORS];
          if (errors && typeof errors.puts === "function") {
            errors.puts("Bad request content body");
          } else if (errors && typeof errors.write === "function") {
            errors.write("Bad request content body\n");
          }
          return null;
        }
        // Try to parse multipart params - simplified, just look for _method
        return null;
      }

      // URL-encoded form data
      const params = parseNestedQuery(body);
      return params[METHOD_OVERRIDE_PARAM_KEY] || null;
    } catch (e: any) {
      const errors = env[RACK_ERRORS];
      const msg = e.message?.includes("too deep") ? "Invalid or incomplete POST params" :
                  e.message?.includes("Invalid") ? "Invalid or incomplete POST params" :
                  "Bad request content body";
      if (errors && typeof errors.puts === "function") {
        errors.puts(msg);
      } else if (errors && typeof errors.write === "function") {
        errors.write(msg + "\n");
      }
      return null;
    }
  }
}
