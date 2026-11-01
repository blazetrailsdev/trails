import { Formatter, SpellChecker } from "@blazetrails/did-you-mean";
import { FileList } from "@blazetrails/rake";
import {
  ArgumentError,
  File,
  LoadError,
  Range,
  Shellwords,
  env,
  exit,
  getFs,
  rbFSystem,
  regexpEscape,
  setEnv,
  setVerbose,
  type Method,
} from "@blazetrails/ruby-compat";
import { TestParser } from "./test-parser.js";

interface Runnable {
  isMethodDefined(method: string): boolean;
  instanceMethod(method: string): Pick<Method, "sourceLocation">;
}

type Pattern = [string, string[]];

export class InvalidTestError extends ArgumentError {
  constructor(path: string, suggestion: string) {
    super(`Could not load test file: ${path}.\n${suggestion}`.trimEnd());
  }

  backtrace(..._args: unknown[]): string[] {
    return [];
  }
}

export class Runner {
  static readonly TEST_FOLDERS = [
    "models",
    "helpers",
    "channels",
    "controllers",
    "mailers",
    "integration",
    "jobs",
    "mailboxes",
  ];
  static readonly PATH_ARGUMENT_PATTERN = /^(?!\/.+\/$)[.\w]*[/\\]/m;
  static readonly filters: Pattern[] = [];

  static attachBeforeLoadOptions(opts: { on(...args: unknown[]): unknown }): void {
    opts.on("--warnings", "-w", "Run with Ruby warnings enabled", () => {});
    opts.on("-e", "--environment ENV", "Run tests in the ENV environment", () => {});
  }

  static parseOptions(argv: string[]): void {
    const index = (arg: string): number | null => {
      const found = argv.indexOf(arg);
      return found === -1 ? null : found;
    };

    const envIndex = index("--environment") ?? index("-e");
    let environment: string | undefined;
    if (envIndex != null) {
      argv.splice(envIndex, 1);
      environment = argv.splice(envIndex, 1)[0].trim();
    }
    setEnv("TRAILS_ENV", environment || "test");

    const wIndex = index("--warnings") ?? index("-w");
    if (wIndex != null) setVerbose(argv.splice(wIndex, 1)[0]);
  }

  /** @missingRailsCall system — PERMANENT */
  static async runFromRake(testCommand: string, argv: string[] = []): Promise<boolean> {
    const success = await rbFSystem(
      "trails",
      testCommand,
      ...argv,
      ...Shellwords.shellwords(env.TESTOPTS || ""),
    );
    return success || exit(false);
  }

  /** @inventedArm rbFSystem — PERMANENT */
  static async run(argv: string[] = []): Promise<void> {
    const tests = await this.loadTests(argv);
    const locations = await this.testLocations(tests);
    if (tests.length > 0 && locations.length === 0) return;

    const success = await rbFSystem("vitest", "run", ...locations, ...this.nameFilter(argv));
    if (!success) exit(false);
  }

  static async loadTests(argv: string[]): Promise<string[]> {
    const patterns = await this.extractFilters(argv);
    const tests = this.listTests(patterns);
    const paths = (await tests.toA()) as string[];
    for (const path of paths) {
      const absPath = File.expandPath(path);
      try {
        if (!(await File.isExistAsync(absPath))) {
          const error = new LoadError(`cannot load such file -- ${absPath}`);
          error.path = absPath;
          throw error;
        }
      } catch (exception) {
        if (exception instanceof LoadError && exception.path === absPath) {
          const allTests = (await this.listTests([this.defaultTestGlob()]).toA()) as string[];
          const corrections = new SpellChecker({ dictionary: allTests }).correct(path);

          if (corrections.length === 0) {
            throw exception;
          }
          throw new InvalidTestError(path, Formatter.messageFor(corrections));
        } else {
          throw exception;
        }
      }
    }
    return paths;
  }

  static composeFilter(runnable: Runnable, filter: unknown): unknown {
    filter = this.normalizeDeclarativeTestFilter(filter);

    if (this.filters.some(([, lines]) => lines.length > 0)) {
      return new CompositeFilter(runnable, filter, this.filters);
    } else {
      return filter;
    }
  }

  /** @internal */
  private static async extractFilters(argv: string[]): Promise<string[]> {
    const patterns: string[] = [];
    for (let path of argv) {
      if (!this.isPathArgument(path)) continue;

      path = path.replaceAll("\\", "/");
      if (/(:\d+(-\d+)?)+$/.test(path)) {
        const [file, ...lines] = path.split(":");
        this.filters.push([file, lines]);
        patterns.push(file);
      } else if (await File.isDirectoryAsync(path)) {
        patterns.push(`${path}/**/*.test.ts`);
      } else {
        this.filters.push([path, []]);
        patterns.push(path);
      }
    }
    return patterns;
  }

  /** @internal */
  private static defaultTestGlob(): string {
    return env.DEFAULT_TEST || "test/**/*.test.ts";
  }

  /** @internal */
  private static defaultTestExcludeGlob(): string {
    return env.DEFAULT_TEST_EXCLUDE || "test/{system,dummy,fixtures}/**/*.test.ts";
  }

