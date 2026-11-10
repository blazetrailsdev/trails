import { classAttribute } from "@blazetrails/activesupport";
import { File, STDOUT, getFs, sprintf } from "@blazetrails/ruby-compat";
import { CodeStatisticsCalculator } from "./code-statistics-calculator.js";

export type DirectoryPair = readonly [label: string, path: string];

export const DIRECTORIES: DirectoryPair[] = [
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

export const TEST_TYPES: string[] = [
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

const HEADERS = { lines: " Lines", codeLines: "   LOC", classes: "Classes", methods: "Methods" };

type HeaderKey = keyof typeof HEADERS;

const HEADER_KEYS = Object.keys(HEADERS) as HeaderKey[];

export class CodeStatistics {
  declare static directories: DirectoryPair[];
  declare static isDirectories: boolean;
  declare static testTypes: string[];
  declare static isTestTypes: boolean;

  static {
    classAttribute.call(this, "directories", { default: DIRECTORIES });
    classAttribute.call(this, "testTypes", { default: TEST_TYPES });
  }

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
  private pairs: DirectoryPair[];

  private constructor(...pairs: DirectoryPair[]) {
    this.pairs = pairs;
  }

  static async create(...pairs: DirectoryPair[]): Promise<CodeStatistics> {
    const inst = new CodeStatistics(...pairs);
    inst.statistics = await inst.calculateStatistics();
    if (pairs.length > 1) inst.total = inst.calculateTotal();
    return inst;
  }

  toString(): string {
    this.printHeader();
    for (const pair of this.pairs) this.printLine(pair[0], this.statistics.get(pair[0])!);
    this.printSplitter();

    if (this.total) {
      this.printLine("Total", this.total);
      this.printSplitter();
    }

    this.printCodeTestStats();
    return "";
  }

  /** @internal */
  private async calculateStatistics(): Promise<Map<string, CodeStatisticsCalculator>> {
    const statistics = new Map<string, CodeStatisticsCalculator>();
    for (const pair of this.pairs) {
      statistics.set(pair[0], await this.calculateDirectoryStatistics(pair[1]));
    }
    return statistics;
  }

  /** @internal */
  private async calculateDirectoryStatistics(
    directory: string,
    pattern = /^(?!\.).*?\.(rb|js|ts|tsx|css|scss|coffee|rake|tse)$/,
  ): Promise<CodeStatisticsCalculator> {
    const stats = new CodeStatisticsCalculator();

    for (const fileName of await getFs().readdir!(directory)) {
      const path = `${directory}/${fileName}`;

      if (File.isDirectory(path) && !fileName.startsWith(".")) {
        stats.add(await this.calculateDirectoryStatistics(path, pattern));
      } else if (pattern.test(fileName)) {
        await stats.addByFilePath(path);
      }
    }

    return stats;
  }

  /** @internal */
  private calculateTotal(): CodeStatisticsCalculator {
    const total = new CodeStatisticsCalculator();
    for (const pair of this.statistics) total.add(pair[1]);
    return total;
  }

  /** @internal */
  private calculateCode(): number {
    let codeLoc = 0;
    for (const [k, v] of this.statistics) {
      if (!CodeStatistics.testTypes.includes(k)) codeLoc += v.codeLines;
    }
    return codeLoc;
  }

  /** @internal */
  private calculateTests(): number {
    let testLoc = 0;
    for (const [k, v] of this.statistics) {
      if (CodeStatistics.testTypes.includes(k)) testLoc += v.codeLines;
    }
    return testLoc;
  }

  /** @internal */
  private widthFor(label: HeaderKey): number {
    let sum = 0;
    for (const s of this.statistics.values()) sum += s[label];
    return Math.max(String(sum).length, HEADERS[label].length);
  }

  /** @internal */
  private printHeader(): void {
    this.printSplitter();
    STDOUT.print("| Name                ");
    for (const k of HEADER_KEYS) STDOUT.print(` | ${HEADERS[k].padStart(this.widthFor(k))}`);
    STDOUT.puts(" | M/C | LOC/M |");
    this.printSplitter();
  }

  /** @internal */
  private printSplitter(): void {
    STDOUT.print("+----------------------");
    for (const k of HEADER_KEYS) STDOUT.print(`+${"-".repeat(this.widthFor(k) + 2)}`);
    STDOUT.puts("+-----+-------+");
  }

  /** @internal */
  private printLine(name: string, statistics: CodeStatisticsCalculator): void {
    const mOverC = statistics.classes > 0 ? Math.floor(statistics.methods / statistics.classes) : 0;
    const locOverM =
      statistics.methods > 0 ? Math.floor(statistics.codeLines / statistics.methods) - 2 : 0;

    STDOUT.print(`| ${name.padEnd(20)} `);
    for (const k of HEADER_KEYS)
      STDOUT.print(`| ${String(statistics[k]).padStart(this.widthFor(k))} `);
    STDOUT.puts(`| ${String(mOverC).padStart(3)} | ${String(locOverM).padStart(5)} |`);
  }

  /** @internal */
  private printCodeTestStats(): void {
    const code = this.calculateCode();
    const tests = this.calculateTests();

    STDOUT.puts(
      `  Code LOC: ${code}     Test LOC: ${tests}     Code to Test Ratio: 1:${sprintf("%.1f", tests / code)}`,
    );
    STDOUT.puts("");
  }
}
