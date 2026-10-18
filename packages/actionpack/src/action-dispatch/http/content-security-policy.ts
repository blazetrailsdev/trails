import { ArgumentError, hashDelete, rbFSend, rbInspect } from "@blazetrails/ruby-compat";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { CONTENT_SECURITY_POLICY, CONTENT_SECURITY_POLICY_REPORT_ONLY } from "../constants.js";
import { ActionDispatch } from "../../namespaces.js";
import { deepDup, wrap } from "@blazetrails/activesupport";

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
    const response = await (rbFSend(this.app, "call", env) as ReturnType<typeof this.app>);
    const [status, headers] = response;

    if (status === 304) return response;
    if (this.policyPresent(headers)) return response;

    const request = new ActionDispatch.Request(env) as Request & {
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
  directives: Record<DirectiveName, DirectiveValue> = {};

  constructor(init?: (policy: ContentSecurityPolicy) => void) {
    if (init) init(this);
  }

  initializeCopy(other: ContentSecurityPolicy): Record<DirectiveName, DirectiveValue> {
    return (this.directives = deepDup(other.directives));
  }

  defaultSrc(...sources: CSPSourceOrClear[]): DirectiveValue | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["default-src"] = this.applyMappings(sources as CSPSource[]));
    } else {
      return hashDelete(this.directives, "default-src");
    }
  }
  scriptSrc(...sources: CSPSourceOrClear[]): DirectiveValue | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["script-src"] = this.applyMappings(sources as CSPSource[]));
    } else {
      return hashDelete(this.directives, "script-src");
    }
  }
  scriptSrcAttr(...sources: CSPSourceOrClear[]): DirectiveValue | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["script-src-attr"] = this.applyMappings(sources as CSPSource[]));
    } else {
      return hashDelete(this.directives, "script-src-attr");
    }
  }
  scriptSrcElem(...sources: CSPSourceOrClear[]): DirectiveValue | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["script-src-elem"] = this.applyMappings(sources as CSPSource[]));
    } else {
      return hashDelete(this.directives, "script-src-elem");
    }
  }
  styleSrc(...sources: CSPSourceOrClear[]): DirectiveValue | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["style-src"] = this.applyMappings(sources as CSPSource[]));
    } else {
      return hashDelete(this.directives, "style-src");
    }
  }
  styleSrcAttr(...sources: CSPSourceOrClear[]): DirectiveValue | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["style-src-attr"] = this.applyMappings(sources as CSPSource[]));
    } else {
      return hashDelete(this.directives, "style-src-attr");
    }
  }
  styleSrcElem(...sources: CSPSourceOrClear[]): DirectiveValue | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["style-src-elem"] = this.applyMappings(sources as CSPSource[]));
    } else {
      return hashDelete(this.directives, "style-src-elem");
    }
  }
  imgSrc(...sources: CSPSourceOrClear[]): DirectiveValue | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["img-src"] = this.applyMappings(sources as CSPSource[]));
    } else {
      return hashDelete(this.directives, "img-src");
    }
  }
  fontSrc(...sources: CSPSourceOrClear[]): DirectiveValue | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["font-src"] = this.applyMappings(sources as CSPSource[]));
    } else {
      return hashDelete(this.directives, "font-src");
    }
  }
  connectSrc(...sources: CSPSourceOrClear[]): DirectiveValue | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["connect-src"] = this.applyMappings(sources as CSPSource[]));
    } else {
      return hashDelete(this.directives, "connect-src");
    }
  }
  mediaSrc(...sources: CSPSourceOrClear[]): DirectiveValue | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["media-src"] = this.applyMappings(sources as CSPSource[]));
    } else {
      return hashDelete(this.directives, "media-src");
    }
  }
  objectSrc(...sources: CSPSourceOrClear[]): DirectiveValue | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["object-src"] = this.applyMappings(sources as CSPSource[]));
    } else {
      return hashDelete(this.directives, "object-src");
    }
  }
  frameSrc(...sources: CSPSourceOrClear[]): DirectiveValue | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["frame-src"] = this.applyMappings(sources as CSPSource[]));
    } else {
      return hashDelete(this.directives, "frame-src");
    }
  }
  childSrc(...sources: CSPSourceOrClear[]): DirectiveValue | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["child-src"] = this.applyMappings(sources as CSPSource[]));
    } else {
      return hashDelete(this.directives, "child-src");
    }
  }
  workerSrc(...sources: CSPSourceOrClear[]): DirectiveValue | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["worker-src"] = this.applyMappings(sources as CSPSource[]));
    } else {
      return hashDelete(this.directives, "worker-src");
    }
  }
  frameAncestors(...sources: CSPSourceOrClear[]): DirectiveValue | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["frame-ancestors"] = this.applyMappings(sources as CSPSource[]));
    } else {
      return hashDelete(this.directives, "frame-ancestors");
    }
  }
  formAction(...sources: CSPSourceOrClear[]): DirectiveValue | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["form-action"] = this.applyMappings(sources as CSPSource[]));
    } else {
      return hashDelete(this.directives, "form-action");
    }
  }
  baseUri(...sources: CSPSourceOrClear[]): DirectiveValue | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["base-uri"] = this.applyMappings(sources as CSPSource[]));
    } else {
      return hashDelete(this.directives, "base-uri");
    }
  }
  manifestSrc(...sources: CSPSourceOrClear[]): DirectiveValue | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["manifest-src"] = this.applyMappings(sources as CSPSource[]));
    } else {
      return hashDelete(this.directives, "manifest-src");
    }
  }
  prefetchSrc(...sources: CSPSourceOrClear[]): DirectiveValue | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["prefetch-src"] = this.applyMappings(sources as CSPSource[]));
    } else {
      return hashDelete(this.directives, "prefetch-src");
    }
  }
  sandbox(...values: CSPSourceOrClear[]): DirectiveValue | null {
    if (values.length === 0) {
      return (this.directives["sandbox"] = true);
    } else if (values[0] != null && values[0] !== false) {
      return (this.directives["sandbox"] = values as CSPSource[]);
    } else {
      return hashDelete(this.directives, "sandbox");
    }
  }
  pluginTypes(...types: CSPSourceOrClear[]): DirectiveValue | null {
    if (types[0] != null && types[0] !== false) {
      return (this.directives["plugin-types"] = types as CSPSource[]);
    } else {
      return hashDelete(this.directives, "plugin-types");
    }
  }
  reportUri(uri: CSPSource): CSPSource[] {
    return (this.directives["report-uri"] = [uri]);
  }
  blockAllMixedContent(enabled: boolean | null = true): DirectiveValue | null {
    if (enabled != null && enabled !== false) {
      return (this.directives["block-all-mixed-content"] = true);
    } else {
      return hashDelete(this.directives, "block-all-mixed-content");
    }
  }
  upgradeInsecureRequests(enabled: boolean | null = true): DirectiveValue | null {
    if (enabled != null && enabled !== false) {
      return (this.directives["upgrade-insecure-requests"] = true);
    } else {
      return hashDelete(this.directives, "upgrade-insecure-requests");
    }
  }
  requireSriFor(...types: CSPSourceOrClear[]): DirectiveValue | null {
    if (types[0] != null && types[0] !== false) {
      return (this.directives["require-sri-for"] = types as CSPSource[]);
    } else {
      return hashDelete(this.directives, "require-sri-for");
    }
  }
  requireTrustedTypesFor(...sources: CSPSourceOrClear[]): DirectiveValue | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["require-trusted-types-for"] = this.applyMappings(
        sources as CSPSource[],
      ));
    } else {
      return hashDelete(this.directives, "require-trusted-types-for");
    }
  }
  trustedTypes(...sources: CSPSourceOrClear[]): DirectiveValue | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["trusted-types"] = this.applyMappings(sources as CSPSource[]));
    } else {
      return hashDelete(this.directives, "trusted-types");
    }
  }

  build(context?: unknown, nonce?: string, nonceDirectives?: readonly string[]): string {
    nonceDirectives ??= DEFAULT_NONCE_DIRECTIVES;
    return this.buildDirectives(context, nonce, nonceDirectives)
      .filter((p): p is string => p != null)
      .join("; ");
  }

  /** @internal */
  private applyMappings(sources: CSPSource[]): CSPSource[] {
    return sources.map((source) => {
      if (typeof source === "string" && source.startsWith(":")) {
        return this.applyMapping(source);
      }
      if (typeof source === "string" || typeof source === "function") {
        return source;
      }
      throw new ArgumentError(`Invalid content security policy source: ${rbInspect(source)}`);
    });
  }

  /** @internal */
  private applyMapping(source: string): string {
    if (!Object.hasOwn(MAPPINGS, source.slice(1))) {
      throw new ArgumentError(
        `Unknown content security policy source mapping: ${rbInspect(source)}`,
      );
    }
    return MAPPINGS[source.slice(1) as keyof typeof MAPPINGS];
  }

  /** @internal */
  private buildDirectives(
    context: unknown,
    nonce: string | undefined,
    nonceDirectives: readonly string[],
  ): (string | null)[] {
    const out: (string | null)[] = [];
    for (const [directive, sources] of Object.entries(this.directives)) {
      if (Array.isArray(sources)) {
        if (nonce && this.isNonceDirective(directive, nonceDirectives)) {
          out.push(
            `${directive} ${this.buildDirective(directive, sources, context).join(" ")} 'nonce-${nonce}'`,
          );
        } else {
          out.push(`${directive} ${this.buildDirective(directive, sources, context).join(" ")}`);
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
    const resolvedSources = sources.flatMap((source) => this.resolveSource(source, context));
    this.validate(directive, resolvedSources);
    return resolvedSources;
  }

  /** @internal */
  private resolveSource(source: CSPSource, context: unknown): string[] {
    if (typeof source === "string" && !source.startsWith(":")) {
      return [source];
    } else if (typeof source === "string") {
      return [source.slice(1)];
    }
    if (typeof source === "function") {
      if (context === undefined) {
        throw new Error(
          `Missing context for the dynamic content security policy source: ${String(source)}`,
        );
      }
      const resolved = source(context);
      return this.applyMappings(wrap(resolved)).map((s) => {
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
  declare protected getHeader: CspRequestHost["getHeader"];
  declare protected setHeader: CspRequestHost["setHeader"];

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
    const nonce = this.getHeader(NONCE);
    if (nonce !== null && nonce !== undefined && nonce !== false) {
      return nonce as string;
    } else {
      return this.setHeader(NONCE, this.generateContentSecurityPolicyNonce()) as string;
    }
  }

  /** @internal */
  generateContentSecurityPolicyNonce(): string {
    return this.contentSecurityPolicyNonceGenerator!(this);
  }
}
