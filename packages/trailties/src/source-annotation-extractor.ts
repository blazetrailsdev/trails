import { getFsAsync, getPathAsync } from "@blazetrails/activesupport";

export interface AnnotationOptions {
  tag?: boolean;
  indent?: number;
}

export class Annotation {
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

export type ExtensionBuilder = (tagPattern: string) => RegExp;

const DEFAULT_DIRECTORIES = ["app", "config", "db", "lib", "test"];
const DEFAULT_TAGS = ["OPTIMIZE", "FIXME", "TODO"];

let directories: string[] = [...DEFAULT_DIRECTORIES];
let tags: string[] = [...DEFAULT_TAGS];
let extensions: Array<{ test: RegExp; builder: ExtensionBuilder }> = [];

export const registerDirectories = (...dirs: string[]): void => void directories.push(...dirs);
export const registerTags = (...t: string[]): void => void tags.push(...t);
export const registerExtensions = (exts: string[], builder: ExtensionBuilder): void =>
  void extensions.push({ test: new RegExp(`\\.(${exts.join("|")})$`), builder });

/** Test-only convenience: reset the directories/tags/extensions registries. */
export function resetAnnotationRegistry(): void {
  directories = [...DEFAULT_DIRECTORIES];
  tags = [...DEFAULT_TAGS];
  extensions = [];
  registerDefaults();
}

function registerDefaults(): void {
  const slash = (tag: string): RegExp => new RegExp(`//\\s*(${tag}):?\\s*(.*)$`);
  registerExtensions(["ts", "js", "mjs", "cjs", "tsx", "jsx"], slash);
  registerExtensions(["css", "scss", "sass", "less"], slash);
  registerExtensions(["yml", "yaml"], (tag) => new RegExp(`#\\s*(${tag}):?\\s*(.*)$`));
  registerExtensions(["ejs", "erb"], (tag) => new RegExp(`<%\\s*#\\s*(${tag}):?\\s*(.*?)\\s*%>`));
}

registerDefaults();

/**
 * Ports Rails::SourceAnnotationExtractor. Regex-based PatternExtractor only;
 * a string-literal-aware AST extractor is left for a follow-up.
 */
export class SourceAnnotationExtractor {
  static async enumerate(
    tag: string | null = null,
    options: { dirs?: readonly string[]; tag?: boolean } = {},
  ): Promise<string> {
    const extractor = new SourceAnnotationExtractor(tag ?? tags.join("|"));
    const results = await extractor.find(options.dirs ?? directories);
    return extractor.display(results, { tag: options.tag });
  }

  constructor(public readonly tag: string) {}

  async find(dirs: readonly string[]): Promise<Map<string, Annotation[]>> {
    const merged = new Map<string, Annotation[]>();
    for (const dir of dirs) for (const [k, v] of await this.findIn(dir)) merged.set(k, v);
    return merged;
  }

  async findIn(dir: string): Promise<Map<string, Annotation[]>> {
    const results = new Map<string, Annotation[]>();
    const fs = await getFsAsync();
    const path = await getPathAsync();
    if (!(await fs.exists(dir))) return results;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const item = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        for (const [k, v] of await this.findIn(item)) results.set(k, v);
        continue;
      }
      const ext = extensions.find((e) => e.test.test(item));
      if (!ext) continue;
      const annotations = await extractFromFile(item, ext.builder(this.tag));
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

async function extractFromFile(file: string, pattern: RegExp): Promise<Annotation[]> {
  const fs = await getFsAsync();
  if (!fs.readFile) throw new Error("fsAdapter.readFile (async) is required");
  const contents = await fs.readFile(file, "utf-8");
  const out: Annotation[] = [];
  let lineno = 0;
  for (const line of contents.split(/\r?\n/)) {
    lineno++;
    const m = line.match(pattern);
    if (m) out.push(new Annotation(lineno, m[1], m[2]));
  }
  return out;
}
