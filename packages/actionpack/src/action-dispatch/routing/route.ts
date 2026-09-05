import { Parser } from "../journey/parser.js";
import { Ast } from "../journey/ast.js";
import { Pattern } from "../journey/path/pattern.js";
import type { Format } from "../journey/visitors.js";
import { normalizePath as journeyNormalizePath } from "../journey/router/utils.js";
import { buildJourneyRouter, journeyRecognize } from "./journey-bridge.js";
import type { Router as JourneyRouter } from "../journey/router.js";
import { OptionRedirect, PathRedirect, Redirect } from "./redirection.js";
import { Request } from "../http/request.js";
import type { Endpoint } from "./endpoint.js";
import type { RackEnv, RackResponse } from "@blazetrails/rack";

const PATHFOR_SEPARATORS = "/.?";

export interface RouteConstraints {
  [key: string]: string | RegExp;
}

export type MountableApp =
  | ((env: RackEnv) => RackResponse | Promise<RackResponse>)
  | { call: (env: RackEnv) => RackResponse | Promise<RackResponse> };

export interface RouteOptions {
  name?: string;
  constraints?: RouteConstraints;
  defaults?: Record<string, string>;
  format?: boolean;
  as?: string;
  to?: string;
  controller?: string;
  action?: string;
  only?: ResourceAction | ResourceAction[];
  except?: ResourceAction | ResourceAction[];
  ip?: string | RegExp;
  redirect?: string | RedirectOptions | RedirectFunction;
  redirectEndpoint?: Redirect;
  pathNames?: { new?: string; edit?: string };
  anchor?: boolean;
  shallow?: boolean;
  internal?: boolean;
  on?: string;
  app?: MountableApp;
}

export type ResourceAction = "index" | "show" | "new" | "create" | "edit" | "update" | "destroy";

export type RedirectFunction = (params: Record<string, string>, request: Request) => string;

export interface RedirectOptions {
  path?: string;
  host?: string;
  subdomain?: string;
  domain?: string;
  status?: number;
}

export interface MatchedRoute {
  route: Route;
  params: Record<string, string>;
  matchedPrefix?: string;
  postMatch?: string;
}

export class Route {
  readonly verb: string;
  readonly path: string;
  readonly name: string | undefined;
  readonly controller: string;
  readonly action: string;
  readonly defaults: Record<string, string>;
  readonly constraints: RouteConstraints;
  readonly ip: string | RegExp;
  readonly redirectTarget: string | RedirectOptions | RedirectFunction | undefined;
  readonly anchor: boolean;
  /** @internal */
  readonly formatted: boolean;
  readonly internal: boolean;
  /** @internal */
  readonly to: MountableApp | undefined;
  /** @internal */
  private _app: Endpoint | undefined;

  private readonly paramNames: string[];
  /** @internal */
  private _journeyRouter: JourneyRouter | null = null;
  /** @internal */
  private _pathFormatter: Format | null = null;
  /** @internal */
  private _requiredParamNames: readonly string[] | null = null;
  /** @internal */
  private _pathTree: unknown = null;
  /** @internal */
  private _pathRequirements: Record<string, RegExp> | null = null;
  /** @internal */
  private _journeyRouterUnbuildable = false;

  constructor(
    verb: string,
    path: string,
    controller: string,
    action: string,
    options: RouteOptions = {},
  ) {
    this.verb = verb.toUpperCase();
    this.path = normalizePath(path);
    this.controller = controller;
    this.action = action;
    this.name = options.name ?? options.as;
    this.defaults = options.defaults ?? {};
    this.constraints = options.constraints ?? {};
    this.ip = options.ip ?? /(?:)/;
    if (options.redirect !== undefined && options.redirectEndpoint !== undefined) {
      throw new Error(
        "Route: pass either `redirect` (legacy target) or `redirectEndpoint` (preconstructed Redirect), not both",
      );
    }
    this.redirectTarget = options.redirect ?? deriveRedirectTarget(options.redirectEndpoint);
    if (options.redirectEndpoint) this._redirectEndpoint = options.redirectEndpoint;
    this.anchor = options.anchor !== false;
    this.formatted = options.format !== false;
    this.internal = options.internal === true;
    this.to = options.app;

    this.paramNames = collectParamNamesFromJourneyAst(this.path);
  }

