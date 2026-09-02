import { getFsAsync, getPathAsync } from "@blazetrails/activesupport";

export interface AnnotationOptions {
  tag?: boolean;
  indent?: number;
}

export type ExtensionBuilder = (tagPattern: string) => RegExp;

const DEFAULT_DIRECTORIES = ["app", "config", "db", "lib", "test"];
const DEFAULT_TAGS = ["OPTIMIZE", "FIXME", "TODO"];

/**
 * Mirrors: Rails::SourceAnnotationExtractor::Annotation
 * (`source_annotation_extractor.rb:71-101`) — the registers and the three
 * registrars that mutate them are class-level state on this class, not on the
 * enclosing extractor.
 */
export class Annotation {
  static directories: string[] = [...DEFAULT_DIRECTORIES];
  static tags: string[] = [...DEFAULT_TAGS];
  static extensions: Array<{ test: RegExp; builder: ExtensionBuilder }> = [];

  /**
   * Registers additional directories to be included
   *   Annotation.registerDirectories("spec", "another")
   *
   * Mirrors: `self.register_directories` (`source_annotation_extractor.rb:78`).
   */
  static registerDirectories(...dirs: string[]): void {
    this.directories.push(...dirs);
  }

  /**
   * Registers additional tags
   *   Annotation.registerTags("TESTME", "DEPRECATEME")
   *
   * Mirrors: `self.register_tags` (`source_annotation_extractor.rb:88`).
   */
  static registerTags(...additionalTags: string[]): void {
    this.tags.push(...additionalTags);
  }

  /**
   * Registers new Annotations File Extensions
   *   Annotation.registerExtensions("css", "scss", "sass", "less", "js", (tag) =>
   *     new RegExp(`//\\s*(${tag}):?\\s*(.*)$`))
   *
   * Mirrors: `self.register_extensions` (`source_annotation_extractor.rb:98-99`).
   * Ruby's trailing `&block` is the `ExtensionBuilder` argument — the settled
   * trails spelling for a block — so it rides the splat's last slot.
   */
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

/**
 * Test-only convenience: reset the directories/tags/extensions registries.
 *
 * @noRailsEquivalent PERMANENT
 */
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

/**
 * Ports Rails::SourceAnnotationExtractor. Regex-based PatternExtractor only;
 * a string-literal-aware AST extractor is left for a follow-up.
 */
export class SourceAnnotationExtractor {
  static async enumerate(
    tag: string | null = null,
    options: AnnotationOptions & { dirs?: readonly string[] } = {},
  ): Promise<string> {
    tag ??= Annotation.tags.join("|");
    const extractor = new SourceAnnotationExtractor(tag);
    const dirs = options.dirs ?? Annotation.directories;
    delete options.dirs;
    return extractor.display(await extractor.find(dirs), options);
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
      const ext = Annotation.extensions.find((e) => e.test.test(item));
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
