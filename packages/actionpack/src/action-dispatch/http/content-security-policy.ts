import { ArgumentError } from "@blazetrails/ruby-compat";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { CONTENT_SECURITY_POLICY, CONTENT_SECURITY_POLICY_REPORT_ONLY } from "../constants.js";
import { _RequestCtor } from "./request-slot.js";

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

export type CSPSourceOrClear = CSPSource | null | false;

export const DEFAULT_NONCE_DIRECTIVES = ["script-src", "style-src"] as const;

type DirectiveName = string;

export class InvalidDirectiveError extends Error {}

export type DirectiveValue = CSPSource[] | true;

export class Middleware {
  private app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    const response = await this.app(env);
    const [status, headers] = response;

    if (status === 304) return response;
    if (this.policyPresent(headers)) return response;

    const request = new _RequestCtor!(env) as Request & {
      controllerInstance?: unknown;
    };

    const policy = request.contentSecurityPolicy;
    if (policy) {
      const nonce = request.contentSecurityPolicyNonce;
      const nonceDirectives = request.contentSecurityPolicyNonceDirectives;
      const context = request.controllerInstance ?? request;
      headers[this.headerName(request)] = policy.build(
        context,
        nonce,
        nonceDirectives ?? undefined,
      );
    }

    return response;
  }

  private headerName(request: Request): string {
    return request.contentSecurityPolicyReportOnly
      ? CONTENT_SECURITY_POLICY_REPORT_ONLY
      : CONTENT_SECURITY_POLICY;
  }

  private policyPresent(headers: Record<string, string | string[]>): boolean {
    return (
      headers[CONTENT_SECURITY_POLICY] != null ||
      headers[CONTENT_SECURITY_POLICY_REPORT_ONLY] != null
    );
  }
}

export class ContentSecurityPolicy {
  private directives: Map<DirectiveName, DirectiveValue> = new Map();

  constructor(init?: (policy: ContentSecurityPolicy) => void) {
    if (init) init(this);
  }

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
  sandbox(...values: CSPSourceOrClear[]): this {
    if (values.length === 0) {
      this.directives.set("sandbox", true);
      return this;
    }
    const first = values[0];
    if (first === false || first == null) {
      this.directives.delete("sandbox");
      return this;
    }
    return this.setDirective("sandbox", values as CSPSource[]);
  }
  pluginTypes(...types: CSPSourceOrClear[]): this {
    const first = types[0];
    if (first === false || first == null) {
      this.directives.delete("plugin-types");
      return this;
    }
    return this.setDirective("plugin-types", types as CSPSource[]);
  }
  reportUri(uri: CSPSource): this {
    this.directives.set("report-uri", [uri]);
    return this;
  }
  reportTo(...sources: CSPSourceOrClear[]): this {
    return this.setDirective("report-to", sources);
  }
  blockAllMixedContent(enabled: boolean | null = true): this {
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
  requireSriFor(...types: CSPSourceOrClear[]): this {
    return this.setDirective("require-sri-for", types);
  }
  requireTrustedTypesFor(...sources: CSPSourceOrClear[]): this {
    return this.setDirective("require-trusted-types-for", sources);
  }
  trustedTypes(...sources: CSPSourceOrClear[]): this {
    return this.setDirective("trusted-types", sources);
  }

  /** @internal */
  private setDirective(name: string, sources: CSPSourceOrClear[]): this {
    const first = sources[0];
    if (sources.length === 0 || first == null || first === false) {
      this.directives.delete(name);
      return this;
    }
    this.directives.set(name, this.applyMappings(sources as CSPSource[]));
    return this;
  }

  build(context?: unknown, nonce?: string, nonceDirectives?: readonly string[]): string {
    const nonceDirs = nonceDirectives ?? DEFAULT_NONCE_DIRECTIVES;
    return this.buildDirectives(context, nonce, nonceDirs)
      .filter((p): p is string => p != null)
      .join("; ");
  }

  /** @internal */
  private applyMappings(sources: CSPSource[]): CSPSource[] {
    return sources.map((source) => {
      if (typeof source === "string" && source.startsWith(":")) {
        return this.applyMapping(source.slice(1));
      }
      if (typeof source === "string" || typeof source === "function") {
        return source;
      }
      throw new ArgumentError(`Invalid content security policy source: ${String(source)}`);
    });
  }

  /** @internal */
  private applyMapping(source: string): string {
    if (!Object.hasOwn(MAPPINGS, source)) {
      throw new ArgumentError(`Unknown content security policy source mapping: ${source}`);
    }
    return MAPPINGS[source as keyof typeof MAPPINGS];
  }

  /** @internal */
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
        out.push(directive);
      } else {
        out.push(null);
      }
    }
    return out;
  }

  /** @internal */
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

  /** @internal */
  private buildDirective(directive: string, sources: CSPSource[], context: unknown): string[] {
    const resolved = sources.flatMap((source) => this.resolveSource(source, context));
    this.validate(directive, resolved);
    return resolved;
  }

  /** @internal */
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

  /** @internal */
  private isNonceDirective(directive: string, nonceDirectives: readonly string[]): boolean {
    return nonceDirectives.includes(directive);
  }

  dup(): ContentSecurityPolicy {
    const copy = new ContentSecurityPolicy();
    for (const [k, v] of this.directives) {
      copy.directives.set(k, v === true ? true : [...v]);
    }
    return copy;
  }

  getDirectives(): Map<DirectiveName, DirectiveValue> {
    return new Map(this.directives);
  }

  hasDirective(name: string): boolean {
    return this.directives.has(name);
  }
}

