/**
 * ActionDispatch::ContentSecurityPolicy
 *
 * DSL for building Content-Security-Policy headers.
 */

export type CSPSource = string | ((request?: unknown) => string);

const SCRIPT_DIRECTIVES = ["script_src", "script_src_attr", "script_src_elem"] as const;

const STYLE_DIRECTIVES = ["style_src", "style_src_attr", "style_src_elem"] as const;

const FETCH_DIRECTIVES = [
  "child_src",
  "connect_src",
  "default_src",
  "font_src",
  "frame_src",
  "img_src",
  "manifest_src",
  "media_src",
  "object_src",
  "prefetch_src",
  "script_src",
  "script_src_attr",
  "script_src_elem",
  "style_src",
  "style_src_attr",
  "style_src_elem",
  "worker_src",
] as const;

const DOCUMENT_DIRECTIVES = ["base_uri", "plugin_types", "sandbox"] as const;

const NAVIGATION_DIRECTIVES = ["form_action", "frame_ancestors", "navigate_to"] as const;

const REPORTING_DIRECTIVES = ["report_to", "report_uri"] as const;

const OTHER_DIRECTIVES = [
  "block_all_mixed_content",
  "require_sri_for",
  "require_trusted_types_for",
  "trusted_types",
  "upgrade_insecure_requests",
] as const;

type DirectiveName = string;

export class ContentSecurityPolicy {
  private directives: Map<DirectiveName, CSPSource[]> = new Map();

  constructor(init?: (policy: ContentSecurityPolicy) => void) {
    if (init) init(this);
  }

  // --- Directive setters ---

  defaultSrc(...sources: CSPSource[]): this {
    return this.setDirective("default-src", sources);
  }
  scriptSrc(...sources: CSPSource[]): this {
    return this.setDirective("script-src", sources);
  }
  scriptSrcAttr(...sources: CSPSource[]): this {
    return this.setDirective("script-src-attr", sources);
  }
  scriptSrcElem(...sources: CSPSource[]): this {
    return this.setDirective("script-src-elem", sources);
  }
  styleSrc(...sources: CSPSource[]): this {
    return this.setDirective("style-src", sources);
  }
  styleSrcAttr(...sources: CSPSource[]): this {
    return this.setDirective("style-src-attr", sources);
  }
  styleSrcElem(...sources: CSPSource[]): this {
    return this.setDirective("style-src-elem", sources);
  }
  imgSrc(...sources: CSPSource[]): this {
    return this.setDirective("img-src", sources);
  }
  fontSrc(...sources: CSPSource[]): this {
    return this.setDirective("font-src", sources);
  }
  connectSrc(...sources: CSPSource[]): this {
    return this.setDirective("connect-src", sources);
  }
  mediaSrc(...sources: CSPSource[]): this {
    return this.setDirective("media-src", sources);
  }
  objectSrc(...sources: CSPSource[]): this {
    return this.setDirective("object-src", sources);
  }
  frameSrc(...sources: CSPSource[]): this {
    return this.setDirective("frame-src", sources);
  }
  childSrc(...sources: CSPSource[]): this {
    return this.setDirective("child-src", sources);
  }
  workerSrc(...sources: CSPSource[]): this {
    return this.setDirective("worker-src", sources);
  }
  frameAncestors(...sources: CSPSource[]): this {
    return this.setDirective("frame-ancestors", sources);
  }
  formAction(...sources: CSPSource[]): this {
    return this.setDirective("form-action", sources);
  }
  baseUri(...sources: CSPSource[]): this {
    return this.setDirective("base-uri", sources);
  }
  manifestSrc(...sources: CSPSource[]): this {
    return this.setDirective("manifest-src", sources);
  }
  prefetchSrc(...sources: CSPSource[]): this {
    return this.setDirective("prefetch-src", sources);
  }
  navigateTo(...sources: CSPSource[]): this {
    return this.setDirective("navigate-to", sources);
  }
  sandbox(...sources: CSPSource[]): this {
    return this.setDirective("sandbox", sources);
  }
  pluginTypes(...sources: CSPSource[]): this {
    return this.setDirective("plugin-types", sources);
  }
  reportUri(...sources: CSPSource[]): this {
    return this.setDirective("report-uri", sources);
  }
  reportTo(...sources: CSPSource[]): this {
    return this.setDirective("report-to", sources);
  }
  blockAllMixedContent(): this {
    return this.setDirective("block-all-mixed-content", []);
  }
  upgradeInsecureRequests(): this {
    return this.setDirective("upgrade-insecure-requests", []);
  }
  requireSriFor(...sources: CSPSource[]): this {
    return this.setDirective("require-sri-for", sources);
  }
  requireTrustedTypesFor(...sources: CSPSource[]): this {
    return this.setDirective("require-trusted-types-for", sources);
  }
  trustedTypes(...sources: CSPSource[]): this {
    return this.setDirective("trusted-types", sources);
  }

  private setDirective(name: string, sources: CSPSource[]): this {
    this.directives.set(name, sources);
    return this;
  }

  // --- Build ---

  build(request?: unknown, nonce?: string): string {
    const parts: string[] = [];

    for (const [directive, sources] of this.directives) {
      const resolved = sources.map((s) => {
        if (typeof s === "function") {
          if (request === undefined) {
            throw new Error(`Missing context for dynamic source in ${directive}`);
          }
          return s(request);
        }
        return s;
      });

      // Validate
      for (const val of resolved) {
        if (val.includes(";")) throw new Error(`Invalid CSP source: contains semicolon`);
      }

      // Add nonce to script/style sources
      const allSources = [...resolved];
      if (nonce && (directive.startsWith("script-src") || directive.startsWith("style-src"))) {
        allSources.push(`'nonce-${nonce}'`);
      }

      if (allSources.length === 0) {
        parts.push(directive);
      } else {
        parts.push(`${directive} ${allSources.join(" ")}`);
      }
    }

    return parts.join("; ");
  }

  // --- Duplication ---

  dup(): ContentSecurityPolicy {
    const copy = new ContentSecurityPolicy();
    for (const [k, v] of this.directives) {
      copy.directives.set(k, [...v]);
    }
    return copy;
  }

  // --- Inspection ---

  getDirectives(): Map<DirectiveName, CSPSource[]> {
    return new Map(this.directives);
  }

  hasDirective(name: string): boolean {
    return this.directives.has(name);
  }
}
