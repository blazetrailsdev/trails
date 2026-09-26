import { dasherize, isBlank, isPresent } from "@blazetrails/activesupport";
import {
  block,
  deleteIf,
  dup,
  fetch,
  isSymbol,
  merge,
  rbEqq,
  rbFSend,
  symbolToS,
} from "@blazetrails/ruby-compat";
import type { Pattern } from "./path/pattern.js";
import type { Node } from "./nodes/node.js";
import type { Format } from "./visitors.js";

export interface VerbRequest {
  requestMethod: string;
  isDelete(): boolean;
  isGet(): boolean;
  isHead(): boolean;
  isOptions(): boolean;
  isLink(): boolean;
  isPatch(): boolean;
  isPost(): boolean;
  isPut(): boolean;
  isTrace(): boolean;
  isUnlink(): boolean;
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

export class Unknown implements VerbMatcher {
  constructor(readonly verb: string) {}
  call(request: VerbRequest): boolean {
    return this.verb === request.requestMethod;
  }
}

export const VerbMatchers = {
  VERBS,
  DELETE: class {
    static get verb(): string {
      return this.name.split("::").at(-1)!;
    }
    static call(req: VerbRequest): boolean {
      return req.isDelete();
    }
  },
  GET: class {
    static get verb(): string {
      return this.name.split("::").at(-1)!;
    }
    static call(req: VerbRequest): boolean {
      return req.isGet();
    }
  },
  HEAD: class {
    static get verb(): string {
      return this.name.split("::").at(-1)!;
    }
    static call(req: VerbRequest): boolean {
      return req.isHead();
    }
  },
  OPTIONS: class {
    static get verb(): string {
      return this.name.split("::").at(-1)!;
    }
    static call(req: VerbRequest): boolean {
      return req.isOptions();
    }
  },
  LINK: class {
    static get verb(): string {
      return this.name.split("::").at(-1)!;
    }
    static call(req: VerbRequest): boolean {
      return req.isLink();
    }
  },
  PATCH: class {
    static get verb(): string {
      return this.name.split("::").at(-1)!;
    }
    static call(req: VerbRequest): boolean {
      return req.isPatch();
    }
  },
  POST: class {
    static get verb(): string {
      return this.name.split("::").at(-1)!;
    }
    static call(req: VerbRequest): boolean {
      return req.isPost();
    }
  },
  PUT: class {
    static get verb(): string {
      return this.name.split("::").at(-1)!;
    }
    static call(req: VerbRequest): boolean {
      return req.isPut();
    }
  },
  TRACE: class {
    static get verb(): string {
      return this.name.split("::").at(-1)!;
    }
    static call(req: VerbRequest): boolean {
      return req.isTrace();
    }
  },
  UNLINK: class {
    static get verb(): string {
      return this.name.split("::").at(-1)!;
    }
    static call(req: VerbRequest): boolean {
      return req.isUnlink();
    }
  },
  Unknown,
  All: class {
    static call(_: VerbRequest): boolean {
      return true;
    }
    static get verb(): string {
      return "";
    }
  },
  VERB_TO_CLASS: {} as Record<string, VerbMatcher>,
};
VerbMatchers.VERB_TO_CLASS = VERBS.reduce<Record<string, VerbMatcher>>(
  (hash, verb) => {
    const klass = VerbMatchers[verb];
    hash[verb] = klass;
    hash[verb.toLowerCase()] = klass;
    hash[`:${verb.toLowerCase()}`] = klass;
    return hash;
  },
  { ":all": VerbMatchers.All },
);

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

  /** @missingRailsArgs fetch — PERMANENT */
  static verbMatcher(verb: string): VerbMatcher {
    return fetch<VerbMatcher>(
      VerbMatchers.VERB_TO_CLASS as unknown as Record<string, unknown>,
      verb,
      block<VerbMatcher>(
        () =>
          new VerbMatchers.Unknown(
            dasherize(isSymbol(verb) ? symbolToS(verb) : verb).toUpperCase(),
          ),
      ),
    );
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
    this._requestMethodMatch = opts.requestMethodMatch ?? [VerbMatchers.All];
    this._requiredDefaults = opts.requiredDefaults ?? [];
    this._pathFormatter = this.path.buildFormatter();
    this.ast = this.path.ast!.root;
    this.path.ast!.route = this;
  }

  get conditions(): Record<string, unknown> {
    return this.constraints;
  }

  eagerLoadBang(): void {
    this.path.eagerLoadBang();
    void this.parts;
    void this.requiredDefaults;
  }

  /** @missingRailsArgs delete_if — PERMANENT */
  get requirements(): Record<string, unknown> {
    return deleteIf(
      merge(this.defaults, this.path.requirements),
      (_, v) => v instanceof RegExp && v.source === ".+?" && v.flags.includes("s"),
    );
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

  /** @missingRailsArgs delete_if — PERMANENT */
  get requiredDefaults(): Record<string, unknown> {
    if (this._requiredDefaultsCache) return this._requiredDefaultsCache;
    this._requiredDefaultsCache = deleteIf(
      dup(this.defaults),
      (k) => this.parts.includes(k) || !this.isRequiredDefault(k),
    );
    return this._requiredDefaultsCache;
  }

  isGlob(): boolean {
    return this.path.ast!.isGlob();
  }

  isDispatcher(): boolean {
    return Boolean((this.app as Dispatchable | undefined)?.dispatcher?.());
  }

  matches(request: VerbRequest): boolean {
    if (!this.matchVerb(request)) return false;
    for (const [method, value] of Object.entries(this.constraints)) {
      if (value instanceof RegExp || typeof value === "string") {
        if (!rbEqq(value, String(rbFSend(request, method) ?? ""))) return false;
      } else if (Array.isArray(value)) {
        if (!value.includes(rbFSend(request, method))) return false;
      } else if (value === true) {
        if (!isPresent(rbFSend(request, method))) return false;
      } else if (value === false) {
        if (!isBlank(rbFSend(request, method))) return false;
      } else {
        if (!rbEqq(value, rbFSend(request, method))) return false;
      }
    }
    return true;
  }

  get ip(): string | RegExp {
    const v = this.constraints["ip"];
    if (v instanceof RegExp || typeof v === "string") return v;
    return /(?:)/;
  }

  isRequiresMatchingVerb(): boolean {
    return !this._requestMethodMatch.every((m) => m === VerbMatchers.All);
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
