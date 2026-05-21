/**
 * Port of railties/lib/rails/code_statistics.rb.
 */

import { getFsAsync, getPathAsync } from "@blazetrails/activesupport";
import { CodeStatisticsCalculator } from "./code-statistics-calculator.js";

export type DirectoryPair = readonly [label: string, path: string];

export const DEFAULT_DIRECTORIES: DirectoryPair[] = [
  ["Controllers", "app/controllers"],
  ["Helpers", "app/helpers"],
  ["Jobs", "app/jobs"],
  ["Models", "app/models"],
  ["Mailers", "app/mailers"],
  ["Mailboxes", "app/mailboxes"],
  ["Channels", "app/channels"],
  ["Views", "app/views"],
  ["JavaScripts", "app/assets/javascripts"],
  ["Stylesheets", "app/assets/stylesheets"],
  ["JavaScript", "app/javascript"],
  ["Libraries", "lib/"],
  ["APIs", "app/apis"],
  ["Controller tests", "test/controllers"],
  ["Helper tests", "test/helpers"],
  ["Job tests", "test/jobs"],
  ["Model tests", "test/models"],
  ["Mailer tests", "test/mailers"],
  ["Mailbox tests", "test/mailboxes"],
  ["Channel tests", "test/channels"],
  ["Integration tests", "test/integration"],
  ["System tests", "test/system"],
];

export const DEFAULT_TEST_TYPES: string[] = [
  "Controller tests",
  "Helper tests",
  "Model tests",
  "Mailer tests",
  "Mailbox tests",
  "Channel tests",
  "Job tests",
  "Integration tests",
  "System tests",
];

const HEADERS = [
  { key: "lines", label: " Lines" },
  { key: "codeLines", label: "   LOC" },
  { key: "classes", label: "Classes" },
  { key: "methods", label: "Methods" },
] as const;

const FILE_PATTERN = /^(?!\.).*?\.(rb|js|ts|tsx|css|scss|coffee|rake|erb)$/;

export class CodeStatistics {
  static directories: DirectoryPair[] = [...DEFAULT_DIRECTORIES];
  static testTypes: string[] = [...DEFAULT_TEST_TYPES];

  static registerDirectory(
    label: string,
    path: string,
    opts: { testDirectory?: boolean } = {},
  ): void {
    this.directories.push([label, path]);
    if (opts.testDirectory) this.testTypes.push(label);
  }

  private statistics = new Map<string, CodeStatisticsCalculator>();
  private total: CodeStatisticsCalculator | null = null;

  private constructor(private pairs: DirectoryPair[]) {}

  /**
   * Build a CodeStatistics instance. Async because directory walking
   * uses the async `fsAdapter` (per the trailties async-only rule),
   * unlike Rails' synchronous `initialize`.
   */
  static async create(...pairs: DirectoryPair[]): Promise<CodeStatistics> {
    const inst = new CodeStatistics(pairs);
    for (const [label, dir] of pairs) inst.statistics.set(label, await inst.walk(dir));
    if (pairs.length > 1) {
      inst.total = new CodeStatisticsCalculator();
      for (const v of inst.statistics.values()) inst.total.add(v);
    }
    return inst;
  }

  private async walk(directory: string): Promise<CodeStatisticsCalculator> {
    const stats = new CodeStatisticsCalculator();
    const fs = await getFsAsync();
    const path = await getPathAsync();
    if (!fs.readdir || !fs.stat || !fs.readFile) {
      throw new Error("CodeStatistics requires async fsAdapter (readdir/stat/readFile).");
    }
    if (!(await fs.exists(directory))) return stats;
    const entries = await fs.readdir(directory);
    for (const name of entries) {
      const full = path.join(directory, name);
      const st = await fs.stat(full);
      if (st.isDirectory()) {
        if (!name.startsWith(".")) stats.add(await this.walk(full));
      } else if (FILE_PATTERN.test(name)) {
        await stats.addByFilePath(full, (p) => fs.readFile!(p, "utf-8") as Promise<string>);
      }
    }
    return stats;
  }

  private widthFor(key: (typeof HEADERS)[number]["key"], label: string): number {
    let sum = 0;
    for (const s of this.statistics.values()) sum += s[key];
    return Math.max(String(sum).length, label.length);
  }

  private splitter(): string {
    return (
      "+----------------------" +
      HEADERS.map((h) => "+" + "-".repeat(this.widthFor(h.key, h.label) + 2)).join("") +
      "+-----+-------+"
    );
  }

  private line(name: string, s: CodeStatisticsCalculator): string {
    const mOverC = s.classes > 0 ? Math.trunc(s.methods / s.classes) : 0;
    const locOverM = s.methods > 0 ? Math.trunc(s.codeLines / s.methods) - 2 : 0;
    const cells = HEADERS.map(
      (h) => `| ${String(s[h.key]).padStart(this.widthFor(h.key, h.label))} `,
    ).join("");
    return `| ${name.padEnd(20)} ${cells}| ${String(mOverC).padStart(3)} | ${String(locOverM).padStart(5)} |`;
  }

  toString(): string {
    const out: string[] = [];
    const splitter = this.splitter();
    out.push(splitter);
    out.push(
      "| Name                " +
        HEADERS.map((h) => ` | ${h.label.padStart(this.widthFor(h.key, h.label))}`).join("") +
        " | M/C | LOC/M |",
    );
    out.push(splitter);
    for (const [label] of this.pairs) out.push(this.line(label, this.statistics.get(label)!));
    out.push(splitter);
    if (this.total) {
      out.push(this.line("Total", this.total));
      out.push(splitter);
    }
    let code = 0,
      tests = 0;
    for (const [k, v] of this.statistics) {
      if (CodeStatistics.testTypes.includes(k)) tests += v.codeLines;
      else code += v.codeLines;
    }
    const ratio = code > 0 ? (tests / code).toFixed(1) : "0.0";
    out.push(`  Code LOC: ${code}     Test LOC: ${tests}     Code to Test Ratio: 1:${ratio}`);
    return out.join("\n");
  }
}
