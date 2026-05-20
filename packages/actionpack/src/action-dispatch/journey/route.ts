import type { Pattern } from "./path/pattern.js";
import type { Node } from "./nodes/node.js";
import type { Format } from "./visitors.js";

// =========================================================================
// VerbMatchers — one class per HTTP method, with `verb` and `call(req)`.
// =========================================================================

export interface VerbRequest {
  /** Uppercase method name (`GET`, `POST`, …). */
  requestMethod: string;
}

export interface VerbMatcher {
  readonly verb: string;
  call(req: VerbRequest): boolean;
}

const VERBS = [
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "LINK",
  "PATCH",
  "POST",
  "PUT",
  "TRACE",
  "UNLINK",
] as const;
type Verb = (typeof VERBS)[number];

function makeStaticMatcher(verb: Verb): VerbMatcher {
  return {
    verb,
    call(req: VerbRequest): boolean {
      return req.requestMethod === verb;
    },
  };
}

class UnknownVerbMatcher implements VerbMatcher {
  constructor(readonly verb: string) {}
  call(req: VerbRequest): boolean {
    return this.verb === req.requestMethod;
  }
}

const AllVerbMatcher: VerbMatcher = {
  verb: "",
  call: () => true,
};

const VERB_MATCHERS = new Map<string, VerbMatcher>();
for (const v of VERBS) {
  const m = makeStaticMatcher(v);
  VERB_MATCHERS.set(v, m);
  VERB_MATCHERS.set(v.toLowerCase(), m);
}
VERB_MATCHERS.set("all", AllVerbMatcher);

export const VerbMatchers = {
  ALL: AllVerbMatcher,
  for(verb: string | symbol): VerbMatcher {
    const key = typeof verb === "symbol" ? (verb.description ?? "") : verb;
    const found = VERB_MATCHERS.get(key);
    if (found) return found;
    return new UnknownVerbMatcher(String(verb).replace(/_/g, "-").toUpperCase());
  },
};

// =========================================================================
// Route
// =========================================================================

export interface RouteOptions {
  name: string;
  app?: unknown;
  path: Pattern;
  constraints?: Record<string, unknown>;
  requiredDefaults?: readonly string[];
  defaults?: Record<string, unknown>;
  requestMethodMatch?: readonly VerbMatcher[];
  precedence?: number;
  scopeOptions?: Record<string, unknown>;
  internal?: boolean;
  sourceLocation?: string | null;
}

export interface Dispatchable {
  dispatcher?(): boolean;
}

export class Route {
  readonly name: string;
  readonly app: unknown;
  readonly path: Pattern;
  readonly constraints: Record<string, unknown>;
  readonly defaults: Record<string, unknown>;
  readonly precedence: number;
  readonly scopeOptions: Record<string, unknown>;
  readonly internal: boolean;
  readonly sourceLocation: string | null;
  readonly ast: Node;

  /** @internal */
  private readonly _requestMethodMatch: readonly VerbMatcher[];
  /** @internal */
  private readonly _requiredDefaults: readonly string[];
  /** @internal */
  private readonly _pathFormatter: Format;
  /** @internal */
  private _parts: readonly string[] | null = null;
  /** @internal */
  private _requiredParts: readonly string[] | null = null;
  /** @internal */
  private _requiredDefaultsCache: Record<string, unknown> | null = null;

  /** Rails `Route.verb_matcher(verb)` — `:all` / "GET" / etc. */
  static verbMatcher(verb: string | symbol): VerbMatcher {
    return VerbMatchers.for(verb);
  }

  constructor(opts: RouteOptions) {
    this.name = opts.name;
    this.app = opts.app;
    this.path = opts.path;
    this.constraints = opts.constraints ?? {};
    this.defaults = opts.defaults ?? {};
    this.precedence = opts.precedence ?? 0;
    this.scopeOptions = opts.scopeOptions ?? {};
    this.internal = opts.internal ?? false;
    this.sourceLocation = opts.sourceLocation ?? null;
    this._requestMethodMatch = opts.requestMethodMatch ?? [AllVerbMatcher];
    this._requiredDefaults = opts.requiredDefaults ?? [];
    this._pathFormatter = this.path.buildFormatter();
    this.ast = this.path.spec;
    this.path.ast!.route = this;
  }

