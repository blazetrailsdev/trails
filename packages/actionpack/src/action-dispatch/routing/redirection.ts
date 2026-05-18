/**
 * Port of ActionDispatch::Routing::Redirection
 * (Rails actionpack/lib/action_dispatch/routing/redirection.rb)
 *
 * Provides Redirect, PathRedirect, OptionRedirect endpoint classes and a
 * redirect() factory for building redirect endpoints in route definitions.
 */

import { Request } from "../http/request.js";
import { Response } from "../http/response.js";
import { URL as UrlHelpers, type UrlOptions } from "../http/url.js";
import {
  escapeFragment as journeyEscapeFragment,
  escapePath as journeyEscapePath,
} from "../journey/router/utils.js";
import { Endpoint } from "./endpoint.js";
import type { RackEnv } from "@blazetrails/rack";

export { Endpoint } from "./endpoint.js";

export type RedirectBlock = (params: Record<string, string>, request: Request) => string;

/** Parsed pieces of a URI, mirroring Ruby's URI::Generic. */
interface ParsedUri {
  scheme: string | null;
  host: string | null;
  port: number | null;
  path: string;
  query: string | null;
  fragment: string | null;
}

const URI_RE =
  /^(?:([a-zA-Z][a-zA-Z0-9+.-]*):)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/;

function parseUri(raw: string): ParsedUri {
  const m = URI_RE.exec(raw);
  if (!m) {
    return { scheme: null, host: null, port: null, path: raw, query: null, fragment: null };
  }
  const [, scheme, authority, path, query, fragment] = m;
  let host: string | null = null;
  let port: number | null = null;
  if (authority !== undefined) {
    const at = authority.lastIndexOf("@");
    const hostport = at >= 0 ? authority.slice(at + 1) : authority;
    const colon = hostport.lastIndexOf(":");
    if (colon >= 0 && /^\d+$/.test(hostport.slice(colon + 1))) {
      host = hostport.slice(0, colon) || null;
      port = Number(hostport.slice(colon + 1));
    } else {
      host = hostport || null;
    }
  }
  return {
    scheme: scheme ?? null,
    host,
    port,
    path: path ?? "",
    query: query ?? null,
    fragment: fragment ?? null,
  };
}

function uriToString(uri: ParsedUri): string {
  let out = "";
  if (uri.scheme) out += `${uri.scheme}://`;
  if (uri.host !== null) {
    out += uri.host;
    if (uri.port !== null) out += `:${uri.port}`;
  }
  out += uri.path;
  if (uri.query !== null) out += `?${uri.query}`;
  if (uri.fragment !== null) out += `#${uri.fragment}`;
  return out;
}

/** Rack::Utils.escape — form-encoded value (space → +). */
function rackEscape(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

function transformValues(
  params: Record<string, string>,
  fn: (v: string) => string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) out[k] = fn(String(v));
  return out;
}

/** Ruby's `String % Hash` for `%{key}` interpolation. */
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

export class Redirect extends Endpoint {
  readonly status: number;
  readonly block: RedirectBlock;

  constructor(status: number, block: RedirectBlock) {
    super();
    this.status = status;
    this.block = block;
  }

  override redirect(): boolean {
    return true;
  }

  call(env: RackEnv): [number, Record<string, string>, string[]] {
    const request = new Request(env);
    const response = this.buildResponse(request);
    return response.toRack();
  }

  buildResponse(req: Request): Response {
    const uri = parseUri(this.path(req.pathParameters as Record<string, string>, req));

    if (!uri.host) {
      if (this.relativePath(uri.path)) {
        uri.path = `${scriptName(req)}/${uri.path}`;
      } else if (uri.path === "") {
        uri.path = scriptName(req) === "" ? "/" : scriptName(req);
      }
    }

    uri.scheme ??= req.scheme;
    uri.host ??= req.host;
    if (uri.port === null && !req.isStandardPort) uri.port = req.port;

    const body = "";
    const headers = {
      Location: uriToString(uri),
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": String(body.length),
    };
    return new Response(this.status, headers, [body]);
  }

  path(params: Record<string, string>, request: Request): string {
    return this.block(params, request);
  }

  inspect(): string {
    return `redirect(${this.status})`;
  }

  /** @internal */
  protected relativePath(path: string): boolean {
    return !!path && path !== "" && !path.startsWith("/");
  }

  /** @internal */
  protected escape(params: Record<string, string>): Record<string, string> {
    return transformValues(params, rackEscape);
  }

  /** @internal */
  protected escapeFragment(params: Record<string, string>): Record<string, string> {
    return transformValues(params, journeyEscapeFragment);
  }

  /** @internal */
  protected escapePath(params: Record<string, string>): Record<string, string> {
    return transformValues(params, journeyEscapePath);
  }
}

const URL_PARTS = /^([^?]+)?(\?[^#]+)?(#.+)?$/;

export class PathRedirect extends Redirect {
  constructor(status: number, pathTemplate: string) {
    super(status, () => pathTemplate);
  }

  get template(): string {
    return (this.block as () => string)();
  }

  override path(params: Record<string, string>, _request: Request): string {
    const tpl = this.template;
    const m = URL_PARTS.exec(tpl);
    if (m) {
      const [, p, q, f] = m;
      const path = this.interpolationRequired(p, params)
        ? interpolate(p!, this.escapePath(params))
        : (p ?? "");
      const query = this.interpolationRequired(q, params)
        ? interpolate(q!, this.escape(params))
        : (q ?? "");
      const fragment = this.interpolationRequired(f, params)
        ? interpolate(f!, this.escapeFragment(params))
        : (f ?? "");
      return `${path}${query}${fragment}`;
    }
    return this.interpolationRequired(tpl, params) ? interpolate(tpl, this.escape(params)) : tpl;
  }

  override inspect(): string {
    return `redirect(${this.status}, ${this.template})`;
  }

  /** @internal */
  private interpolationRequired(s: string | undefined, params: Record<string, string>): boolean {
    return Object.keys(params).length > 0 && !!s && /%\{\w*\}/.test(s);
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

/**
 * Build a Redirect endpoint. Mirrors the `redirect(*args, &block)` factory on
 * the ActionDispatch::Routing::Redirection module.
 */
export function redirect(
  ...args: Array<
    string | (OptionRedirectOptions & { status?: number }) | RedirectBlock | RedirectCallable
  >
): Redirect {
  let options: (OptionRedirectOptions & { status?: number }) | undefined;
  const last = args[args.length - 1];
  if (last && typeof last === "object" && !("call" in last) && typeof last !== "function") {
    options = args.pop() as OptionRedirectOptions & { status?: number };
  }
  const status = (options?.status as number | undefined) ?? 301;
  if (options) delete options.status;
  const path = args.shift();

  if (options && Object.keys(options).length > 0) {
    return new OptionRedirect(status, options);
  }
  if (typeof path === "string") {
    return new PathRedirect(status, path);
  }
  let block: RedirectBlock | undefined;
  if (typeof path === "function") {
    block = path as RedirectBlock;
  } else if (path && typeof (path as RedirectCallable).call === "function") {
    const callable = path as RedirectCallable;
    block = (params, request) => callable.call(params, request);
  }
  if (!block) throw new Error("redirection argument not supported");
  return new Redirect(status, block);
}