  get app(): Endpoint | undefined {
    return this._app;
  }

  set app(app: Endpoint | undefined) {
    this._app = app;
  }

  get isRedirect(): boolean {
    return this.redirectTarget !== undefined;
  }

  get requirements(): Record<string, string | RegExp> {
    const reqs: Record<string, string | RegExp> = Object.create(null);
    Object.assign(reqs, this.defaults);
    Object.assign(reqs, this.pathConstraints as Record<string, string | RegExp>);
    if (this.controller) reqs.controller = this.controller;
    if (this.action) reqs.action = this.action;
    return reqs;
  }

  get redirectEndpoint(): Redirect | undefined {
    if (this._redirectEndpoint !== undefined) return this._redirectEndpoint ?? undefined;
    const target = this.redirectTarget;
    if (target === undefined) {
      this._redirectEndpoint = null;
      return undefined;
    }
    let endpoint: Redirect;
    if (typeof target === "function") {
      endpoint = new Redirect(301, target);
    } else if (typeof target === "string") {
      endpoint = new PathRedirect(301, target);
    } else {
      const status = target.status ?? 301;
      const { status: _s, ...opts } = target;
      endpoint = new OptionRedirect(status, opts);
    }
    this._redirectEndpoint = endpoint;
    return endpoint;
  }

  /** @internal */
  private _redirectEndpoint: Redirect | null | undefined = undefined;

  get pathParamNames(): readonly string[] {
    return this.paramNames.slice();
  }

  get requestConstraints(): Record<string, unknown> {
    const out: Record<string, unknown> = Object.create(null);
    const paths = new Set<string>(this.paramNames);
    for (const k of Object.keys(this.constraints)) {
      if (!paths.has(k)) out[k] = this.constraints[k];
    }
    return out;
  }

  get pathConstraints(): Record<string, unknown> {
    const out: Record<string, unknown> = Object.create(null);
    const paths = new Set<string>(this.paramNames);
    for (const k of Object.keys(this.constraints)) {
      if (paths.has(k)) out[k] = this.constraints[k];
    }
    return out;
  }

  score(knowledge: Record<string, boolean> = {}): number {
    let tree;
    try {
      tree = new Parser().parse(this.path);
    } catch {
      return 0;
    }
    let s = 0;
    const walk = (node: unknown, nested: boolean): void => {
      const n = node as {
        isLiteral?: () => boolean;
        isSymbol?: () => boolean;
        isGroup?: () => boolean;
        isStar?: () => boolean;
        isCat?: () => boolean;
        type?: string;
        toSym?: () => string;
        children?: () => unknown[];
        left?: unknown;
        right?: unknown;
      };
      if (n.isGroup?.() || n.isStar?.()) {
        walk(n.left, true);
        return;
      }
      if (n.isCat?.()) {
        walk(n.left, nested);
        walk(n.right, nested);
        return;
      }
      if (n.type === "OR") {
        let max = 0;
        for (const c of n.children?.() ?? []) {
          const before = s;
          walk(c, nested);
          const branch = s - before;
          if (branch > max) max = branch;
          s = before;
        }
        s += max;
        return;
      }
      if (n.isLiteral?.()) {
        if (!nested) s += 3;
        return;
      }
      if (n.isSymbol?.()) {
        const name = n.toSym!();
        const known = Object.hasOwn(knowledge, name) && knowledge[name];
        if (!nested) s += known ? 2 : 1;
        return;
      }
    };
    walk(tree, false);
    return s;
  }

  match(method: string, requestPath: string): MatchedRoute | null {
    const m = method.toUpperCase();
    if (this.verb !== "ALL" && this.verb !== m && !(m === "HEAD" && this.verb === "GET")) {
      return null;
    }
    if (this._journeyRouterUnbuildable) return null;
    if (this._journeyRouter === null) {
      try {
        this._journeyRouter = buildJourneyRouter([this], { skipRequestConstraints: true });
      } catch {
        this._journeyRouterUnbuildable = true;
        return null;
      }
    }
    const match = journeyRecognize(this._journeyRouter, method, requestPath);
    if (!match) return null;
    return { route: this, params: match.params };
  }

