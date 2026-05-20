/**
 * ActionDispatch::ContentSecurityPolicy
 *
 * DSL for building Content-Security-Policy headers.
 */

/**
 * Symbol-source shorthands. Mirrors Rails' `MAPPINGS` constant
 * (actionpack/lib/action_dispatch/http/content_security_policy.rb:128-147).
 *
 * Ruby's `policy.script_src :self, :https` becomes
 * `policy.scriptSrc(":self", ":https")` in trails — a leading `:` marks the
 * string as a symbol shorthand and resolves through this table. Strings
 * without the `:` prefix pass through unchanged so literal sources like
 * `"script"` (for `require-sri-for`) keep their plain-string meaning.
 */
export const MAPPINGS = {
  self: "'self'",
  unsafe_eval: "'unsafe-eval'",
  wasm_unsafe_eval: "'wasm-unsafe-eval'",
  unsafe_hashes: "'unsafe-hashes'",
  unsafe_inline: "'unsafe-inline'",
  none: "'none'",
  http: "http:",
  https: "https:",
  data: "data:",
  mediastream: "mediastream:",
  allow_duplicates: "'allow-duplicates'",
  blob: "blob:",
  filesystem: "filesystem:",
  report_sample: "'report-sample'",
  script: "'script'",
  strict_dynamic: "'strict-dynamic'",
  ws: "ws:",
  wss: "wss:",
} as const;

export type CspSymbol = `:${keyof typeof MAPPINGS}`;

export type CSPSource = CspSymbol | (string & {}) | ((request?: unknown) => string | string[]);

/**
 * What a directive setter accepts in its rest list. Rails treats only
 * `nil`/`false` as falsy (content_security_policy.rb:189-197), so callers
 * may pass `null`/`false` as the first arg to clear a directive without
 * an unsafe cast.
 */
export type CSPSourceOrClear = CSPSource | null | false;

/**
 * Rails' default nonce-eligible directives. Mirrors
 * `DEFAULT_NONCE_DIRECTIVES = %w[script-src style-src]`
 * (actionpack/lib/action_dispatch/http/content_security_policy.rb:174).
 */
export const DEFAULT_NONCE_DIRECTIVES = ["script-src", "style-src"] as const;

type DirectiveName = string;

/**
 * Raised when a CSP directive source contains a semicolon or whitespace.
 * Mirrors Rails' `ContentSecurityPolicy::InvalidDirectiveError`.
 */
export class InvalidDirectiveError extends Error {}

/**
 * Shape of a stored directive. Rails uses `true` as a sentinel for bare
 * directives that emit just the directive name (e.g. `upgrade-insecure-requests`)
 * with no source list. Arrays are emitted as `name source1 source2 ...`.
 */
export type DirectiveValue = CSPSource[] | true;

export class ContentSecurityPolicy {
  private directives: Map<DirectiveName, DirectiveValue> = new Map();

  constructor(init?: (policy: ContentSecurityPolicy) => void) {
    if (init) init(this);
  }

  // --- Directive setters ---

