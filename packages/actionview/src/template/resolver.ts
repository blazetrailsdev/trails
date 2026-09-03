import { Dir, File } from "@blazetrails/ruby-compat";
import { regexpEscape } from "@blazetrails/ruby-compat";
import type { LookupDetails, PathSetResolver } from "../path-set.js";
import { Requested, TemplateDetails, type DetailKey } from "../template-details.js";
import { TemplateHandlers } from "../template/handlers.js";
import { TemplatePath } from "../template-path.js";
import { Types } from "../template/types.js";
import { Template } from "../template.js";

export interface TemplateWithDetails {
  template: Template;
  details: TemplateDetails;
}

export abstract class Resolver implements PathSetResolver {
  clearCache(): void {}

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

  builtTemplates(): Template[] {
    return [];
  }

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

  /** @internal */
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

  /** @internal */
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
  protected fnmatch(glob: string): RegExp {
    return new RegExp(`^${fnmatchChars(glob, ".*", ".")}$`);
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
    this._path = File.expandPath(path);
  }

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

  toPath(): string {
    return this.toString();
  }

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
   * @missingRailsCall new — CONVERGEABLE port-template-sources-file-for-lazy-resolver-sources
   */
  protected sourceForTemplate(template: string): string {
    return File.read(template);
  }

  /** @internal */
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

  /** @internal */
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

  /** @internal */
  protected templateGlob(glob: string): string[] {
    const query = File.join(this.escapeEntry(this._path), glob);
    const pathWithSlash = File.join(this._path, "");

    return Dir.glob(query).flatMap((filename) => {
      filename = File.expandPath(filename);
      if (File.isDirectory(filename)) return [];
      if (!filename.startsWith(pathWithSlash)) return [];
      return [filename];
    });
  }

  /** @internal */
  protected escapeEntry(entry: string): string {
    return entry.replace(/[*?{}[\]]/g, "\\$&");
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

function union(alternatives: readonly string[]): string {
  if (alternatives.length === 0) return "(?!)";
  return alternatives.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
}
