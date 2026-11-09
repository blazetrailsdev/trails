import {
  Dir,
  File,
  LoadError,
  STDOUT,
  rbFRequire,
  rbRequireLoaded,
} from "@blazetrails/ruby-compat";
import type * as Ast from "typescript/unstable/ast";
import type { Node } from "typescript/unstable/ast";
import type * as Scanner from "typescript/unstable/ast/scanner";
import type * as Sync from "typescript/unstable/sync";
import type { API } from "typescript/unstable/sync";

const TOKENIZER_FEATURES = [
  "typescript/unstable/ast",
  "typescript/unstable/ast/scanner",
  "typescript/unstable/sync",
] as const;

/** @noRailsEquivalent PERMANENT */
async function requireTokenizer() {
  try {
    for (const feature of TOKENIZER_FEATURES)
      await rbFRequire({ [feature]: () => import(feature) }, feature);
  } catch (e) {
    if (e instanceof LoadError) return null;
    throw e;
  }
  const ast = rbRequireLoaded("typescript/unstable/ast") as unknown as typeof Ast;
  const scanner = rbRequireLoaded("typescript/unstable/ast/scanner") as unknown as typeof Scanner;
  const sync = rbRequireLoaded("typescript/unstable/sync") as unknown as typeof Sync;
  return {
    API: sync.API,
    SyntaxKind: ast.SyntaxKind,
    isLiteralLike: (node: Node) =>
      ast.isStringLiteralLikeNode(node) ||
      ast.isTemplateHead(node) ||
      ast.isTemplateMiddle(node) ||
      ast.isTemplateTail(node) ||
      ast.isRegularExpressionLiteral(node),
    createScanner: scanner.createScanner,
  };
}

let tokenizer: Awaited<ReturnType<typeof requireTokenizer>> | undefined;
let api: API | undefined;

export interface AnnotationOptions {
  tag?: boolean;
  indent?: number;
}

export type ExtensionBuilder = (
  tagPattern: string,
) => RegExp | { annotations(file: string): Annotation[] } | null | undefined;

const DEFAULT_DIRECTORIES = ["app", "config", "db", "lib", "test"];
const DEFAULT_TAGS = ["OPTIMIZE", "FIXME", "TODO"];

export class Parser {
  comments: Annotation[] = [];
  pattern: RegExp;
  private source: string;
  private file: string;
  private lineno = 0;
  private _error = false;

  constructor(source: string, { pattern, file }: { pattern: RegExp; file: string }) {
    this.source = source;
    this.pattern = pattern;
    this.file = file;
  }

  onComment(value: string): void {
    const m = value.match(this.pattern);
    if (m) this.comments.push(new Annotation(this.lineno, m[1], m[2]));
  }

  /** @noRailsEquivalent PERMANENT */
  isError(): boolean {
    return this._error;
  }

  /** @noRailsEquivalent PERMANENT */
  parse(): void {
    api ??= new tokenizer!.API();
    const sourceFile = api.createSourceFile(this.file, this.source);
    const literals = new Map<number, number>();
    const queue: Node[] = [sourceFile];
    let node: Node | undefined;
    while ((node = queue.pop())) {
      if (node.kind === tokenizer!.SyntaxKind.JsxText) literals.set(node.pos, node.end);
      else if (tokenizer!.isLiteralLike(node)) literals.set(node.getStart(sourceFile), node.end);
      node.forEachChild((child) => {
        queue.push(child);
      });
    }

    const { SingleLineCommentTrivia, MultiLineCommentTrivia, EndOfFile } = tokenizer!.SyntaxKind;
    const scanner = tokenizer!.createScanner(false);
    scanner.setText(this.source);
    let kind = scanner.scan();
    while (kind !== EndOfFile) {
      if (scanner.isUnterminated()) this._error = true;
      const start = scanner.getTokenStart();
      const end = literals.get(start);
      if (end !== undefined) scanner.resetTokenState(end);
      else if (kind === SingleLineCommentTrivia || kind === MultiLineCommentTrivia) {
        this.lineno = sourceFile.getLineAndCharacterOfPosition(start).line + 1;
        for (const line of scanner.getTokenText().split(/\r?\n/)) {
          this.onComment(line);
          this.lineno += 1;
        }
      }
      kind = scanner.scan();
    }
  }
}

export class ParserExtractor {
  static Parser = Parser;

  constructor(public pattern: RegExp) {}

  annotations(file: string): Annotation[] {
    const contents = File.read(file);
    const parser = new Parser(contents, { pattern: this.pattern, file });
    parser.parse();
    return parser.isError() ? [] : parser.comments;
  }
}

export class PatternExtractor {
  constructor(public pattern: RegExp) {}

