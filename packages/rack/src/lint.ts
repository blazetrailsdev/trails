import type { RackApp } from "./mock-request.js";
import {
  REQUEST_METHOD, SERVER_NAME, SERVER_PORT, SERVER_PROTOCOL,
  QUERY_STRING, PATH_INFO, SCRIPT_NAME, RACK_URL_SCHEME,
  RACK_INPUT, RACK_ERRORS, RACK_HIJACK, RACK_IS_HIJACK,
  RACK_EARLY_HINTS, RACK_RESPONSE_FINISHED, RACK_PROTOCOL,
  CONTENT_TYPE, CONTENT_LENGTH, TRANSFER_ENCODING,
  STATUS_WITH_NO_ENTITY_BODY,
  GET, HEAD, OPTIONS, CONNECT,
} from "./constants.js";

export class LintError extends Error {
  constructor(message: string) { super(message); this.name = "LintError"; }
}

export class Lint {
  private app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, any>, any]> {
    if (typeof env !== "object" || env === null || Array.isArray(env)) {
      throw new LintError("env is not an object");
    }

    this.checkEnv(env);

    const result = await this.app(env);

    if (!Array.isArray(result) || result.length !== 3) {
      throw new LintError("response is not a 3-element array");
    }

    const [status, headers, body] = result;
    this.checkStatus(status);
    this.checkHeaders(headers);
    this.checkContentType(status, headers);
    this.checkContentLength(status, headers);

    if (env[REQUEST_METHOD] === HEAD) {
      // Body should be empty for HEAD
    }

    if (env[RACK_EARLY_HINTS]) {
      if (typeof env[RACK_EARLY_HINTS] !== "function") {
        throw new LintError("rack.early_hints must be a callable");
      }
    }

    if (headers[RACK_PROTOCOL]) {
      if (!Array.isArray(headers[RACK_PROTOCOL])) {
        throw new LintError("rack.protocol must be an Array");
      }
      for (const p of headers[RACK_PROTOCOL]) {
        if (typeof p !== "string") {
          throw new LintError("rack.protocol values must be Strings");
        }
      }
      if (!env[RACK_PROTOCOL]) {
        throw new LintError("rack.protocol in response but not in request");
      }
    }

    if (env[RACK_RESPONSE_FINISHED]) {
      if (!Array.isArray(env[RACK_RESPONSE_FINISHED])) {
        throw new LintError("rack.response_finished must be an Array");
      }
      for (const cb of env[RACK_RESPONSE_FINISHED]) {
        if (typeof cb !== "function") {
          throw new LintError("rack.response_finished values must be callable");
        }
      }
    }

    return [status, headers, this.wrapBody(body)];
  }

  private checkEnv(env: Record<string, any>): void {
    const required = [REQUEST_METHOD, SERVER_NAME, SERVER_PORT, SERVER_PROTOCOL, RACK_INPUT, RACK_ERRORS, QUERY_STRING, RACK_URL_SCHEME];
    for (const key of required) {
      if (!(key in env)) {
        throw new LintError(`env missing required key ${key}`);
      }
    }

    if (typeof env[REQUEST_METHOD] !== "string") {
      throw new LintError("REQUEST_METHOD must be a string");
    }

    if (typeof env[SCRIPT_NAME] === "string" && env[SCRIPT_NAME] !== "") {
      if (!env[SCRIPT_NAME].startsWith("/")) {
        throw new LintError("SCRIPT_NAME must start with /");
      }
    }

    const pathInfo = env[PATH_INFO];
    if (pathInfo !== undefined && pathInfo !== null) {
      if (typeof pathInfo !== "string") {
        throw new LintError("PATH_INFO must be a string");
      }
      const method = env[REQUEST_METHOD];
      if (method === OPTIONS && pathInfo === "*") {
        // asterisk form OK
      } else if (method === CONNECT) {
        // authority form: host:port
        if (!pathInfo.includes(":")) {
          throw new LintError("CONNECT request PATH_INFO must be authority form (host:port)");
        }
      } else if (pathInfo.startsWith("http://") || pathInfo.startsWith("https://")) {
        // absolute form OK
      } else {
        // origin form must start with / or be empty
        if (pathInfo !== "" && !pathInfo.startsWith("/")) {
          throw new LintError("PATH_INFO must start with / (origin form)");
        }
      }
    }

    if (typeof env[SERVER_NAME] !== "string" || env[SERVER_NAME] === "") {
      throw new LintError("SERVER_NAME must be a non-empty string");
    }
    if (typeof env[SERVER_PORT] !== "string" || env[SERVER_PORT] === "") {
      throw new LintError("SERVER_PORT must be a non-empty string");
    }

    if (typeof env[QUERY_STRING] !== "string") {
      throw new LintError("QUERY_STRING must be a string");
    }

    if (env[RACK_URL_SCHEME] !== "http" && env[RACK_URL_SCHEME] !== "https") {
      throw new LintError("rack.url_scheme must be 'http' or 'https'");
    }

    // Validate rack.input
    const input = env[RACK_INPUT];
    if (input !== null && input !== undefined) {
      if (typeof input.read !== "function") {
        throw new LintError("rack.input must respond to read");
      }
    }

    // Validate rack.errors
    const errors = env[RACK_ERRORS];
    if (typeof errors.puts !== "function" && typeof errors.write !== "function") {
      throw new LintError("rack.errors must respond to puts or write");
    }

    // Validate rack.hijack
    if (env[RACK_IS_HIJACK]) {
      if (!env[RACK_HIJACK] || typeof env[RACK_HIJACK] !== "function") {
        throw new LintError("rack.hijack must be callable when rack.hijack? is true");
      }
    }

    // Header keys must be strings
    for (const key of Object.keys(env)) {
      if (typeof key !== "string") {
        throw new LintError("env keys must be strings");
      }
    }
  }

  private checkStatus(status: number): void {
    if (typeof status !== "number" || !Number.isInteger(status) || status < 100) {
      throw new LintError(`Invalid status: ${status}`);
    }
  }

  private checkHeaders(headers: Record<string, any>): void {
    if (typeof headers !== "object" || headers === null || Array.isArray(headers)) {
      throw new LintError("headers is not an object");
    }
    for (const [key, value] of Object.entries(headers)) {
      if (typeof key !== "string") {
        throw new LintError("header key must be a string");
      }
      if (key !== key.toLowerCase()) {
        throw new LintError(`header key must be lowercase: ${key}`);
      }
      if (key === "status") {
        throw new LintError("header must not contain 'status'");
      }
      if (typeof value !== "string" && !Array.isArray(value)) {
        throw new LintError(`header value must be a string: ${key}`);
      }
    }
  }

  private checkContentType(status: number, headers: Record<string, any>): void {
    if (STATUS_WITH_NO_ENTITY_BODY[status] || status === 205) {
      if (headers[CONTENT_TYPE]) {
        throw new LintError(`Content-Type header found in ${status} response`);
      }
    }
  }

  private checkContentLength(status: number, headers: Record<string, any>): void {
    if (headers[CONTENT_LENGTH]) {
      const cl = parseInt(headers[CONTENT_LENGTH]);
      if (isNaN(cl) || cl < 0) {
        throw new LintError("Invalid Content-Length");
      }
    }
    if (STATUS_WITH_NO_ENTITY_BODY[status] && headers[CONTENT_LENGTH]) {
      throw new LintError(`Content-Length header found in ${status} response`);
    }
  }

  private wrapBody(body: any): any {
    return body;
  }
}