  defaultSrc(...sources: CSPSourceOrClear[]): this {
    return this.setDirective("default-src", sources);
  }
  scriptSrc(...sources: CSPSourceOrClear[]): this {
    return this.setDirective("script-src", sources);
  }
  scriptSrcAttr(...sources: CSPSourceOrClear[]): this {
    return this.setDirective("script-src-attr", sources);
  }
  scriptSrcElem(...sources: CSPSourceOrClear[]): this {
    return this.setDirective("script-src-elem", sources);
  }
  styleSrc(...sources: CSPSourceOrClear[]): this {
    return this.setDirective("style-src", sources);
  }
  styleSrcAttr(...sources: CSPSourceOrClear[]): this {
    return this.setDirective("style-src-attr", sources);
  }
  styleSrcElem(...sources: CSPSourceOrClear[]): this {
    return this.setDirective("style-src-elem", sources);
  }
  imgSrc(...sources: CSPSourceOrClear[]): this {
    return this.setDirective("img-src", sources);
  }
  fontSrc(...sources: CSPSourceOrClear[]): this {
    return this.setDirective("font-src", sources);
  }
  connectSrc(...sources: CSPSourceOrClear[]): this {
    return this.setDirective("connect-src", sources);
  }
  mediaSrc(...sources: CSPSourceOrClear[]): this {
    return this.setDirective("media-src", sources);
  }
  objectSrc(...sources: CSPSourceOrClear[]): this {
    return this.setDirective("object-src", sources);
  }
  frameSrc(...sources: CSPSourceOrClear[]): this {
    return this.setDirective("frame-src", sources);
  }
  childSrc(...sources: CSPSourceOrClear[]): this {
    return this.setDirective("child-src", sources);
  }
  workerSrc(...sources: CSPSourceOrClear[]): this {
    return this.setDirective("worker-src", sources);
  }
  frameAncestors(...sources: CSPSourceOrClear[]): this {
    return this.setDirective("frame-ancestors", sources);
  }
  formAction(...sources: CSPSourceOrClear[]): this {
    return this.setDirective("form-action", sources);
  }
  baseUri(...sources: CSPSourceOrClear[]): this {
    return this.setDirective("base-uri", sources);
  }
  manifestSrc(...sources: CSPSourceOrClear[]): this {
    return this.setDirective("manifest-src", sources);
  }
  prefetchSrc(...sources: CSPSourceOrClear[]): this {
    return this.setDirective("prefetch-src", sources);
  }
  navigateTo(...sources: CSPSourceOrClear[]): this {
    return this.setDirective("navigate-to", sources);
  }
  sandbox(...sources: CSPSourceOrClear[]): this {
    // Rails: empty `*values` → bare directive (stored as `true`); `values.first`
    // nil/false → delete. Ruby truthiness only treats nil/false as falsy —
    // empty strings stay truthy.
    if (sources.length === 0) {
      this.directives.set("sandbox", true);
      return this;
    }
    const first = sources[0];
    if (first === false || first == null) {
      this.directives.delete("sandbox");
      return this;
    }
    return this.setDirective("sandbox", sources as CSPSource[]);
  }
  pluginTypes(...sources: CSPSourceOrClear[]): this {
    // Rails: `if types.first` — only nil/false delete (Ruby truthiness, so
    // empty string stays truthy and is passed through to the directive).
    const first = sources[0];
    if (first === false || first == null) {
      this.directives.delete("plugin-types");
      return this;
    }
    return this.setDirective("plugin-types", sources as CSPSource[]);
  }
  reportUri(...sources: CSPSourceOrClear[]): this {
    return this.setDirective("report-uri", sources);
  }
  reportTo(...sources: CSPSourceOrClear[]): this {
    return this.setDirective("report-to", sources);
  }
  blockAllMixedContent(enabled: boolean | null = true): this {
    // Rails `if enabled`: only nil/false delete; numeric/empty-string stay
    // truthy. Bare directives store `true` (Rails parity, content_security_policy.rb:212-218).
    if (enabled === false || enabled == null) {
      this.directives.delete("block-all-mixed-content");
      return this;
    }
    this.directives.set("block-all-mixed-content", true);
    return this;
  }
  upgradeInsecureRequests(enabled: boolean | null = true): this {
    if (enabled === false || enabled == null) {
      this.directives.delete("upgrade-insecure-requests");
      return this;
    }
    this.directives.set("upgrade-insecure-requests", true);
    return this;
  }
  requireSriFor(...sources: CSPSourceOrClear[]): this {
    return this.setDirective("require-sri-for", sources);
  }
  requireTrustedTypesFor(...sources: CSPSourceOrClear[]): this {
    return this.setDirective("require-trusted-types-for", sources);
  }
  trustedTypes(...sources: CSPSourceOrClear[]): this {
    return this.setDirective("trusted-types", sources);
  }

  /**
   * @internal
   * Mirrors Rails' `DIRECTIVES.each { ... if sources.first ... else delete }`
   * (content_security_policy.rb:189-197). A bare call like `policy.scriptSrc()`
   * or `policy.scriptSrc(null)` removes the directive instead of setting an
   * empty list.
   */
  private setDirective(name: string, sources: CSPSourceOrClear[]): this {
    // Rails `if sources.first` uses Ruby truthiness: only nil/false are falsy.
    // Empty strings stay truthy, so `policy.scriptSrc("")` must set the
    // directive (matching content_security_policy.rb:189-197).
    const first = sources[0];
    if (sources.length === 0 || first == null || first === false) {
      this.directives.delete(name);
      return this;
    }
    this.directives.set(name, this.applyMappings(sources as CSPSource[]));
    return this;
  }

  // --- Build ---

  build(request?: unknown, nonce?: string, nonceDirectives?: readonly string[]): string {
    const nonceDirs = nonceDirectives ?? DEFAULT_NONCE_DIRECTIVES;
    return this.buildDirectives(request, nonce, nonceDirs)
      .filter((p): p is string => p != null)
      .join("; ");
  }

