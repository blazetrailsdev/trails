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
import { regexpEscape } from "@blazetrails/ruby-compat";
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

  /** Used for error pages (`resolver.rb:63-66`). */
  builtTemplates(): Template[] {
    return [];
  }

  /** Not implemented by default (`resolver.rb:68-71`). */
  allTemplatePaths(): readonly TemplatePath[] {
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

  /**
   * @internal
   * Ruby `File.fnmatch`, which JS has no equivalent of and no admissible
   * third-party one. `pathname` selects the flag Ruby's two call sites use:
   * `Dir.glob` (`resolver.rb:205`) matches path-wise, so `*` stops at a
   * separator and `**` spans them, while `FixtureResolver`'s bare
   * `File.fnmatch` (`testing/resolvers.rb:27`) passes no `FNM_PATHNAME` and
   * lets `*` match `/` too — verified against MRI.
   */
  protected fnmatch(glob: string, pathname = true): RegExp {
    if (!pathname) return new RegExp(`^${fnmatchChars(glob, ".*", ".")}$`);

    const segments = glob.split("/");
    let pattern = "";
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (segment === "**") {
        pattern += "(?:[^/]+/)*";
        continue;
      }
      pattern += fnmatchChars(segment, "[^/]*", "[^/]");
      if (i < segments.length - 1) pattern += "/";
    }
    return new RegExp(`^${pattern}$`);
  }

  /**
   * @internal
   * `resolver.rb:172-181`. Rails keeps this private on `FileSystemResolver`,
   * the only resolver upstream that filters candidates itself; trails' second
   * such resolver is `testing/resolvers.ts`, and TypeScript has no way to
   * share a private method between two classes without a common ancestor.
   */
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

/**
 * Ruby `sort_by!` orders by an Array key, comparing element by element
 * (`resolver.rb:177-179`); `Array#sort` takes a number, so the tuple
 * comparison is spelled out.
 */
/**
 * The directory `Dir.glob` would descend into before the pattern's first
 * wildcard — the leading run of literal segments, with `escape_entry`'s
 * backslash quoting undone, since those segments name a real directory rather
 * than a pattern to match.
 */
/**
 * One `File.fnmatch` pattern segment as a regular expression: a backslash
 * quotes the character after it (`escape_entry`'s output), `*` and `?` are the
 * wildcards, everything else is literal.
 */
function fnmatchChars(text: string, star: string, question: string): string {
  let pattern = "";
  for (let c = 0; c < text.length; c++) {
    const char = text[c];
    if (char === "\\" && c + 1 < text.length) pattern += regexpEscape(text[++c]);
    else if (char === "*") pattern += star;
    else if (char === "?") pattern += question;
    else pattern += regexpEscape(char);
  }
  return pattern;
}