  annotations(file: string): Annotation[] {
    const list: Annotation[] = [];
    let lineno = 0;
    for (const line of File.readlines(file)) {
      lineno += 1;
      const m = line.match(this.pattern);
      if (m) list.push(new Annotation(lineno, m[1], m[2]));
    }
    return list;
  }
}

export class Annotation {
  static directories: string[] = [...DEFAULT_DIRECTORIES];
  static tags: string[] = [...DEFAULT_TAGS];
  static extensions: Array<{ test: RegExp; builder: ExtensionBuilder }> = [];

  static registerDirectories(...dirs: string[]): void {
    this.directories.push(...dirs);
  }

  static registerTags(...additionalTags: string[]): void {
    this.tags.push(...additionalTags);
  }

  static registerExtensions(...exts: [...string[], ExtensionBuilder]): void {
    const block = exts.pop() as ExtensionBuilder;
    this.extensions.push({
      test: new RegExp(`\\.(${(exts as string[]).join("|")})$`),
      builder: block,
    });
  }

  constructor(
    public readonly line: number,
    public readonly tag: string,
    public readonly text: string,
  ) {}

  toString(options: AnnotationOptions = {}): string {
    const indent = options.indent ?? 0;
    let s = `[${String(this.line).padStart(indent)}] `;
    if (options.tag) s += `[${this.tag}] `;
    return s + this.text;
  }
}

/** @noRailsEquivalent PERMANENT */
export function resetAnnotationRegistry(): void {
  Annotation.directories = [...DEFAULT_DIRECTORIES];
  Annotation.tags = [...DEFAULT_TAGS];
  Annotation.extensions = [];
  registerDefaults();
}

function registerDefaults(): void {
  const slash = (tag: string): RegExp => new RegExp(`//\\s*(${tag}):?\\s*(.*)$`, "m");
  Annotation.registerExtensions("ts", "js", "mjs", "cjs", "tsx", "jsx", (tag) =>
    tokenizer
      ? new ParserExtractor(
          new RegExp(`(?://|/\\*|^\\s*\\*)\\s*(${tag}):?\\s*(.*?)\\s*(?:\\*/)?$`, "m"),
        )
      : slash(tag),
  );
  Annotation.registerExtensions("css", "scss", "sass", "less", slash);
  Annotation.registerExtensions(
    "yml",
    "yaml",
    (tag) => new RegExp(`#\\s*(${tag}):?\\s*(.*)$`, "m"),
  );
  Annotation.registerExtensions(
    "ejs",
    "tse",
    (tag) => new RegExp(`<%\\s*#\\s*(${tag}):?\\s*(.*?)\\s*%>`),
  );
}

registerDefaults();

export class SourceAnnotationExtractor {
  static ParserExtractor = ParserExtractor;
  static PatternExtractor = PatternExtractor;
  static Annotation = Annotation;

  /** @inventedArm requireTokenizer — PERMANENT */
  static async enumerate(
    tag: string | null = null,
    options: AnnotationOptions & { dirs?: readonly string[] } = {},
  ): Promise<void> {
    tokenizer ??= await requireTokenizer();
    tag ??= Annotation.tags.join("|");
    const extractor = new SourceAnnotationExtractor(tag);
    const dirs = options.dirs ?? Annotation.directories;
    delete options.dirs;
    extractor.display(extractor.find(dirs), options);
  }

  constructor(public readonly tag: string) {}

  find(dirs: readonly string[]): Map<string, Annotation[]> {
    const merged = new Map<string, Annotation[]>();
    for (const dir of dirs) for (const [k, v] of this.findIn(dir)) merged.set(k, v);
    return merged;
  }

  findIn(dir: string): Map<string, Annotation[]> {
    const results = new Map<string, Annotation[]>();
    for (const item of Dir.glob(`${dir}/*`)) {
      if (File.basename(item).startsWith(".")) continue;
      if (File.isDirectory(item)) {
        for (const [k, v] of this.findIn(item)) results.set(k, v);
        continue;
      }
      const extension = Annotation.extensions.find((e) => e.test.test(item));
      if (extension) {
        let pattern = extension.builder(this.tag);

        if (pattern == null) continue;

        if (pattern instanceof RegExp) pattern = new PatternExtractor(pattern);

        const annotations = pattern.annotations(item);
        if (annotations.length > 0) results.set(item, annotations);
      }
    }
    return results;
  }

  display(results: Map<string, Annotation[]>, options: AnnotationOptions = {}): void {
    let maxLine = 0;
    for (const arr of results.values()) for (const a of arr) if (a.line > maxLine) maxLine = a.line;
    options.indent = String(maxLine).length;
    for (const file of [...results.keys()].sort()) {
      STDOUT.puts(`${file}:`);
      for (const note of results.get(file)!) {
        STDOUT.puts(`  * ${note.toString(options)}`);
      }
      STDOUT.puts();
    }
  }
}
