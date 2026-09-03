import { Dir, File } from "@blazetrails/ruby-compat";

export interface AnnotationOptions {
  tag?: boolean;
  indent?: number;
}

export type ExtensionBuilder = (tagPattern: string) => RegExp;

const DEFAULT_DIRECTORIES = ["app", "config", "db", "lib", "test"];
const DEFAULT_TAGS = ["OPTIMIZE", "FIXME", "TODO"];

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
  const slash = (tag: string): RegExp => new RegExp(`//\\s*(${tag}):?\\s*(.*)$`);
  Annotation.registerExtensions("ts", "js", "mjs", "cjs", "tsx", "jsx", slash);
  Annotation.registerExtensions("css", "scss", "sass", "less", slash);
  Annotation.registerExtensions("yml", "yaml", (tag) => new RegExp(`#\\s*(${tag}):?\\s*(.*)$`));
  Annotation.registerExtensions(
    "ejs",
    "tse",
    (tag) => new RegExp(`<%\\s*#\\s*(${tag}):?\\s*(.*?)\\s*%>`),
  );
}

registerDefaults();

export class SourceAnnotationExtractor {
  static enumerate(
    tag: string | null = null,
    options: AnnotationOptions & { dirs?: readonly string[] } = {},
  ): string {
    tag ??= Annotation.tags.join("|");
    const extractor = new SourceAnnotationExtractor(tag);
    const dirs = options.dirs ?? Annotation.directories;
    delete options.dirs;
    return extractor.display(extractor.find(dirs), options);
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
      const ext = Annotation.extensions.find((e) => e.test.test(item));
      if (!ext) continue;
      const annotations = extractFromFile(item, ext.builder(this.tag));
      if (annotations.length > 0) results.set(item, annotations);
    }
    return results;
  }

  display(results: Map<string, Annotation[]>, options: AnnotationOptions = {}): string {
    let maxLine = 0;
    for (const arr of results.values()) for (const a of arr) if (a.line > maxLine) maxLine = a.line;
    const indent = String(maxLine).length;
    const lines: string[] = [];
    for (const file of [...results.keys()].sort()) {
      lines.push(`${file}:`);
      for (const note of results.get(file)!) {
        lines.push(`  * ${note.toString({ ...options, indent })}`);
      }
      lines.push("");
    }
    return lines.map((l) => `${l}\n`).join("");
  }
}

function extractFromFile(file: string, pattern: RegExp): Annotation[] {
  const out: Annotation[] = [];
  let lineno = 0;
  for (const line of File.readlines(file)) {
    lineno++;
    const m = line.match(pattern);
    if (m) out.push(new Annotation(lineno, m[1], m[2]));
  }
  return out;
}