  /** Rails alias :conditions :constraints */
  get conditions(): Record<string, unknown> {
    return this.constraints;
  }

  eagerLoadBang(): void {
    this.path.eagerLoadBang();
    void this.parts;
    void this.requiredDefaults;
  }

  /**
   * Defaults minus path-known requirements that match the default star regex.
   * Mirrors Rails: `defaults.merge(path.requirements).delete_if { |_,v| /.+?/m == v }`.
   */
  get requirements(): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...this.defaults, ...this.path.requirements };
    for (const [k, v] of Object.entries(merged)) {
      if (v instanceof RegExp && v.source === ".+?" && v.flags.includes("s")) {
        delete merged[k];
      }
    }
    return merged;
  }

  get segments(): readonly string[] {
    return this.path.names;
  }

  get requiredKeys(): readonly string[] {
    return [...this.requiredParts, ...Object.keys(this.requiredDefaults)];
  }

  score(suppliedKeys: ReadonlySet<string> | Record<string, unknown>): number {
    const has = (k: string): boolean =>
      suppliedKeys instanceof Set ? suppliedKeys.has(k) : Object.hasOwn(suppliedKeys, k);
    for (const k of this.path.requiredNames) if (!has(k)) return -1;
    let nameMatches = 0;
    for (const k of this.path.names) if (has(k)) nameMatches++;
    return Object.keys(this.requiredDefaults).length * 2 + nameMatches;
  }

  /** Rails alias :segment_keys :parts */
  get parts(): readonly string[] {
    if (!this._parts) this._parts = [...this.segments];
    return this._parts;
  }
  get segmentKeys(): readonly string[] {
    return this.parts;
  }

  format(pathOptions: Record<string, unknown>): string {
    return this._pathFormatter.evaluate(pathOptions);
  }

  get requiredParts(): readonly string[] {
    if (!this._requiredParts) this._requiredParts = [...this.path.requiredNames];
    return this._requiredParts;
  }

  isRequiredDefault(key: string): boolean {
    return this._requiredDefaults.includes(key);
  }

  get requiredDefaults(): Record<string, unknown> {
    if (this._requiredDefaultsCache) return this._requiredDefaultsCache;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this.defaults)) {
      if (this.parts.includes(k)) continue;
      if (!this.isRequiredDefault(k)) continue;
      out[k] = v;
    }
    this._requiredDefaultsCache = out;
    return out;
  }

  isGlob(): boolean {
    return this.path.ast!.isGlob();
  }

  isDispatcher(): boolean {
    return Boolean((this.app as Dispatchable | undefined)?.dispatcher?.());
  }

  matches(request: VerbRequest & Record<string, unknown>): boolean {
    if (!this.matchVerb(request)) return false;
    for (const [method, value] of Object.entries(this.constraints)) {
      const actual = request[method];
      if (value instanceof RegExp) {
        if (!value.test(String(actual ?? ""))) return false;
      } else if (typeof value === "string") {
        if (value !== String(actual ?? "")) return false;
      } else if (Array.isArray(value)) {
        if (!value.includes(actual)) return false;
      } else if (value === true) {
        if (actual == null || actual === "" || actual === false) return false;
      } else if (value === false) {
        if (actual != null && actual !== "" && actual !== false) return false;
      } else {
        if (value !== actual) return false;
      }
    }
    return true;
  }

  /**
   * Rails: `constraints[:ip] || //`. Returns whatever was supplied in
   * constraints (typically a String for an exact match or a RegExp);
   * default is `//` (empty regex — matches anything).
   */
  get ip(): string | RegExp {
    const v = this.constraints["ip"];
    if (v instanceof RegExp || typeof v === "string") return v;
    return /(?:)/;
  }

  isRequiresMatchingVerb(): boolean {
    return !this._requestMethodMatch.every((m) => m === AllVerbMatcher);
  }

  get verb(): string {
    return this.verbs().join("|");
  }

  /** @internal */
  private verbs(): string[] {
    return this._requestMethodMatch.map((m) => m.verb);
  }

  /** @internal */
  private matchVerb(request: VerbRequest): boolean {
    return this._requestMethodMatch.some((m) => m.call(request));
  }
}