  // --- Rails-named privates (action_dispatch/http/content_security_policy.rb) ---

  /**
   * @internal
   * Mirrors `ContentSecurityPolicy#apply_mappings`. Translates short-form
   * `:keyword` sources (string starting with `:`) to their CSP representation
   * via [[MAPPINGS]]; strings and functions pass through unchanged.
   */
  private applyMappings(sources: CSPSource[]): CSPSource[] {
    return sources.map((source) => {
      if (typeof source === "string" && source.startsWith(":")) {
        return this.applyMapping(source.slice(1));
      }
      if (typeof source === "string" || typeof source === "function") {
        return source;
      }
      throw new TypeError(`Invalid content security policy source: ${String(source)}`);
    });
  }

  /**
   * @internal
   * Mirrors `ContentSecurityPolicy#apply_mapping`. Looks up a short-form
   * keyword in [[MAPPINGS]] or throws.
   */
  private applyMapping(source: string): string {
    if (!Object.hasOwn(MAPPINGS, source)) {
      throw new TypeError(`Unknown content security policy source mapping: ${source}`);
    }
    return MAPPINGS[source as keyof typeof MAPPINGS];
  }

  /**
   * @internal
   * Mirrors `ContentSecurityPolicy#build_directives`. Iterates the directive
   * map and produces one header part per directive, or `null` for omitted
   * directives (matching Rails' `.compact` filter).
   */
  private buildDirectives(
    context: unknown,
    nonce: string | undefined,
    nonceDirectives: readonly string[],
  ): (string | null)[] {
    const out: (string | null)[] = [];
    for (const [directive, sources] of this.directives) {
      if (Array.isArray(sources)) {
        const built = this.buildDirective(directive, sources, context).join(" ");
        if (nonce && this.isNonceDirective(directive, nonceDirectives)) {
          out.push(`${directive} ${built} 'nonce-${nonce}'`);
        } else {
          out.push(`${directive} ${built}`);
        }
      } else if (sources === true) {
        // Bare directive (no sources) — e.g. `block-all-mixed-content`.
        out.push(directive);
      } else {
        out.push(null);
      }
    }
    return out;
  }

  /**
   * @internal
   * Mirrors `ContentSecurityPolicy#validate`. Throws
   * [[InvalidDirectiveError]] if any resolved source contains a semicolon or
   * whitespace.
   */
  private validate(directive: string, sources: readonly string[]): void {
    for (const source of sources) {
      if (source.includes(";") || /\s/.test(source)) {
        throw new InvalidDirectiveError(
          `Invalid Content Security Policy ${directive}: "${source}". ` +
            `Directive values must not contain whitespace or semicolons. ` +
            `Please use multiple arguments or other directive methods instead.`,
        );
      }
    }
  }

  /**
   * @internal
   * Mirrors `ContentSecurityPolicy#build_directive`. Resolves each source via
   * [[resolveSource]] then validates the resolved list.
   */
  private buildDirective(directive: string, sources: CSPSource[], context: unknown): string[] {
    const resolved = sources.flatMap((source) => this.resolveSource(source, context));
    this.validate(directive, resolved);
    return resolved;
  }

  /**
   * @internal
   * Mirrors `ContentSecurityPolicy#resolve_source`. Strings pass through;
   * functions (Rails' Procs) are invoked with `context` and their result is
   * wrapped and re-run through [[applyMappings]].
   */
  private resolveSource(source: CSPSource, context: unknown): string[] {
    if (typeof source === "string") {
      return [source];
    }
    if (typeof source === "function") {
      if (context === undefined) {
        throw new Error(
          `Missing context for the dynamic content security policy source: ${String(source)}`,
        );
      }
      const result = source(context);
      const wrapped = Array.isArray(result) ? result : [result];
      return this.applyMappings(wrapped).map((s) => {
        if (typeof s !== "string") {
          throw new Error(`Unexpected content security policy source: ${String(s)}`);
        }
        return s;
      });
    }
    throw new Error(`Unexpected content security policy source: ${String(source)}`);
  }

  /**
   * @internal
   * Mirrors `ContentSecurityPolicy#nonce_directive?`. Returns whether the
   * directive is eligible to receive an auto-appended `'nonce-...'` source.
   */
  private isNonceDirective(directive: string, nonceDirectives: readonly string[]): boolean {
    return nonceDirectives.includes(directive);
  }

