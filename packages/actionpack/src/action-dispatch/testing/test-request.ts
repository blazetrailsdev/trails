import type { RackEnv } from "@blazetrails/rack";
import { Request } from "../http/request.js";

/** @internal */
const DEFAULT_ENV: RackEnv = {
  HTTP_HOST: "test.host",
  REMOTE_ADDR: "0.0.0.0",
  HTTP_USER_AGENT: "Rails Testing",
};

export class TestRequest extends Request {
  constructor(env: RackEnv = {}) {
    super({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      HTTP_HOST: "test.host",
      SERVER_NAME: "test.host",
      SERVER_PORT: "80",
      ...env,
    });
  }

  /** @internal */
  static defaultEnv(): RackEnv {
    return { ...DEFAULT_ENV };
  }

  static create(env: RackEnv = {}): TestRequest {
    const merged: RackEnv = { ...TestRequest.defaultEnv(), ...env };
    merged["rack.request.cookie_hash"] ??= {};
    return new TestRequest(merged);
  }

  get requestMethod(): string {
    return ((this.env["REQUEST_METHOD"] as string) || "GET").toUpperCase();
  }

  set requestMethod(method: string) {
    this.setHeader("REQUEST_METHOD", method.toUpperCase());
  }

  get host(): string {
    return super.host;
  }

  set host(host: string) {
    this.setHeader("HTTP_HOST", host);
  }

  get port(): number {
    const httpHost = this.env["HTTP_HOST"] as string | undefined;
    if (httpHost) {
      const match = httpHost.match(/:(\d+)$/);
      if (match) return parseInt(match[1], 10);
    }
    return parseInt((this.env["SERVER_PORT"] as string) || "80", 10);
  }

  set port(number: string | number) {
    this.setHeader("SERVER_PORT", String(number));
  }

  set requestUri(uri: string) {
    this.setHeader("REQUEST_URI", uri);
  }

  get remoteAddr(): string {
    return (this.env["REMOTE_ADDR"] as string) || "";
  }

  set remoteAddr(addr: string) {
    this.setHeader("REMOTE_ADDR", addr);
  }

  get userAgent(): string {
    return (this.env["HTTP_USER_AGENT"] as string) || "";
  }

  set userAgent(ua: string) {
    this.setHeader("HTTP_USER_AGENT", ua);
  }

  set action(actionName: string) {
    this.pathParameters = { ...this.pathParameters, action: String(actionName) };
  }
}
