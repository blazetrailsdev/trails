import type { RackEnv } from "@blazetrails/rack";
import { Request } from "../http/request.js";
import { merge } from "@blazetrails/ruby-compat";

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
    env["rack.request.cookie_hash"] ??= {};
    return new TestRequest(merge<unknown>(TestRequest.defaultEnv(), env));
  }

  get host(): string {
    return super.host;
  }

  set host(host: string) {
    this.setHeader("HTTP_HOST", host);
  }

  get port(): number {
    return super.port;
  }

  set port(number: string | number) {
    this.setHeader("SERVER_PORT", String(number));
  }

  set requestUri(uri: string) {
    this.setHeader("REQUEST_URI", uri);
  }

  get path(): string {
    return super.path;
  }

  set path(path: string) {
    this.setHeader("PATH_INFO", path);
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

  get accept(): string | undefined {
    return super.accept;
  }

  set accept(mimeTypes: unknown) {
    this.deleteHeader("action_dispatch.request.accepts");
    this.setHeader(
      "HTTP_ACCEPT",
      (Array.isArray(mimeTypes) ? mimeTypes : mimeTypes == null ? [] : [mimeTypes])
        .map(String)
        .join(","),
    );
  }

  set action(actionName: string) {
    this.pathParameters = { ...this.pathParameters, action: String(actionName) };
  }
}
