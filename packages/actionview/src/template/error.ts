import { isPresent } from "@blazetrails/activesupport";
import { Jaro } from "@blazetrails/did-you-mean";
import { ArgumentError, File, rbInspect, regexpEscape } from "@blazetrails/ruby-compat";
import type { TemplatePath } from "../template-path.js";
import type { Template } from "../template.js";

export class StrictLocalsError extends ArgumentError {
  constructor(argumentError: Error, template: { shortIdentifier: string }) {
    const message = argumentError.message
      .replaceAll("unknown keyword:", "unknown local:")
      .replaceAll("missing keyword:", "missing local:")
      .replaceAll("no keywords accepted", "no locals accepted")
      .concat(` for ${template.shortIdentifier}`);
    super(message);
    this.name = "ActionView::StrictLocalsError";
  }
}

type MissingTemplatePath = { allTemplatePaths?(): readonly TemplatePath[] } | null | undefined;

export class MissingTemplate extends Error {
  readonly path: string;
  readonly paths: Iterable<MissingTemplatePath>;
  readonly prefixes: string[];
  readonly partial: boolean;

  constructor(
    paths: Iterable<MissingTemplatePath>,
    path: string,
    prefixes: string | readonly string[] | null,
    partial: boolean,
    details: unknown,
    ..._args: unknown[]
  ) {
    if (partial && isPresent(path)) {
      path = path.replace(/([^/]+)$/, "_$1");
    }

    const arrayPrefixes =
      prefixes == null ? [] : typeof prefixes === "string" ? [prefixes] : [...prefixes];
    let templateType: string;
    if (partial) {
      templateType = "partial";
    } else if (/layouts/i.test(path)) {
      templateType = "layout";
    } else {
      templateType = "template";
    }

    const searchedPaths = arrayPrefixes.map((prefix) => [prefix, path].join("/"));

    let out = `Missing ${templateType} ${searchedPaths.join(", ")} with ${rbInspect(details)}.\n\nSearched in:\n`;
    out += Array.from(paths)
      .filter((p) => p != null)
      .map((p) => `  * ${rbInspect(String(p))}\n`)
      .join("");
    super(out);
    this.name = "ActionView::MissingTemplate";

    this.path = path;
    this.paths = paths;
    this.prefixes = arrayPrefixes;
    this.partial = partial;
  }

  get corrections(): string[] {
    const all = Array.from(this.paths).flatMap((p) => p?.allTemplatePaths?.() ?? []);
    let candidates = all.filter((c, i) => all.findIndex((other) => other.eql(c)) === i);

    if (this.partial) {
      candidates = candidates.filter((c) => c.partial);
    } else {
      candidates = candidates.filter((c) => !c.partial);
    }

    const filesByDir: Record<string, string[]> = {};
    for (const file of candidates) (filesByDir[file.prefix] ??= []).push(file.toString());
    for (const [dirname, files] of Object.entries(filesByDir)) {
      filesByDir[dirname] = files.map((file) => File.basename(file));
    }

    if (this.prefixes.some((prefix) => filesByDir[prefix]?.includes(this.path))) {
      return [];
    }

    const distances = new Map<string, number>();
    const cachedDistance = (a: string, b: string): number => {
      const key = `${a}\0${b}`;
      if (!distances.has(key)) distances.set(key, -Jaro.distance(a, b));
      return distances.get(key)!;
    };

    const results = new Results(6);

    const dirWeights = Object.keys(filesByDir).map(
      (dirname) =>
        [
          dirname,
          Math.min(...this.prefixes.map((prefix) => cachedDistance(prefix, dirname))),
        ] as const,
    );
    for (const [dirname, dirweight] of dirWeights.sort((a, b) => a[1] - b[1])) {
      if (!results.shouldRecord(dirweight - 1.0)) continue;

      const files = filesByDir[dirname];

      for (const file of files) {
        const fileweight = cachedDistance(this.path, file);
        const score = dirweight + fileweight;

        results.add(File.join(dirname, file), score);
      }
    }

    if (this.partial) {
      return results.toA().map((res) => res.replace(/_([^/]+)$/, "$1"));
    } else {
      return results.toA();
    }
  }
}

