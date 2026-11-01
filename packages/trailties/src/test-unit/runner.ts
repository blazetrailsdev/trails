import { Formatter, SpellChecker } from "@blazetrails/did-you-mean";
import { FileList } from "@blazetrails/rake";
import {
  ArgumentError,
  File,
  LoadError,
  Range,
  STDOUT,
  Shellwords,
  env,
  exit,
  rbFSystem,
  rbObjRespondTo,
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
    setEnv("TRAILS_ENV", environment ?? "test");

    const wIndex = index("--warnings") ?? index("-w");
    if (wIndex != null) setVerbose(argv.splice(wIndex, 1)[0]);
  }

  static async runFromRake(testCommand: string, argv: string[] = []): Promise<boolean> {
    const success = await rbFSystem(
      "trails",
      testCommand,
      ...argv,
      ...Shellwords.shellwords(env.TESTOPTS ?? ""),
    );
    return success || exit(false);
  }

  /** @inventedArm rbFSystem — PERMANENT */
  static async run(argv: string[] = []): Promise<void> {
    const tests = await this.loadTests(argv);
    this.rejectUnknownOptions(argv);
    const name = this.nameFilter(argv);
    const locations = await this.testLocations(tests, name);
    if (locations.length === 0) return;

    const lineFiltered = this.filters.some(([, lines]) => lines.length > 0);
    const success = await rbFSystem(
      "vitest",
      "run",
      ...locations,
      ...(name != null && !lineFiltered ? ["-t", name.source] : []),
      ...(argv.includes("-f") || argv.includes("--fail-fast") ? ["--bail", "1"] : []),
      ...(argv.includes("-v") || argv.includes("--verbose") ? ["--reporter", "verbose"] : []),
    );
    if (success == null) throw new LoadError("cannot load such file -- vitest");
    if (!success) exit(false);
  }

  static async loadTests(argv: string[]): Promise<string[]> {
    const patterns = await this.extractFilters(argv);
    const tests = await this.listTests(patterns);
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
          const allTests = (await (
            await this.listTests([this.defaultTestGlob()])
          ).toA()) as string[];
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
    return env.DEFAULT_TEST ?? "test/**/*.test.ts";
  }

  /** @internal */
  private static defaultTestExcludeGlob(): string {
    return env.DEFAULT_TEST_EXCLUDE ?? "test/{system,dummy,fixtures}/**/*.test.ts";
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
  private static async listTests(patterns: string[]): Promise<FileList> {
    const tests = FileList.get(patterns.length > 0 ? patterns : this.defaultTestGlob());
    if (patterns.length === 0) await tests.exclude(this.defaultTestExcludeGlob());
    await tests.exclude(/test\/isolation\/assets\/node_modules/);
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
  private static async testLocations(tests: string[], name: RegExp | null): Promise<string[]> {
    const locations: string[] = [];
    for (const path of tests) {
      const patterns = this.filters.filter(([file]) => file === path);
      const lineFiltered = this.filters.some(([, lines]) => lines.length > 0);
      if (!lineFiltered || patterns.some(([, lines]) => lines.length === 0)) {
        locations.push(path);
        continue;
      }

      const wanted = patterns.flatMap(([, lines]) =>
        lines.map((line) => {
          const [first, last] = line.split("-").map(Number);
          return new Range(first, last ?? first);
        }),
      );
      for (const [begin, end, title] of TestParser.calls(path)) {
        const test = new Range(begin, end);
        if (wanted.some((range) => range.overlaps(test)) || (title !== "" && name?.test(title))) {
          locations.push(`${path}:${begin}`);
        }
      }
    }
    return locations;
  }

  /** @internal */
  private static rejectUnknownOptions(argv: string[]): void {
    argv.forEach((arg, index) => {
      const value = argv[index - 1] === "-n" || argv[index - 1] === "--name";
      if (
        arg.startsWith("-") &&
        !value &&
        !/^(-n|--name\b|-f$|--fail-fast$|-v$|--verbose$)/.test(arg)
      ) {
        STDOUT.puts();
        STDOUT.puts(`invalid option: ${arg}`);
        STDOUT.puts();
        STDOUT.puts("Usage: trails test [PATHS...] [options]");
        STDOUT.puts("    -n, --name PATTERN   Filter run on /regexp/ or string.");
        STDOUT.puts("    -f, --fail-fast      Abort test run on first failure or error.");
        STDOUT.puts("    -v, --verbose        Verbose.");
        exit(1);
      }
    });
  }

  /** @internal */
  private static nameFilter(argv: string[]): RegExp | null {
    const index = argv.findIndex((arg) => /^(-n|--name)$/.test(arg));
    const inline = argv.map((arg) => /^(?:-n|--name=)(.+)$/.exec(arg)).find((match) => match);
    const name = index === -1 ? inline?.[1] : argv[index + 1];
    if (name == null) return null;
    return new RegExp(this.isRegexpFilter(name) ? name.slice(1, -1) : regexpEscape(name));
  }
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
    if (rbObjRespondTo(filter, "namedFilter")) {
      return (filter as CompositeFilter).namedFilter;
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
      const [first, last] = lineOrRange.split("-").map(Number);
      this._lineRange = new Range(first, last ?? first);
    }
  }

  caseEquals(method: string): boolean {
    if (!this._runnable.isMethodDefined(method)) return false;

    if (this._lineRange) {
      const definition = this.definitionFor(this._runnable.instanceMethod(method));
      return definition?.[0] === this._file && this._lineRange.overlaps(definition[1]);
    } else {
      return this._runnable.instanceMethod(method).sourceLocation()![0] === this._file;
    }
  }

  /** @internal */
  private definitionFor(method: Pick<Method, "sourceLocation">): [string, Range<number>] | null {
    return TestParser.definitionFor(method);
  }
}
