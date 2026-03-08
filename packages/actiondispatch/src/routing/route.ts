/**
 * A single route entry, mirroring ActionDispatch::Journey::Route.
 */

export interface RouteConstraints {
  [key: string]: string | RegExp;
}

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
  pathNames?: { new?: string; edit?: string };
  anchor?: boolean;
  shallow?: boolean;
}

export type ResourceAction = "index" | "show" | "new" | "create" | "edit" | "update" | "destroy";

export type RedirectFunction = (params: Record<string, string>, request: { method: string; path: string }) => string;

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

  private readonly segments: PathSegment[];
  private readonly paramNames: string[];

  constructor(
    verb: string,
    path: string,
    controller: string,
    action: string,
    options: RouteOptions = {}
  ) {
    this.verb = verb.toUpperCase();
    this.path = normalizePath(path);
    this.controller = controller;
    this.action = action;
    this.name = options.name ?? options.as;
    this.defaults = options.defaults ?? {};
    this.constraints = options.constraints ?? {};
    this.ip = options.ip ?? /(?:)/;
    this.redirectTarget = options.redirect;
    this.anchor = options.anchor !== false;

    this.segments = parseSegments(this.path);
    this.paramNames = this.segments
      .filter((s): s is DynamicSegment | GlobSegment => s.type === "dynamic" || s.type === "glob")
      .map((s) => s.name);
  }

  get isRedirect(): boolean {
    return this.redirectTarget !== undefined;
  }

  /**
   * Compute a specificity score for this route. Higher = more specific.
   */
  score(knowledge: Record<string, boolean> = {}): number {
    let s = 0;
    for (const seg of this.segments) {
      if (seg.type === "static") s += 3;
      else if (seg.type === "dynamic") s += knowledge[seg.name] ? 2 : 1;
      else if (seg.type === "glob") s += 0;
      else if (seg.type === "optional") s += 0;
    }
    return s;
  }

  match(method: string, requestPath: string): MatchedRoute | null {
    if (this.verb !== "ALL" && this.verb !== method.toUpperCase()) {
      return null;
    }

    const reqSegments = normalizePath(requestPath)
      .split("/")
      .filter(Boolean);

    const params: Record<string, string> = {};
    const result = matchSegments(this.segments, reqSegments, 0, 0, params, this.constraints, this.anchor);
    if (!result) return null;

    return { route: this, params };
  }

  /**
   * Generate a path from this route by substituting params.
   */
  pathFor(params: Record<string, string | number> = {}): string {
    const parts: string[] = [];
    for (const seg of this.segments) {
      if (seg.type === "static") {
        parts.push(seg.value);
      } else if (seg.type === "dynamic") {
        const val = params[seg.name];
        if (val === undefined) {
          throw new Error(
            `Missing required parameter :${seg.name} for route "${this.name ?? this.path}"`
          );
        }
        parts.push(String(val));
      } else if (seg.type === "glob") {
        const val = params[seg.name];
        if (val !== undefined) {
          parts.push(String(val));
        }
      } else if (seg.type === "optional") {
        // Include optional group only if all dynamic params are provided
        const optParts: string[] = [];
        let allPresent = true;
        for (const child of seg.children) {
          if (child.type === "static") {
            optParts.push(child.value);
          } else if (child.type === "dynamic") {
            const val = params[child.name];
            if (val === undefined || val === null) {
              allPresent = false;
              break;
            }
            optParts.push(String(val));
          }
        }
        if (allPresent && optParts.length > 0) {
          parts.push(...optParts);
        }
      }
    }
    const result = "/" + parts.join("/");
    return result === "/" ? "/" : result;
  }

  /**
   * Resolve a redirect target given matched params and request info.
   */
  resolveRedirect(params: Record<string, string>, request: { method: string; path: string; host?: string }): { url: string; status: number } {
    const target = this.redirectTarget;
    if (!target) throw new Error("Route is not a redirect");

    if (typeof target === "function") {
      return { url: target(params, request), status: 301 };
    }

    if (typeof target === "string") {
      const url = interpolateRedirect(target, params);
      return { url, status: 301 };
    }

    // RedirectOptions
    const status = target.status ?? 301;
    let path = target.path ? interpolateRedirect(target.path, params) : request.path;
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

// --- Path segment types ---

interface StaticSegment { type: "static"; value: string }
interface DynamicSegment { type: "dynamic"; name: string }
interface GlobSegment { type: "glob"; name: string }
interface OptionalGroup { type: "optional"; children: (StaticSegment | DynamicSegment)[] }

type PathSegment = StaticSegment | DynamicSegment | GlobSegment | OptionalGroup;

function parseSegments(path: string): PathSegment[] {
  const segments: PathSegment[] = [];
  const raw = path.replace(/^\/+/, "");
  if (!raw) return segments;

  // Handle optional groups: (/:locale) or (.:format)
  let i = 0;
  const parts: string[] = [];
  let current = "";

  // First split by / but handle parenthesized groups
  while (i < raw.length) {
    if (raw[i] === "(") {
      // Find matching close paren
      if (current) {
        parts.push(current);
        current = "";
      }
      let depth = 1;
      let group = "(";
      i++;
      while (i < raw.length && depth > 0) {
        if (raw[i] === "(") depth++;
        if (raw[i] === ")") depth--;
        group += raw[i];
        i++;
      }
      parts.push(group);
    } else if (raw[i] === "/") {
      if (current) {
        parts.push(current);
        current = "";
      }
      i++;
    } else {
      current += raw[i];
      i++;
    }
  }
  if (current) parts.push(current);

  for (const part of parts) {
    if (part.startsWith("(") && part.endsWith(")")) {
      // Optional group
      const inner = part.slice(1, -1).replace(/^\/+/, "").replace(/^\./, "");
      const children: (StaticSegment | DynamicSegment)[] = [];
      for (const sub of inner.split("/").filter(Boolean)) {
        if (sub.startsWith(":")) {
          children.push({ type: "dynamic", name: sub.slice(1) });
        } else if (sub.startsWith("*")) {
          // glob in optional — treat as dynamic
          children.push({ type: "dynamic", name: sub.slice(1) });
        } else {
          children.push({ type: "static", value: sub });
        }
      }
      if (children.length > 0) {
        segments.push({ type: "optional", children });
      }
    } else if (part.startsWith("*")) {
      segments.push({ type: "glob", name: part.slice(1) });
    } else if (part.startsWith(":")) {
      segments.push({ type: "dynamic", name: part.slice(1) });
    } else {
      segments.push({ type: "static", value: part });
    }
  }

  return segments;
}

function matchSegments(
  segments: PathSegment[],
  reqSegments: string[],
  segIdx: number,
  reqIdx: number,
  params: Record<string, string>,
  constraints: RouteConstraints,
  anchor: boolean,
): boolean {
  // Base case: consumed all route segments
  if (segIdx >= segments.length) {
    if (!anchor) return true; // unanchored: ok if extra segments remain
    return reqIdx >= reqSegments.length;
  }

  const seg = segments[segIdx];

  if (seg.type === "static") {
    if (reqIdx >= reqSegments.length) return false;
    if (reqSegments[reqIdx] !== seg.value) return false;
    return matchSegments(segments, reqSegments, segIdx + 1, reqIdx + 1, params, constraints, anchor);
  }

  if (seg.type === "dynamic") {
    if (reqIdx >= reqSegments.length) return false;
    const val = reqSegments[reqIdx];
    const constraint = constraints[seg.name];
    if (constraint) {
      const re = constraint instanceof RegExp
        ? anchorRegExp(constraint)
        : new RegExp(`^${constraint}$`);
      if (!re.test(val)) return false;
    }
    params[seg.name] = val;
    return matchSegments(segments, reqSegments, segIdx + 1, reqIdx + 1, params, constraints, anchor);
  }

  if (seg.type === "glob") {
    // Glob matches zero or more remaining segments (greedy)
    // Try matching the rest of the route segments first
    for (let take = reqSegments.length - reqIdx; take >= 0; take--) {
      const saved = { ...params };
      const globValue = reqSegments.slice(reqIdx, reqIdx + take).join("/");
      params[seg.name] = globValue;
      if (matchSegments(segments, reqSegments, segIdx + 1, reqIdx + take, params, constraints, anchor)) {
        return true;
      }
      // Restore params
      Object.keys(params).forEach((k) => {
        if (!(k in saved)) delete params[k];
        else params[k] = saved[k];
      });
    }
    return false;
  }

  if (seg.type === "optional") {
    // Try matching with the optional group
    const savedParams = { ...params };
    let childReqIdx = reqIdx;
    let matched = true;
    for (const child of seg.children) {
      if (child.type === "static") {
        if (childReqIdx >= reqSegments.length || reqSegments[childReqIdx] !== child.value) {
          matched = false;
          break;
        }
        childReqIdx++;
      } else if (child.type === "dynamic") {
        if (childReqIdx >= reqSegments.length) {
          matched = false;
          break;
        }
        const val = reqSegments[childReqIdx];
        const constraint = constraints[child.name];
        if (constraint) {
          const re = constraint instanceof RegExp
            ? anchorRegExp(constraint)
            : new RegExp(`^${constraint}$`);
          if (!re.test(val)) {
            matched = false;
            break;
          }
        }
        params[child.name] = val;
        childReqIdx++;
      }
    }

    if (matched) {
      if (matchSegments(segments, reqSegments, segIdx + 1, childReqIdx, params, constraints, anchor)) {
        return true;
      }
    }

    // Try without the optional group
    Object.keys(params).forEach((k) => {
      if (!(k in savedParams)) delete params[k];
      else params[k] = savedParams[k];
    });
    return matchSegments(segments, reqSegments, segIdx + 1, reqIdx, params, constraints, anchor);
  }

  return false;
}

function anchorRegExp(re: RegExp): RegExp {
  let source = re.source;
  if (!source.startsWith("^")) source = "^" + source;
  if (!source.endsWith("$")) source = source + "$";
  return new RegExp(source, re.flags);
}

function normalizePath(p: string): string {
  return "/" + p.replace(/^\/+|\/+$/g, "");
}

function interpolateRedirect(template: string, params: Record<string, string>): string {
  return template.replace(/%\{(\w+)\}/g, (_, key) => params[key] ?? "");
}