function globWalkRoot(glob: string): string {
  const root: string[] = [];
  for (const segment of glob.split("/").slice(0, -1)) {
    if (/(?:^|[^\\])(?:\\\\)*[*?[{]/.test(segment)) break;
    root.push(segment.replace(/\\(.)/g, "$1"));
  }
  return root.join("/");
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
  protected _path: string;

  constructor(path: string) {
    super();
    if ((path as unknown) instanceof Resolver)
      throw new TypeError("path already is a Resolver class");
    this._path = getPath().resolve(path);
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

  /** Rails' `alias :to_path :to_s` (`resolver.rb:106`). */
  toPath(): string {
    return this.toString();
  }

  /**
   * `resolver.rb:108-111`, and the `alias :== :eql?` beside it — JS has no
   * operator to overload, so the one method answers both spellings.
   */
  isEql(resolver: unknown): boolean {
    return (
      resolver instanceof FileSystemResolver &&
      this.constructor === resolver.constructor &&
      this.toPath() === resolver.toPath()
    );
  }

  override builtTemplates(): Template[] {
    return Array.from(this.templatesCache.values()).flatMap((templates) =>
      templates.map((t) => t.template),
    );
  }

  override allTemplatePaths(): readonly TemplatePath[] {
    const paths = this.templateGlob("**/*");
    const seen = new Set<string>();
    for (const filename of paths) {
      seen.add(filename.slice(this._path.length + 1).replace(/\.[^/]*$/, ""));
    }
    return Array.from(seen, (filename) => TemplatePath.parse(filename));
  }

  /**
   * @internal
   * `resolver.rb:127-140`. `cache = key ? @unbound_templates :
   * Concurrent::Map.new` — with no key the map Rails computes into is fresh,
   * so the persistent one is neither read nor written and the scan always
   * runs. That is what `LookupContext#disableCache` relies on.
   */
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

    const cache = key != null ? this.templatesCache : undefined;
    let templates = cache?.get(path.virtual);
    if (templates === undefined) {
      templates = this.unboundTemplatesFromPath(path);
      cache?.set(path.virtual, templates);
    }

    return this.filterAndSortByDetails(templates, requestedDetails);
  }

  /**
   * @internal
   * `resolver.rb:141-143`. Rails wraps the path in a lazy
   * `Template::Sources::File`, which is unported; the contents are read
   * eagerly instead.
   *
   * @missingRailsCall new — CONVERGEABLE port-template-sources-file-for-lazy-resolver-sources
   */
  protected sourceForTemplate(template: string): string {
    return getFs().readFileSync(template, "utf-8");
  }

  /**
   * @internal
   * Rails' `build_unbound_template` (`resolver.rb:145-155`); trails binds the
   * template eagerly because `UnboundTemplate` is unported.
   */
  protected buildUnboundTemplate(template: string): TemplateWithDetails | null {
    const parsed = this.pathParser.parse(template.slice(this._path.length + 1));
    const details = parsed.details;
    if (typeof details.handler !== "string") return null;

    const built = new Template({
      source: this.sourceForTemplate(template),
      extension: details.handler,
      identifier: template,
      virtualPath: parsed.path.virtual,
      format: typeof details.format === "string" ? details.format : null,
      variant: typeof details.variant === "string" ? details.variant : null,
      fullPath: template,
      isPartial: parsed.path.partial,
    });

    return { template: built, details };
  }

  /**
   * @internal
   * Rails' `unbound_templates_from_path` (`resolver.rb:157-171`) — instead of
   * checking every possible path, scan the directory for files with the right
   * prefix and keep the exact virtual-path matches.
   */
  protected unboundTemplatesFromPath(path: TemplatePath): TemplateWithDetails[] {
    if (path.name.includes(".")) return [];

    const paths = this.templateGlob(`${this.escapeEntry(path.virtual)}*`);
    const templates: TemplateWithDetails[] = [];

    for (const template of paths) {
      const built = this.buildUnboundTemplate(template);
      if (built !== null && built.template.virtualPath === path.virtual) templates.push(built);
    }

    return templates;
  }

  /**
   * @internal
   * Safe glob within the resolver root (`resolver.rb:202-207`), yielding
   * expanded paths. `Dir.glob` walks the tree itself; here the walk is
   * {@link globWalkRoot} and the pattern is matched against what it finds.
   */
  protected templateGlob(glob: string): string[] {
    const query = getPath().join(this.escapeEntry(this._path), glob);
    const regex = this.fnmatch(query);
    const pathWithSlash = getPath().join(this._path, "");

    return this.entriesUnder(globWalkRoot(glob))
      .map((relative) => getPath().join(this._path, relative))
      .filter((filename) => regex.test(filename) && filename.startsWith(pathWithSlash));
  }

  /** @internal `resolver.rb:208-209`. */
  protected escapeEntry(entry: string): string {
    return entry.replace(/[*?{}[\]]/g, "\\$&");
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

  /**
   * `resolver.rb:16-33`. I18n is unported, so `available_locales` contributes
   * nothing to the locale union and only Rails' generic shape is left.
   */
  buildPathRegex(): RegExp {
    const handlers = union(TemplateHandlers.extensions());
    const formats = union(Types.symbols());
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
