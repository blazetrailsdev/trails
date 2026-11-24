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

export class ParserExtractor {
  constructor(public pattern: RegExp) {}

  annotations(file: string): Annotation[] {
    const source = File.read(file);
    api ??= new tokenizer!.API();
    const result = api.createSourceFile(file, source);
    const { diagnostics } = api.transpileModule(source, {
      fileName: file,
      reportDiagnostics: true,
    });
    if (diagnostics !== undefined && diagnostics.length > 0) return [];

    const literals = new Map<number, number>();
    const queue: Node[] = [result];
    let node: Node | undefined;
    while ((node = queue.pop())) {
      if (node.kind === tokenizer!.SyntaxKind.JsxText) literals.set(node.pos, node.end);
      else if (tokenizer!.isLiteralLike(node)) literals.set(node.getStart(result), node.end);
      node.forEachChild((child) => {
        queue.push(child);
      });
    }

    const comments: Annotation[] = [];
    const { SingleLineCommentTrivia, MultiLineCommentTrivia, EndOfFile } = tokenizer!.SyntaxKind;
    const scanner = tokenizer!.createScanner(false);
    scanner.setText(source);
    let kind = scanner.scan();
    while (kind !== EndOfFile) {
      const start = scanner.getTokenStart();
      const end = literals.get(start);
      if (end !== undefined) scanner.resetTokenState(end);
      else if (kind === SingleLineCommentTrivia || kind === MultiLineCommentTrivia) {
        const startLine = result.getLineAndCharacterOfPosition(start).line + 1;
        const m = scanner.getTokenText().match(this.pattern);
        if (m) comments.push(new Annotation(startLine, m[1], m[2]));
      }
      kind = scanner.scan();
    }
    return comments;
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
  static extensions = new Map<string, ExtensionBuilder>();

  static registerDirectories(...dirs: string[]): void {
    this.directories.push(...dirs);
  }

  static registerTags(...additionalTags: string[]): void {
    this.tags.push(...additionalTags);
  }

  static registerExtensions(...exts: [...string[], ExtensionBuilder]): void {
    const block = exts.pop() as ExtensionBuilder;
    this.extensions.set(`\\.(${(exts as string[]).join("|")})$`, block);
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
  Annotation.extensions = new Map();
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
  Annotation.registerExtensions("scss", "sass", "less", slash);
  Annotation.registerExtensions(
    "css",
    (tag) => new RegExp(`/\\*\\s*(${tag}):?\\s*(.*?)(?:\\*/)?$`, "m"),
  );
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
      const extension = [...Annotation.extensions].find(([regexp]) =>
        new RegExp(regexp).test(item),
      );
      if (extension) {
        let pattern = extension[1](this.tag);

        if (pattern == null) continue;

        if (pattern instanceof RegExp) pattern = new PatternExtractor(pattern);

        const annotations = pattern.annotations(item);
        if (annotations.length > 0) results.set(item, annotations);
      }
    }
    return results;
  }

  display(results: Map<string, Annotation[]>, options: AnnotationOptions = {}): void {
    const lines = [...results.values()].flatMap((a) => a.map((note) => note.line));
    options.indent = String(lines.length > 0 ? Math.max(...lines) : "").length;
    for (const file of [...results.keys()].sort()) {
      STDOUT.puts(`${file}:`);
      for (const note of results.get(file)!) {
        STDOUT.puts(`  * ${note.toString(options).trim()}`);
      }
      STDOUT.puts();
    }
  }
}
