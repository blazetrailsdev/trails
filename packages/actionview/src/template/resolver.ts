import { I18n } from "@blazetrails/activesupport";
import { Dir, File, NotImplementedError, symbolToS } from "@blazetrails/ruby-compat";
import type { LookupDetails, PathSetResolver } from "../path-set.js";
import { Requested, TemplateDetails, type DetailKey } from "../template-details.js";
import { UnboundTemplate } from "../unbound-template.js";
import { TemplateHandlers } from "../template/handlers.js";
import { TemplatePath } from "../template-path.js";
import { Template } from "../template.js";

export abstract class Resolver implements PathSetResolver {
  static caching: boolean = true;

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
    // @nie disposition=keep-as-strategy-hook rails=actionview/lib/action_view/template/resolver.rb:85
    throw new NotImplementedError(
      "Subclasses must implement a findTemplates(name, prefix, partial, details, locals = []) method",
    );
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
  private unboundTemplates = new Map<string, UnboundTemplate[]>();
  private pathParser = new PathParser();
  protected _path: string;

  constructor(path: string) {
    super();
    if ((path as unknown) instanceof Resolver)
      throw new TypeError("path already is a Resolver class");
    this._path = File.expandPath(path);
  }

  get path(): string {
    return this._path;
  }

  override clearCache(): void {
    this.unboundTemplates.clear();
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
    return Array.from(this.unboundTemplates.values())
      .flat()
      .flatMap((unboundTemplate) => unboundTemplate.builtTemplates());
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
    locals: ReadonlyArray<string>,
  ): Template[] {
    const d = details as Record<string, ReadonlyArray<DetailKey> | undefined>;
    const requestedDetails =
      key instanceof Requested
        ? key
        : new Requested({
            locale: d.locale ?? [],
            handlers: d.handlers ?? [],
            formats: d.formats ?? [],
            variants: d.variants ?? [],
          });
    const cache = key != null ? this.unboundTemplates : new Map<string, UnboundTemplate[]>();

    const virtual = TemplatePath.virtual(name, prefix, partial);
    let unboundTemplates = cache.get(virtual);
    if (unboundTemplates === undefined) {
      const path = TemplatePath.build(name, prefix, partial);
      unboundTemplates = this.unboundTemplatesFromPath(path);
      cache.set(virtual, unboundTemplates);
    }

    return this.filterAndSortByDetails(unboundTemplates, requestedDetails).map((unboundTemplate) =>
      unboundTemplate.bindLocals(locals),
    );
  }

  /**
   * @internal
   * @missingRailsCall new — CONVERGEABLE port-template-sources-file-for-lazy-resolver-sources
   */
  protected sourceForTemplate(template: string): string {
    return File.read(template);
  }

  /** @internal */
  protected buildUnboundTemplate(template: string): UnboundTemplate | null {
    const parsed = this.pathParser.parse(template.slice(this._path.length + 1));
    const details = parsed.details;
    if (typeof details.handler !== "string") return null;
    const source = this.sourceForTemplate(template);

    return new UnboundTemplate(source, template, {
      details: details,
      virtualPath: parsed.path.virtual,
    });
  }

  /** @internal */
  protected unboundTemplatesFromPath(path: TemplatePath): UnboundTemplate[] {
    if (path.name.includes(".")) {
      return [];
    }

    const paths = this.templateGlob(`${this.escapeEntry(path.toString())}*`);

    return paths
      .map((path) => this.buildUnboundTemplate(path))
      .filter(
        (template): template is UnboundTemplate =>
          template !== null && template.virtualPath === path.virtual,
      );
  }

  /** @internal */
  private filterAndSortByDetails(
    templates: ReadonlyArray<UnboundTemplate>,
    requestedDetails: Requested,
  ): UnboundTemplate[] {
    const filteredTemplates = templates.filter((template) =>
      template.details.matches(requestedDetails),
    );

    if (filteredTemplates.length > 1) {
      filteredTemplates.sort((a, b) =>
        compareSortKeys(
          a.details.sortKeyFor(requestedDetails),
          b.details.sortKeyFor(requestedDetails),
        ),
      );
    }

    return filteredTemplates;
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
    const formats = union(Template.Types.symbols().map(symbolToS));
    const availableLocales = I18n.availableLocales().map(String);
    const regularLocales = [/[a-z]{2}(?:[-_][A-Z]{2})?/];
    const locales = union([...availableLocales, ...regularLocales]);
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
      format != null ? `:${format}` : null,
      variant ?? null,
    );
    return new ParsedPath(templatePath, details);
  }
}

function union(alternatives: readonly (string | RegExp)[]): string {
  if (alternatives.length === 0) return "(?!)";
  return alternatives
    .map((a) =>
      a instanceof RegExp ? `(?:${a.source})` : a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("|");
}