  /** @internal */
  private static isRegexpFilter(arg: string): boolean {
    return arg.startsWith("/") && arg.endsWith("/");
  }

  /** @internal */
  private static isPathArgument(arg: string): boolean {
    return this.PATH_ARGUMENT_PATTERN.test(arg);
  }

  /** @internal */
  private static listTests(patterns: string[]): FileList {
    const tests = FileList.get(patterns.length > 0 ? patterns : this.defaultTestGlob());
    if (patterns.length === 0) void tests.exclude(this.defaultTestExcludeGlob());
    void tests.exclude(/test\/isolation\/assets\/node_modules/);
    return tests;
  }

  /** @internal */
  private static normalizeDeclarativeTestFilter(filter: unknown): unknown {
    if (typeof filter === "string") {
      if (this.isRegexpFilter(filter)) {
        filter = `${filter.replace(/\s+/g, "_").replace(/\/$/, "")}|${filter.replace(/^\//, "")}`;
      } else if (!filter.startsWith("test_")) {
        filter = `test_${filter.replace(/\s+/g, "_")}`;
      }
    }
    return filter;
  }

  /** @internal */
  private static async testLocations(tests: string[]): Promise<string[]> {
    const locations: string[] = [];
    for (const path of tests) {
      const patterns = this.filters.filter(([file]) => file === path);
      if (patterns.length === 0 || patterns.some(([, lines]) => lines.length === 0)) {
        locations.push(path);
        continue;
      }

      const source = (await getFs().readFile(path, "utf8")).split("\n");
      const ranges = TestParser.ranges(path);
      const wanted = patterns.flatMap(([, lines]) => lines.map(lineRange));
      for (const [begin, end] of Object.entries(ranges)) {
        const test = new Range(Number(begin), end);
        if (!/^\s*(?:it|test)(?:\.\w+)*\(/.test(source[Number(begin) - 1])) continue;
        if (wanted.some((range) => range.overlaps(test))) locations.push(`${path}:${begin}`);
      }
    }
    return locations;
  }

  /** @internal */
  private static nameFilter(argv: string[]): string[] {
    const index = argv.findIndex((arg) => arg === "-n" || arg === "--name");
    if (index === -1 || argv[index + 1] === undefined) return [];
    const name = argv[index + 1];
    return ["-t", this.isRegexpFilter(name) ? name.slice(1, -1) : regexpEscape(name)];
  }
}

function lineRange(lineOrRange: string): Range<number> {
  const [first, last] = lineOrRange.split("-").map(Number);
  return new Range(first, last ?? first);
}

export class CompositeFilter {
  readonly namedFilter: string | RegExp | null | undefined;
  /** @internal */
  private _runnable: Runnable;
  /** @internal */
  private _filters: (string | RegExp | Filter)[];

  constructor(runnable: Runnable, filter: unknown, patterns: Pattern[]) {
    this._runnable = runnable;
    this.namedFilter = this.deriveNamedFilter(filter);
    this._filters = [this.namedFilter, ...this.deriveLineFilters(patterns)].filter(
      (filter) => filter != null,
    );
  }

  caseEquals(method: string): boolean {
    return this._filters.some((filter) => {
      if (filter instanceof RegExp) return filter.test(method);
      if (typeof filter === "string") return filter === method;
      return filter.caseEquals(method);
    });
  }

  /** @internal */
  private deriveNamedFilter(filter: unknown): string | RegExp | null | undefined {
    if (filter instanceof CompositeFilter) {
      return filter.namedFilter;
    }
    const match = typeof filter === "string" ? /\/(.*)\//.exec(filter) : null;
    if (match) {
      return new RegExp(match[1]);
    } else if (typeof filter === "string") {
      return filter;
    }
    return undefined;
  }

  /** @internal */
  private deriveLineFilters(patterns: Pattern[]): Filter[] {
    return patterns.flatMap(([file, lines]) => {
      if (lines.length === 0) {
        return file ? [new Filter(this._runnable, file, null)] : [];
      } else {
        return lines.map((line) => new Filter(this._runnable, file, line));
      }
    });
  }
}

export class Filter {
  /** @internal */
  private _runnable: Runnable;
  /** @internal */
  private _file: string;
  /** @internal */
  private _lineRange?: Range<number>;

  constructor(runnable: Runnable, file: string, lineOrRange: string | null) {
    this._runnable = runnable;
    this._file = File.expandPath(file);
    if (lineOrRange != null) {
      this._lineRange = lineRange(lineOrRange);
    }
  }

  caseEquals(method: string): boolean {
    if (!this._runnable.isMethodDefined(method)) return false;

    if (this._lineRange) {
      const [testFile, testRange] = this.definitionFor(this._runnable.instanceMethod(method))!;
      return testFile === this._file && this._lineRange.overlaps(testRange);
    } else {
      return this._runnable.instanceMethod(method).sourceLocation()![0] === this._file;
    }
  }

  /** @internal */
  private definitionFor(method: Pick<Method, "sourceLocation">): [string, Range<number>] | null {
    return TestParser.definitionFor(method);
  }
}
