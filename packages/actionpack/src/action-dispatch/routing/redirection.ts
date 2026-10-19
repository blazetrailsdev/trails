import { extractOptionsBang, Notifications } from "@blazetrails/activesupport";
import { Request } from "../http/request.js";
import { Response } from "../http/response.js";
import { URL as UrlHelpers, type UrlOptions } from "../http/url.js";
import { Utils } from "../journey/router/utils.js";
import { Endpoint } from "./endpoint.js";
import { Utils as RackUtils, type RackEnv } from "@blazetrails/rack";
import {
  ArgumentError,
  hashDelete,
  isEmpty,
  rbFSend,
  rbObjIsProc,
  rbObjRespondTo,
  URI,
} from "@blazetrails/ruby-compat";

export { Endpoint } from "./endpoint.js";

export type RedirectBlock = (params: Record<string, string>, request: Request) => string;

function transformValues(
  params: Record<string, string>,
  fn: (v: string) => string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) out[k] = fn(String(v));
  return out;
}

function interpolate(template: string, params: Record<string, string>): string {
  return template.replace(/%\{(\w+)\}/g, (_m, key: string) => {
    if (!(key in params)) {
      throw new Error(`key{${key}} not found in interpolation params`);
    }
    return params[key];
  });
}

function scriptName(req: Request): string {
  return (req.env["SCRIPT_NAME"] as string) ?? "";
}

export class Redirect<B = unknown> extends Endpoint {
  readonly status: number;
  readonly block: B;

  constructor(status: number, block: B) {
    super();
    this.status = status;
    this.block = block;
  }

  override redirect(): boolean {
    return true;
  }

  call(env: RackEnv): [number, Record<string, string>, unknown] {
    return Notifications.instrument("redirect.action_dispatch", undefined, (payload) => {
      const request = new Request(env);
      const response = this.buildResponse(request);
      payload.status = this.status;
      payload.location = response.headers.get("Location");
      payload.request = request;
      return response.toA();
    });
  }

  buildResponse(req: Request): Response {
    const uri = URI.parse(this.path(req.pathParameters as Record<string, string>, req));

    if (!uri.host) {
      if (this.relativePath(uri.path)) {
        uri.path = `${scriptName(req)}/${uri.path}`;
      } else if (isEmpty(uri.path!)) {
        uri.path = scriptName(req) === "" ? "/" : scriptName(req);
      }
    }

    uri.scheme ??= req.scheme;
    uri.host ??= req.host;
    if (!req.isStandardPort) uri.port ??= req.port;

    req.commitFlash();

    const body = "";
    const headers = {
      Location: uri.toString(),
      "Content-Type": `text/html; charset=${Response.defaultCharset}`,
      "Content-Length": String(body.length),
    };
    return new Response(this.status, headers, [body]);
  }

  path(params: Record<string, string>, request: Request): string {
    return rbFSend(this.block, "call", params, request) as string;
  }

  inspect(): string {
    return `redirect(${this.status})`;
  }

  /** @internal */
  protected relativePath(path: string | null): boolean {
    return path != null && !isEmpty(path) && !path.startsWith("/");
  }

  /** @internal */
  protected escape(params: Record<string, string>): Record<string, string> {
    return transformValues(params, RackUtils.escape);
  }

  /** @internal */
  protected escapeFragment(params: Record<string, string>): Record<string, string> {
    return transformValues(params, (v) => Utils.escapeFragment(v));
  }

  /** @internal */
  protected escapePath(params: Record<string, string>): Record<string, string> {
    return transformValues(params, (v) => Utils.escapePath(v));
  }
}

const URL_PARTS = /^([^?]+)?(\?[^#]+)?(#.+)?$/;

export class PathRedirect extends Redirect<string> {
  override path(params: Record<string, string>, _request: Request): string {
    const tpl = this.block;
    const m = URL_PARTS.exec(tpl);
    if (m) {
      const [, p, q, f] = m;
      const path = this.interpolationRequired(p, params)
        ? interpolate(p, this.escapePath(params))
        : (p ?? "");
      const query = this.interpolationRequired(q, params)
        ? interpolate(q, this.escape(params))
        : (q ?? "");
      const fragment = this.interpolationRequired(f, params)
        ? interpolate(f, this.escapeFragment(params))
        : (f ?? "");
      return `${path}${query}${fragment}`;
    }
    return this.interpolationRequired(tpl, params) ? interpolate(tpl, this.escape(params)) : tpl;
  }

  override inspect(): string {
    return `redirect(${this.status}, ${this.block})`;
  }

  /** @internal */
  private interpolationRequired(
    string: string | undefined,
    params: Record<string, string>,
  ): boolean {
    return Object.keys(params).length > 0 && !!string && /%\{\w*\}/.test(string);
  }
}

export interface OptionRedirectOptions {
  protocol?: string;
  host?: string;
  domain?: string;
  port?: string | number;
  path?: string;
  params?: Record<string, unknown>;
  subdomain?: string;
  [key: string]: unknown;
}

export class OptionRedirect extends Redirect {
  readonly options: OptionRedirectOptions;

  constructor(status: number, options: OptionRedirectOptions) {
    super(status, () => "");
    this.options = options;
  }

  override path(params: Record<string, string>, request: Request): string {
    const urlOptions: Record<string, unknown> = {
      protocol: request.protocol,
      host: request.host,
      port: request.isStandardPort ? undefined : request.port,
      path: request.path,
      params: request.queryParameters,
      ...this.options,
    };

    const path = urlOptions["path"];
    if (Object.keys(params).length > 0 && typeof path === "string" && /%\{\w*\}/.test(path)) {
      urlOptions["path"] = interpolate(path, this.escapePath(params));
    }

    if (!this.options.host && !this.options.domain) {
      const p = urlOptions["path"];
      if (typeof p === "string" && this.relativePath(p)) {
        urlOptions["path"] = `/${p}`;
        urlOptions["scriptName"] = scriptName(request);
      } else if (typeof p === "string" && p === "") {
        urlOptions["path"] = scriptName(request) === "" ? "/" : "";
        urlOptions["scriptName"] = scriptName(request);
      }
    }

    return UrlHelpers.urlFor(urlOptions as UrlOptions);
  }

  override inspect(): string {
    const pairs = Object.entries(this.options)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    return `redirect(${this.status}, ${pairs})`;
  }
}

export interface RedirectCallable {
  call(params: Record<string, string>, request: Request): string;
}

export function redirect(
  ...args: Array<
    string | (OptionRedirectOptions & { status?: number }) | RedirectBlock | RedirectCallable
  >
): Redirect<unknown> {
  const last = args[args.length - 1];
  let block: RedirectBlock | RedirectCallable | undefined = rbObjIsProc(last)
    ? (args.pop() as RedirectBlock)
    : undefined;
  const options = extractOptionsBang(args) as OptionRedirectOptions & { status?: number };
  const deleted = hashDelete(options, "status") as number | false | null;
  const status = deleted != null && deleted !== false ? deleted : 301;
  const path = args.shift();

  if (Object.keys(options).length > 0) {
    return new OptionRedirect(status, options);
  }
  if (typeof path === "string") {
    return new PathRedirect(status, path);
  }

  if (rbObjRespondTo(path, "call")) block = path as RedirectBlock | RedirectCallable;
  if (!block) throw new ArgumentError("redirection argument not supported");
  return new Redirect(status, block);
}

export const Redirection = { redirect };