  pathFor(params: Record<string, string | number> = {}): string {
    if (this._pathFormatter === null) {
      const tree = new Parser().parse(this.path);
      this._pathTree = tree;
      const ast = new Ast(tree, true);
      const reqs: Record<string, RegExp> = Object.create(null);
      for (const [k, v] of Object.entries(this.pathConstraints)) {
        if (v instanceof RegExp) reqs[k] = v;
        else if (typeof v === "string") reqs[k] = new RegExp(v);
      }
      const pattern = new Pattern(ast, reqs, PATHFOR_SEPARATORS, this.anchor);
      this._pathFormatter = pattern.buildFormatter();
      this._requiredParamNames = topLevelSymbolNames(tree);
      const safeReqs: Record<string, RegExp> = Object.create(null);
      for (const name of Object.keys(reqs)) {
        const re = reqs[name];
        const safeFlags = re.flags.replace(/[gym]/g, "");
        safeReqs[name] = new RegExp(`^(?:${re.source})$`, safeFlags);
      }
      this._pathRequirements = safeReqs;
    }
    for (const name of this._requiredParamNames!) {
      if (!Object.hasOwn(params, name) || params[name] == null) {
        throw new Error(
          `Missing required parameter :${name} for route "${this.name ?? this.path}"`,
        );
      }
    }
    const emitted = computeEmittedSymbols(this._pathTree, params);
    for (const [name, re] of Object.entries(this._pathRequirements!)) {
      if (!Object.hasOwn(params, name)) continue;
      if (!emitted.has(name)) continue;
      const v = params[name];
      if (v != null && !re.test(String(v))) {
        throw new Error(
          `Missing required parameter :${name} for route "${this.name ?? this.path}"`,
        );
      }
    }
    const hash: Record<string, unknown> = Object.create(null);
    for (const [k, v] of Object.entries(params)) {
      if (v != null) hash[k] = String(v);
    }
    let out = this._pathFormatter.evaluate(hash);
    if (!emittedSlashInPathPreservingCapture(params, this.path, out)) {
      out = out.replace(/\/{2,}/g, "/");
    }
    return out;
  }

  resolveRedirect(
    params: Record<string, string>,
    request: { method: string; path: string; host?: string },
  ): { url: string; status: number } {
    const target = this.redirectTarget;
    if (!target) throw new Error("Route is not a redirect");

    if (typeof target === "function") {
      const syntheticReq = new Request({
        REQUEST_METHOD: request.method,
        PATH_INFO: request.path,
        SERVER_NAME: request.host ?? "www.example.com",
        SERVER_PORT: "80",
        "rack.url_scheme": "http",
      });
      return { url: target(params, syntheticReq), status: 301 };
    }

    if (typeof target === "string") {
      const url = interpolateRedirect(target, params);
      return { url, status: 301 };
    }

    const status = target.status ?? 301;
    const path = target.path ? interpolateRedirect(target.path, params) : request.path;
    let host = target.host ?? request.host ?? "www.example.com";
    if (target.subdomain) {
      const hostParts = host.split(".");
      if (hostParts.length >= 2) {
        hostParts[0] = target.subdomain;
        host = hostParts.join(".");
      } else {
        host = target.subdomain + "." + host;
      }
    }
    if (target.domain) {
      host = "www." + target.domain;
    }
    const url = `http://${host}${path}`;
    return { url, status };
  }
}

/** @internal */
function deriveRedirectTarget(
  endpoint: Redirect | undefined,
): string | RedirectOptions | RedirectFunction | undefined {
  if (!endpoint) return undefined;
  if (endpoint instanceof PathRedirect) return endpoint.template;
  if (endpoint instanceof OptionRedirect) {
    return { ...endpoint.options, status: endpoint.status } as RedirectOptions;
  }
  return endpoint.block;
}

