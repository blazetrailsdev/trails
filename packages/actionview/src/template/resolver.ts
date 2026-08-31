/**
 * ActionView::Resolver
 *
 * Base class for template resolvers. A resolver answers the single lookup
 * protocol `PathSet` drives — `findAll(name, prefix, partial, details, key,
 * locals)` — so every entry point (`LookupContext#find`, `#findAll`,
 * `#isExists`, `#isAny`, and the render path) resolves through the same
 * details cascade.
 *
 * Mirrors `actionview/lib/action_view/template/resolver.rb:11-84`.
 */

import { getFs, getPath } from "@blazetrails/activesupport";
import type { LookupDetails, PathSetResolver } from "../path-set.js";
import { Requested, TemplateDetails, type DetailKey } from "../template-details.js";
import { TemplateHandlers } from "../template/handlers.js";
import { TemplatePath } from "../template-path.js";
import { Types } from "../template/types.js";
import { Template } from "../template.js";

/**
 * A candidate template plus the details parsed off its path. Rails carries the
 * pair as an `UnboundTemplate` (`unbound_template.rb`), whose `bind_locals`
 * step trails does eagerly; `UnboundTemplate` itself is unported.
 */
export interface TemplateWithDetails {
  template: Template;
  details: TemplateDetails;
}

export abstract class Resolver implements PathSetResolver {
  clearCache(): void {}

  /** Normalizes the arguments and passes it on to `findTemplates`. */
  findAll(
    name: TemplatePath | string,
    prefix = "",
    partial = false,
    details: LookupDetails = {},
    key: unknown = null,
    locals: ReadonlyArray<string> = [],
  ): Template[] {
    return this._findAll(
      typeof name === "string" ? name : name.name,
      prefix,
      partial,
      details,
      key,
      locals,
    );
  }

  allTemplatePaths(): readonly string[] {
    return [];
  }

  /** @internal */
  protected _findAll(
    name: string,
    prefix: string,
    partial: boolean,
    details: LookupDetails,
    _key: unknown,
    locals: ReadonlyArray<string>,
  ): Template[] {
    return this.findTemplates(name, prefix, partial, details, locals);
  }

  /**
   * @internal
   * This is what child classes implement. No defaults are needed because
   * `Resolver` guarantees that the arguments are present and normalized.
   */
  protected findTemplates(
    _name: string,
    _prefix: string,
    _partial: boolean,
    _details: LookupDetails,
    _locals: ReadonlyArray<string> = [],
  ): Template[] {
    throw new Error(
      "Subclasses must implement a findTemplates(name, prefix, partial, details, locals = []) method",
    );
  }

  /**
   * @internal
   * `key || TemplateDetails::Requested.new(**details)` — the resolver builds
   * its own when `LookupContext` had its details cache off and passed no key
   * (`resolver.rb:128`).
   */
  protected requestedDetailsFor(details: LookupDetails, key: unknown): Requested {
    if (key instanceof Requested) return key;
    const d = details as Record<string, ReadonlyArray<DetailKey> | undefined>;
    return new Requested({
      locale: d.locale ?? [],
      handlers: d.handlers ?? [],
      formats: d.formats ?? [],
      variants: d.variants ?? [],
    });
  }

  /** @internal */
  protected filterAndSortByDetails(
    templates: ReadonlyArray<TemplateWithDetails>,
    requestedDetails: Requested,
  ): Template[] {
    const filteredTemplates = templates.filter((t) => t.details.matches(requestedDetails));

    if (filteredTemplates.length > 1) {
      filteredTemplates.sort((a, b) =>
        compareSortKeys(
          a.details.sortKeyFor(requestedDetails),
          b.details.sortKeyFor(requestedDetails),
        ),
      );
    }

    return filteredTemplates.map((t) => t.template);
  }
}