  // --- Duplication ---

  dup(): ContentSecurityPolicy {
    const copy = new ContentSecurityPolicy();
    for (const [k, v] of this.directives) {
      copy.directives.set(k, v === true ? true : [...v]);
    }
    return copy;
  }

  // --- Inspection ---

  getDirectives(): Map<DirectiveName, DirectiveValue> {
    return new Map(this.directives);
  }

  hasDirective(name: string): boolean {
    return this.directives.has(name);
  }
}

// ---------------------------------------------------------------------------
// ActionDispatch::ContentSecurityPolicy::Request mixin
// ---------------------------------------------------------------------------

/**
 * Rack env keys read/written by the CSP middleware and per-request DSL.
 * Mirrors the Rails `Request` module constants
 * (actionpack/lib/action_dispatch/http/content_security_policy.rb:74-78).
 */
export const POLICY = "action_dispatch.content_security_policy";
export const POLICY_REPORT_ONLY = "action_dispatch.content_security_policy_report_only";
export const NONCE_GENERATOR = "action_dispatch.content_security_policy_nonce_generator";
export const NONCE = "action_dispatch.content_security_policy_nonce";
export const NONCE_DIRECTIVES = "action_dispatch.content_security_policy_nonce_directives";

/** Minimal host shape — `Request` satisfies this via `getHeader`/`setHeader`. */
export interface CspRequestHost {
  getHeader(key: string): unknown;
  setHeader(key: string, value: unknown): unknown;
}

/** @internal Per-request nonce generator: `(request) => string`. */
export type NonceGenerator = (request: unknown) => string;

export function contentSecurityPolicy(
  this: CspRequestHost,
): ContentSecurityPolicy | null | undefined {
  return this.getHeader(POLICY) as ContentSecurityPolicy | null | undefined;
}

export function setContentSecurityPolicy(
  this: CspRequestHost,
  policy: ContentSecurityPolicy | null,
): void {
  this.setHeader(POLICY, policy);
}

export function contentSecurityPolicyReportOnly(this: CspRequestHost): boolean | undefined {
  return this.getHeader(POLICY_REPORT_ONLY) as boolean | undefined;
}

export function setContentSecurityPolicyReportOnly(this: CspRequestHost, value: boolean): void {
  this.setHeader(POLICY_REPORT_ONLY, value);
}

export function contentSecurityPolicyNonceGenerator(
  this: CspRequestHost,
): NonceGenerator | undefined {
  return this.getHeader(NONCE_GENERATOR) as NonceGenerator | undefined;
}

export function setContentSecurityPolicyNonceGenerator(
  this: CspRequestHost,
  generator: NonceGenerator | null,
): void {
  this.setHeader(NONCE_GENERATOR, generator);
}

export function contentSecurityPolicyNonceDirectives(
  this: CspRequestHost,
): readonly string[] | undefined {
  return this.getHeader(NONCE_DIRECTIVES) as readonly string[] | undefined;
}

export function setContentSecurityPolicyNonceDirectives(
  this: CspRequestHost,
  directives: readonly string[] | null,
): void {
  this.setHeader(NONCE_DIRECTIVES, directives);
}

/**
 * Per-request CSP nonce. Returns `undefined` unless a nonce generator is
 * configured; otherwise lazily memoizes the generated nonce in the env so
 * repeated reads return the same value (one nonce per request).
 *
 * Mirrors Rails `Request#content_security_policy_nonce`
 * (actionpack/lib/action_dispatch/http/content_security_policy.rb:112-120).
 */
export function contentSecurityPolicyNonce(this: CspRequestHost): string | undefined {
  const generator = contentSecurityPolicyNonceGenerator.call(this);
  if (!generator) return undefined;
  const existing = this.getHeader(NONCE) as string | undefined;
  if (existing !== undefined) return existing;
  const generated = generateContentSecurityPolicyNonce.call(this);
  this.setHeader(NONCE, generated);
  return generated;
}

/**
 * @internal
 * Mirrors Rails `Request#generate_content_security_policy_nonce` (private):
 * invokes the configured nonce generator with the request as its argument.
 * Throws if no generator is configured.
 */
export function generateContentSecurityPolicyNonce(this: CspRequestHost): string {
  const generator = contentSecurityPolicyNonceGenerator.call(this);
  if (!generator) {
    throw new Error("No content_security_policy_nonce_generator configured for this request");
  }
  return generator(this);
}
