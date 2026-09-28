import { MockRequest, type RackEnv } from "@blazetrails/rack";
import { Request } from "../http/request.js";
import { b, merge } from "@blazetrails/ruby-compat";

/** @internal */
const DEFAULT_ENV: RackEnv = MockRequest.envFor("/", {
  HTTP_HOST: b("test.host"),
  REMOTE_ADDR: b("0.0.0.0"),
  HTTP_USER_AGENT: b("Rails Testing"),
});

export class TestRequest extends Request {
  /** @internal */
  static defaultEnv(): RackEnv {
    return { ...DEFAULT_ENV };
  }

  static create(env: RackEnv = {}): TestRequest {
    env["rack.request.cookie_hash"] ??= {};
    return new TestRequest(merge<unknown>(TestRequest.defaultEnv(), env));
  }

  get requestMethod(): string {
    return super.requestMethod;
  }

  set requestMethod(method: string) {
    super.requestMethod = String(method).toUpperCase();
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

  set action(actionName: string) {
    this.pathParameters = { ...this.pathParameters, action: String(actionName) };
  }

  setIfModifiedSince(lastModified: string): void {
    this.setHeader("HTTP_IF_MODIFIED_SINCE", lastModified);
  }

  setIfNoneMatch(etag: string): void {
    this.setHeader("HTTP_IF_NONE_MATCH", etag);
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
}