function emittedSlashInPathPreservingCapture(
  params: Record<string, string | number>,
  path: string,
  out: string,
): boolean {
  const splatNames = new Set<string>();
  for (const m of path.matchAll(/\*(\w+)/g)) {
    splatNames.add(m[1]);
  }
  const declaresController = /(?<!\\):controller\b/.test(path);
  for (const [k, v] of Object.entries(params)) {
    if (typeof v !== "string" || !v.includes("/")) continue;
    const isPathPreserving = splatNames.has(k) || (declaresController && k === "controller");
    if (!isPathPreserving) continue;
    const slashPrefix = v.split(/[^a-zA-Z0-9\-._~!$&'()*+,;=:@/]/, 1)[0];
    if (slashPrefix.includes("/") && out.includes(slashPrefix)) return true;
  }
  return false;
}

function computeEmittedSymbols(
  tree: unknown,
  params: Record<string, string | number>,
): Set<string> {
  const out = new Set<string>();
  const isSupplied = (name: string): boolean => Object.hasOwn(params, name) && params[name] != null;

  type N = {
    isSymbol?: () => boolean;
    isGroup?: () => boolean;
    isStar?: () => boolean;
    isCat?: () => boolean;
    type?: string;
    toSym?: () => string;
    children?: () => unknown[];
    left?: unknown;
    right?: unknown;
  };

  const directSymbols = (node: unknown): string[] => {
    const names: string[] = [];
    const walk = (nd: unknown): void => {
      const n = nd as N;
      if (n.isGroup?.()) return;
      if (n.isStar?.()) {
        walk(n.left);
        return;
      }
      if (n.isCat?.()) {
        walk(n.left);
        walk(n.right);
        return;
      }
      if (n.type === "OR") {
        for (const c of n.children?.() ?? []) walk(c);
        return;
      }
      if (n.isSymbol?.()) names.push(n.toSym!());
    };
    walk(node);
    return names;
  };

  const walk = (node: unknown, parentFires: boolean): void => {
    const n = node as N;
    if (n.isGroup?.()) {
      const direct = directSymbols(n.left);
      const fires = parentFires && direct.every(isSupplied);
      walk(n.left, fires);
      return;
    }
    if (n.isStar?.()) {
      walk(n.left, parentFires);
      return;
    }
    if (n.isCat?.()) {
      walk(n.left, parentFires);
      walk(n.right, parentFires);
      return;
    }
    if (n.type === "OR") {
      for (const c of n.children?.() ?? []) walk(c, parentFires);
      return;
    }
    if (n.isSymbol?.() && parentFires) {
      const name = n.toSym!();
      if (isSupplied(name)) out.add(name);
    }
  };
  walk(tree, true);
  return out;
}

function topLevelSymbolNames(tree: unknown): readonly string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (node: unknown, nested: boolean): void => {
    const n = node as {
      isSymbol?: () => boolean;
      isGroup?: () => boolean;
      isStar?: () => boolean;
      isCat?: () => boolean;
      type?: string;
      toSym?: () => string;
      children?: () => unknown[];
      left?: unknown;
      right?: unknown;
    };
    if (n.isGroup?.()) {
      walk(n.left, true);
      return;
    }
    if (n.isStar?.()) {
      walk(n.left, nested);
      return;
    }
    if (n.isCat?.()) {
      walk(n.left, nested);
      walk(n.right, nested);
      return;
    }
    if (n.type === "OR") {
      for (const c of n.children?.() ?? []) walk(c, nested);
      return;
    }
    if (!nested && n.isSymbol?.()) {
      const name = n.toSym!();
      if (!seen.has(name)) {
        seen.add(name);
        out.push(name);
      }
    }
  };
  walk(tree, false);
  return out;
}

function collectParamNamesFromJourneyAst(path: string): string[] {
  try {
    const tree = new Parser().parse(path);
    const ast = new Ast(tree, true);
    return ast.names.slice();
  } catch {
    return [];
  }
}

function normalizePath(p: string): string {
  return journeyNormalizePath(p);
}

function interpolateRedirect(template: string, params: Record<string, string>): string {
  return template.replace(/%\{(\w+)\}/g, (_, key) => params[key] ?? "");
}