function compareSortKeys(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

export class FileSystemResolver extends Resolver {
  private templatesCache = new Map<string, TemplateWithDetails[]>();
  private pathParser = new PathParser();
  private _path: string;

  constructor(path: string) {
    super();
    if ((path as unknown) instanceof Resolver)
      throw new TypeError("path already is a Resolver class");
    this._path = path;
  }

  /** Rails' `attr_reader :path`. */
  path(): string {
    return this._path;
  }

  override clearCache(): void {
    this.templatesCache.clear();
    this.pathParser = new PathParser();
    super.clearCache();
  }

  toString(): string {
    return this._path;
  }

  override allTemplatePaths(): readonly string[] {
    const paths = this.templateGlob("**/*");
    const seen = new Set<string>();
    for (const filename of paths) {
      seen.add(filename.replace(/\.[^/]*$/, ""));
    }
    return Array.from(seen);
  }

  /** @internal */
  protected override _findAll(
    name: string,
    prefix: string,
    partial: boolean,
    details: LookupDetails,
    key: unknown,
    _locals: ReadonlyArray<string>,
  ): Template[] {
    const requestedDetails = this.requestedDetailsFor(details, key);
    const path = TemplatePath.build(name, prefix, partial);

    let templates = this.templatesCache.get(path.virtual);
    if (templates === undefined) {
      templates = this.templatesFromPath(path);
      if (key != null) this.templatesCache.set(path.virtual, templates);
    }

    return this.filterAndSortByDetails(templates, requestedDetails);
  }

  /**
   * @internal
   * Rails' `unbound_templates_from_path` (`resolver.rb:157-171`) — instead of
   * checking every possible path, scan the directory for files with the right
   * prefix and keep the exact virtual-path matches.
   */
  protected templatesFromPath(path: TemplatePath): TemplateWithDetails[] {
    if (path.name.includes(".")) return [];

    const paths = this.templateGlob(`${path.virtual}*`);
    const templates: TemplateWithDetails[] = [];

    for (const relative of paths) {
      const built = this.buildTemplate(relative);
      if (built !== null && built.template.virtualPath === path.virtual) templates.push(built);
    }

    return templates;
  }

  /** @internal */
  protected buildTemplate(relative: string): TemplateWithDetails | null {
    const parsed = this.pathParser.parse(relative);
    const details = parsed.details;
    if (typeof details.handler !== "string") return null;

    const fullPath = getPath().join(this._path, relative);
    const template = new Template({
      source: getFs().readFileSync(fullPath, "utf-8"),
      extension: details.handler,
      identifier: fullPath,
      virtualPath: parsed.path.virtual,
      format: typeof details.format === "string" ? details.format : null,
      variant: typeof details.variant === "string" ? details.variant : null,
      fullPath,
      isPartial: parsed.path.partial,
    });

    return { template, details };
  }

  /**
   * @internal
   * Safe glob within the resolver root (`resolver.rb:202-207`), yielding root-
   * relative paths. `File.fnmatch` is spelled out here: `**` spans directory
   * separators, `*` does not.
   */
  protected templateGlob(glob: string): string[] {
    const segments = glob.split("/");
    let pattern = "";
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (segment === "**") {
        pattern += "(?:[^/]+/)*";
        continue;
      }
      pattern += segment.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
      if (i < segments.length - 1) pattern += "/";
    }
    const regex = new RegExp(`^${pattern}$`);
    // Rails' `Dir.glob` only descends what the pattern can reach; walking from
    // the last literal directory segment keeps that property.
    const literal = segments.slice(0, -1);
    const wildcard = literal.findIndex((segment) => segment.includes("*"));
    const root = (wildcard === -1 ? literal : literal.slice(0, wildcard)).join("/");
    return this.entriesUnder(root).filter((relative) => regex.test(relative));
  }

  /** @internal Every file under `prefix`, as a path relative to the root. */
  private entriesUnder(prefix: string): string[] {
    const dir = prefix === "" ? this._path : getPath().join(this._path, prefix);
    let entries: Array<{ name: string; isFile(): boolean; isDirectory(): boolean }>;
    try {
      entries = getFs().readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const out: string[] = [];
    for (const entry of entries) {
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) out.push(...this.entriesUnder(relative));
      else out.push(relative);
    }
    return out;
  }
}

export class ParsedPath {
  readonly path: TemplatePath;
  readonly details: TemplateDetails;

  constructor(path: TemplatePath, details: TemplateDetails) {
    this.path = path;
    this.details = details;
  }
}

export class PathParser {
  private regex: RegExp | null = null;

  buildPathRegex(): RegExp {
    const handlers = union(TemplateHandlers.extensions());
    const formats = union(Types.symbols());
    // I18n is not ported, so `available_locales` contributes nothing and only
    // Rails' generic locale shape (`resolver.rb:20`) is left.
    const locales = "[a-z]{2}(?:[-_][A-Z]{2})?";
    const variants = "[^.]*";

    return new RegExp(
      "^" +
        "(?:(.*)\\/)?" +
        "(_)?" +
        "(.*?)" +
        `(?:\\.(${locales}))??` +
        `(?:\\.(${formats}))??` +
        `(?:\\+(${variants}))??` +
        `(?:\\.(${handlers}))?` +
        "$",
    );
  }

  parse(path: string): ParsedPath {
    this.regex ??= this.buildPathRegex();
    const match = this.regex.exec(path)!;
    const [, prefix, partial, action, locale, format, variant, handler] = match;
    const templatePath = TemplatePath.build(action, prefix ?? "", partial != null);
    const details = new TemplateDetails(
      locale ?? null,
      handler ?? null,
      format ?? null,
      variant ?? null,
    );
    return new ParsedPath(templatePath, details);
  }
}

/**
 * Ruby `Regexp.union` over a list of literal alternatives. An empty list
 * matches nothing, where a bare `()` would match the empty string.
 */
function union(alternatives: readonly string[]): string {
  if (alternatives.length === 0) return "(?!)";
  return alternatives.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
}