export const POLICY = "action_dispatch.content_security_policy";
export const POLICY_REPORT_ONLY = "action_dispatch.content_security_policy_report_only";
export const NONCE_GENERATOR = "action_dispatch.content_security_policy_nonce_generator";
export const NONCE = "action_dispatch.content_security_policy_nonce";
export const NONCE_DIRECTIVES = "action_dispatch.content_security_policy_nonce_directives";

export interface CspRequestHost {
  getHeader(key: string): unknown;
  setHeader(key: string, value: unknown): unknown;
}

/** @internal */
export type NonceGenerator = (request: unknown) => string;

export class Request {
  declare getHeader: CspRequestHost["getHeader"];
  declare setHeader: CspRequestHost["setHeader"];

  get contentSecurityPolicy(): ContentSecurityPolicy | null | undefined {
    return this.getHeader(POLICY) as ContentSecurityPolicy | null | undefined;
  }

  set contentSecurityPolicy(policy: ContentSecurityPolicy | null) {
    this.setHeader(POLICY, policy);
  }

  get contentSecurityPolicyReportOnly(): boolean | undefined {
    return this.getHeader(POLICY_REPORT_ONLY) as boolean | undefined;
  }

  set contentSecurityPolicyReportOnly(value: boolean) {
    this.setHeader(POLICY_REPORT_ONLY, value);
  }

  get contentSecurityPolicyNonceGenerator(): NonceGenerator | null | undefined {
    return this.getHeader(NONCE_GENERATOR) as NonceGenerator | null | undefined;
  }

  set contentSecurityPolicyNonceGenerator(generator: NonceGenerator | null) {
    this.setHeader(NONCE_GENERATOR, generator);
  }

  get contentSecurityPolicyNonceDirectives(): readonly string[] | null | undefined {
    return this.getHeader(NONCE_DIRECTIVES) as readonly string[] | null | undefined;
  }

  set contentSecurityPolicyNonceDirectives(directives: readonly string[] | null) {
    this.setHeader(NONCE_DIRECTIVES, directives);
  }

  get contentSecurityPolicyNonce(): string | undefined {
    if (!this.contentSecurityPolicyNonceGenerator) return undefined;
    const existing = this.getHeader(NONCE);
    if (existing !== null && existing !== undefined && existing !== false) {
      return existing as string;
    }
    const generated = this.generateContentSecurityPolicyNonce();
    this.setHeader(NONCE, generated);
    return generated;
  }

  /** @internal */
  generateContentSecurityPolicyNonce(): string {
    const generator = this.contentSecurityPolicyNonceGenerator;
    if (!generator) {
      throw new Error("No content_security_policy_nonce_generator configured for this request");
    }
    return generator(this);
  }
}