export class Result {
  constructor(
    readonly path: string,
    readonly score: number,
  ) {}
}

export class Results {
  private readonly size: number;
  private readonly results: Result[] = [];

  constructor(size: number) {
    this.size = size;
  }

  toA(): string[] {
    return this.results.map((r) => r.path);
  }

  shouldRecord(score: number): boolean {
    if (this.results.length < this.size) {
      return true;
    } else {
      return score < this.results[this.results.length - 1].score;
    }
  }

  add(path: string, score: number): void {
    if (this.shouldRecord(score)) {
      this.results.push(new Result(path, score));
      this.results.sort((a, b) => a.score - b.score);
      if (this.results.length > this.size) this.results.pop();
    }
  }
}

export interface TemplateErrorOptions {
  original: Error;
  template: Template;
}

export class TemplateError extends Error {
  static readonly SOURCE_CODE_RADIUS = 3;

  readonly original: Error;
  readonly template: Template;
  private subTemplates?: Template[];
  private _lineNumber?: number | null;

  constructor(opts: TemplateErrorOptions) {
    super(opts.original.message, { cause: opts.original });
    this.name = "ActionView::Template::Error";
    this.original = opts.original;
    this.template = opts.template;
  }

  backtrace(): string[] {
    const stack = this.original.stack;
    if (stack == null) return [];
    return stack.split("\n").slice(1);
  }

  fileName(): string {
    return this.template.identifier;
  }

  subTemplateMessage(): string {
    if (this.subTemplates) {
      return "Trace of template inclusion: " + this.subTemplates.map((t) => t.inspect()).join(", ");
    }
    return "";
  }

  sourceExtract(indentation = 0): string[] {
    const num = this.lineNumber();
    if (num == null) return [];

    const sourceCode = this.template.source.split("\n");

    const startOnLine = Math.max(num - TemplateError.SOURCE_CODE_RADIUS - 1, 0);
    const endOnLine = Math.min(num + TemplateError.SOURCE_CODE_RADIUS - 1, sourceCode.length);

    const indent = String(endOnLine).length + indentation;
    const slice = sourceCode.slice(startOnLine, endOnLine + 1);
    if (slice.length === 0) return [];

    return this.formattedCodeFor(slice, startOnLine, indent);
  }

  subTemplateOf(templatePath: Template): void {
    this.subTemplates ??= [];
    this.subTemplates.push(templatePath);
  }

  lineNumber(): number | null {
    if (this._lineNumber != null) return this._lineNumber;
    this._lineNumber = null;
    const fileName = this.fileName();
    if (fileName != null) {
      const regexp = new RegExp(`${regexpEscape(File.basename(fileName))}:(\\d+)`);
      const match =
        regexp.exec(this.message) ??
        this.backtrace()
          .map((line) => regexp.exec(line))
          .find((m) => m !== null);
      if (match) this._lineNumber = Number(match[1]);
    }
    return this._lineNumber;
  }

  annotatedSourceCode(): string[] {
    return this.sourceExtract(4);
  }

  private sourceLocation(): string {
    const lineNumber = this.lineNumber();
    return (lineNumber != null ? `on line #${lineNumber} of ` : "in ") + this.fileName();
  }

  private formattedCodeFor(sourceCode: string[], lineCounter: number, indent: number): string[] {
    return sourceCode.map((line) => {
      lineCounter += 1;
      return `${String(lineCounter).padStart(indent)}: ${line}`;
    });
  }
}

export class SyntaxErrorInTemplate extends TemplateError {
  private readonly offendingCodeString: string;

  constructor(template: Template, offendingCodeString: string, original: Error) {
    super({ original, template });
    this.offendingCodeString = offendingCodeString;
    this.name = "ActionView::SyntaxErrorInTemplate";
    this.message = `Encountered a syntax error while rendering template: check ${this.offendingCodeString}\n`;
  }

  override annotatedSourceCode(): string[] {
    return this.offendingCodeString.split("\n").map((line, i) => {
      const indentation = " ".repeat(4);
      return `${i + 1}:${indentation}${line}`;
    });
  }
}
