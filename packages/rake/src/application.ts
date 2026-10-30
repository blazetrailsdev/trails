import {
  ArgumentError,
  Dir,
  File,
  LOADED_FEATURES,
  LOAD_PATH,
  LoadError,
  OptionParser,
  RuntimeError,
  STDERR,
  STDOUT,
  StandardError,
  SystemExit,
  argv as ARGV,
  env as ENV,
  exit,
  include,
  puts,
  rbFRequireFile,
  rbModName,
  rbObjRespondTo,
  rtest,
  setEnv,
  stderr as $stderr,
  stdout as $stdout,
} from "@blazetrails/ruby-compat";
import { DefaultLoader } from "./default-loader.js";
import { FileUtilsExt } from "./file-utils-ext.js";
import { Rake } from "./rake-module.js";
import { Scope } from "./scope.js";
import { TaskManager } from "./task-manager.js";
import { TraceOutput } from "./trace-output.js";
import { VERSION } from "./version.js";

export class CommandLineOptionError extends StandardError {}

type OutputStream = typeof STDERR;
type Loader = { load(fn: string): unknown };
type OptionSpec = (string | ((value: never) => unknown))[];

export interface ApplicationOptions {
  alwaysMultitask?: boolean;
  backtrace?: boolean;
  buildAll?: boolean;
  dryrun?: boolean;
  ignoreDeprecate?: boolean;
  ignoreSystem?: boolean;
  jobStats?: boolean | string;
  loadSystem?: boolean;
  nosearch?: boolean;
  rakelib?: string[];
  showAllTasks?: boolean;
  showPrereqs?: boolean;
  showTaskPattern?: RegExp | null;
  showTasks?: string | null;
  silent?: boolean;
  suppressBacktracePattern?: RegExp | null;
  threadPoolSize?: number;
  trace?: boolean;
  traceOutput?: OutputStream;
  traceRules?: boolean;
}

const DEFAULT_RAKEFILES = ["rakefile.ts", "Rakefile.ts"] as const;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Application {
  static DEFAULT_RAKEFILES = DEFAULT_RAKEFILES;

  name = "rake";
  originalDir: string;
  rakefile: string | null = null;
  terminalColumns: number;
  topLevelTasks: string[] = [];
  ttyOutput: boolean;

  /** @internal */ _rakefiles: string[] = [...DEFAULT_RAKEFILES];
  /** @internal */ _pendingImports: string[] = [];
  /** @internal */ _imported: string[] = [];
  /** @internal */ _loaders: Record<string, Loader> = {};
  /** @internal */ _defaultLoader = new DefaultLoader();
  /** @internal */ _options: ApplicationOptions | undefined;
  /** @internal */ _systemDir: string | undefined;
  /** @internal */ _displayExceptionDetailsSeen: Error[] | undefined;

  /**
   * @inlinedFrom Rake::TaskManager#initialize rake/v13.2.1/lib/rake/task_manager.rb:9-15
   * @missingRailsArgs add_loader — PERMANENT
   */
  constructor() {
    this._tasks = new Map();
    this._rules = [];
    this._scope = Scope.make() as Scope;
    this.lastDescription = null;
    this.originalDir = Dir.pwd();
    this.addLoader("js", new DefaultLoader());
    this.addLoader("rf", new DefaultLoader());
    this.addLoader("ts", new DefaultLoader());
    this.ttyOutput = STDOUT.isTty();
    this.terminalColumns = parseInt(ENV["RAKE_COLUMNS"] ?? "", 10) || 0;

    this.setDefaultOptions();
  }

  /** @missingRailsArgs handle_options — PERMANENT */
  async init(appName = "rake", argv: readonly string[] = ARGV): Promise<void> {
    await this.standardExceptionHandling(async () => {
      this.name = appName;
      let args: string[];
      try {
        args = await this.handleOptions(argv);
      } catch (e) {
        if (!(e instanceof ArgumentError)) throw e;
        args = await this.handleOptions(ARGV);
      }
      this.loadDebugAtStopFeature();
      this.collectCommandLineTasks(args);
    });
  }

  /** @internal */
  private loadDebugAtStopFeature(): void {
    if (ENV["RAKE_DEBUG"] == null) return;
  }

  async loadRakefile(): Promise<void> {
    await this.standardExceptionHandling(() => this.rawLoadRakefile());
  }

  addLoader(ext: string, loader: Loader): void {
    if (!/^\./.test(ext)) ext = `.${ext}`;
    this._loaders[ext] = loader;
  }

  get options(): ApplicationOptions {
    return (this._options ??= {});
  }

  /** @internal */
  async standardExceptionHandling<T>(block: () => T | Promise<T>): Promise<T> {
    try {
      return await block();
    } catch (ex) {
      if (ex instanceof SystemExit) throw ex;
      if (ex instanceof OptionParser.InvalidOption) {
        puts.call($stderr, ex.message);
        exit(false);
      }
      this.displayErrorMessage(ex as Error);
      return this.exitBecauseOfException(ex as Error);
    }
  }

  /** @internal */
  exitBecauseOfException(ex: Error): never {
    void ex;
    exit(false);
  }

  /** @internal */
  displayErrorMessage(ex: Error): void {
    this.trace(`${this.name} aborted!`);
    this.displayExceptionDetails(ex);
    if (this.hasChain(ex)) this.trace(`Tasks: ${(ex as { chain?: unknown }).chain}`);
    if (!this.options.backtrace) this.trace("(See full trace by running task with --trace)");
  }

  /** @internal */
  displayExceptionDetails(ex: Error): void {
    this.displayExceptionDetailsSeen.push(ex);

    this.displayExceptionMessageDetails(ex);
    if (this.hasCause(ex)) this.displayCauseDetails(ex.cause as Error);
  }

  /** @internal */
  displayCauseDetails(ex: Error): void {
    if (this.displayExceptionDetailsSeen.includes(ex)) return;

    this.trace("\nCaused by:");
    this.displayExceptionDetails(ex);
  }

  /** @internal */
  get displayExceptionDetailsSeen(): Error[] {
    return (this._displayExceptionDetailsSeen ??= []);
  }

  /** @internal */
  hasCause(ex: Error): boolean {
    return ex.cause != null;
  }

  /** @internal */
  displayExceptionMessageDetails(ex: Error): void {
    if ((ex.constructor as unknown) === RuntimeError) {
      this.trace(ex.message);
    } else if (rbObjRespondTo(ex, "detailedMessage")) {
      const { detailedMessage } = ex as unknown as { detailedMessage(o: object): string };
      this.trace(`${rbModName(ex.constructor)}: ${detailedMessage.call(ex, { highlight: false })}`);
    } else {
      this.trace(`${rbModName(ex.constructor)}: ${ex.message}`);
    }
  }

  /** @internal */
  private hasChain(exception: Error): boolean {
    return rtest((exception as { chain?: unknown }).chain);
  }

  /**
   * @internal
   * @missingRailsCall glob — CONVERGEABLE rake-file-list-port
   */
  async haveRakefile(): Promise<string | null> {
    for (const fn of this._rakefiles) {
      if (await File.isExistAsync(fn)) {
        const others = await Dir.globAsync(fn, File.FNM_CASEFOLD);
        return others.length === 1 ? others[0] : fn;
      } else if (fn === "") {
        return fn;
      }
    }
    return null;
  }

  /** @internal */
  trace(...strings: string[]): void {
    this.options.traceOutput ??= STDERR;
    this.traceOn(this.options.traceOutput, ...strings);
  }

  /** @internal */
  private sortOptions(options: OptionSpec[]): OptionSpec[] {
    const key = (opt: OptionSpec): string[] =>
      opt
        .filter((o): o is string => typeof o === "string" && /^-/.test(o))
        .map((o) => o.toLowerCase())
        .sort()
        .reverse();
    return [...options].sort((a, b) => {
      const [x, y] = [key(a), key(b)];
      for (let i = 0; i < Math.min(x.length, y.length); i++) {
        if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
      }
      return x.length - y.length;
    });
  }

  /**
   * @internal
   * @inventedArm eval — PERMANENT
   */
  standardRakeOptions(): OptionSpec[] {
    const options = this.options;
    return this.sortOptions([
      [
        "--all",
        "-A",
        "Show all tasks, even uncommented ones (in combination with -T or -D)",
        (value: boolean) => {
          options.showAllTasks = value;
        },
      ],
      [
        "--backtrace=[OUT]",
        "Enable full backtrace.  OUT can be stderr (default) or stdout.",
        (value: string | null) => {
          options.backtrace = true;
          this.selectTraceOutput(options, "backtrace", value);
        },
      ],
      [
        "--build-all",
        "-B",
        "Build all prerequisites, including those which are up-to-date.",
        () => {
          options.buildAll = true;
        },
      ],
      [
        "--comments",
        "Show commented tasks only",
        (value: boolean) => {
          options.showAllTasks = !value;
        },
      ],
      [
        "--describe",
        "-D [PATTERN]",
        "Describe the tasks (matching optional PATTERN), then exit.",
        (value: string | null) => {
          this.selectTasksToShow(options, "describe", value);
        },
      ],
      [
        "--directory",
        "-C [DIRECTORY]",
        "Change to DIRECTORY before doing anything.",
        (value: string) => {
          Dir.chdir(value);
          this.originalDir = Dir.pwd();
        },
      ],
      [
        "--dry-run",
        "-n",
        "Do a dry run without executing actions.",
        () => {
          FileUtilsExt.verbose(true);
          FileUtilsExt.nowrite(true);
          options.dryrun = true;
          options.trace = true;
        },
      ],
      [
        "--execute",
        "-e CODE",
        "Execute some Ruby code and exit.",
        (value: string) => {
          (0, eval)(value);
          exit();
        },
      ],
      [
        "--execute-print",
        "-p CODE",
        "Execute some Ruby code, print the result, then exit.",
        (value: string) => {
          puts.call($stdout, (0, eval)(value));
          exit();
        },
      ],
      [
        "--execute-continue",
        "-E CODE",
        "Execute some Ruby code, then continue with normal task processing.",
        (value: string) => (0, eval)(value),
      ],
      [
        "--jobs",
        "-j [NUMBER]",
        "Specifies the maximum number of tasks to execute in parallel. " +
          "(default is number of CPU cores + 4)",
        (value: string | number | null) => {
          if (value == null || value === "") {
            value = Infinity;
          } else if (/^\d+$/m.test(value as string)) {
            value = parseInt(value as string, 10);
          } else {
            value = Rake.suggestedThreadCount();
          }
          if (value < 1) value = 1;
          options.threadPoolSize = value - 1;
        },
      ],
      [
        "--job-stats [LEVEL]",
        "Display job statistics. LEVEL=history displays a complete job list",
        (value: string | null) => {
          if (value != null && /^history/im.test(value)) {
            options.jobStats = "history";
          } else {
            options.jobStats = true;
          }
        },
      ],
      [
        "--libdir",
        "-I LIBDIR",
        "Include LIBDIR in the search path for required modules.",
        (value: string) => LOAD_PATH.push(value),
      ],
      [
        "--multitask",
        "-m",
        "Treat all tasks as multitasks.",
        () => {
          options.alwaysMultitask = true;
        },
      ],
      [
        "--no-search",
        "--nosearch",
        "-N",
        "Do not search parent directories for the Rakefile.",
        () => {
          options.nosearch = true;
        },
      ],
      [
        "--prereqs",
        "-P",
        "Display the tasks and dependencies, then exit.",
        () => {
          options.showPrereqs = true;
        },
      ],
      [
        "--quiet",
        "-q",
        "Do not log messages to standard output.",
        () => FileUtilsExt.verbose(false),
      ],
      [
        "--rakefile",
        "-f [FILENAME]",
        "Use FILENAME as the rakefile to search for.",
        (value: string | null) => {
          value ??= "";
          this._rakefiles.length = 0;
          this._rakefiles.push(value);
        },
      ],
      [
        "--rakelibdir",
        "--rakelib",
        "-R RAKELIBDIR",
        "Auto-import any .rake files in RAKELIBDIR. (default is 'rakelib')",
        (value: string) => {
          options.rakelib = value.split(File.PATH_SEPARATOR);
        },
      ],
      [
        "--require",
        "-r MODULE",
        "Require MODULE before executing rakefile.",
        async (value: string) => {
          try {
            await rbFRequireFile(value);
          } catch (ex) {
            if (!(ex instanceof LoadError)) throw ex;
            try {
              await this.rakeRequire(value);
            } catch (e) {
              if (e instanceof LoadError) throw ex;
              throw e;
            }
          }
        },
      ],
      [
        "--rules",
        "Trace the rules resolution.",
        () => {
          options.traceRules = true;
        },
      ],
      [
        "--silent",
        "-s",
        "Like --quiet, but also suppresses the 'in directory' announcement.",
        () => {
          FileUtilsExt.verbose(false);
          options.silent = true;
        },
      ],
      [
        "--suppress-backtrace PATTERN",
        "Suppress backtrace lines matching regexp PATTERN. Ignored if --trace is on.",
        (value: string) => {
          options.suppressBacktracePattern = new RegExp(value);
        },
      ],
      [
        "--system",
        "-g",
        "Using system wide (global) rakefiles (usually '~/.rake/*.rake').",
        () => {
          options.loadSystem = true;
        },
      ],
      [
        "--no-system",
        "--nosystem",
        "-G",
        "Use standard project Rakefile search paths, ignore system wide rakefiles.",
        () => {
          options.ignoreSystem = true;
        },
      ],
      [
        "--tasks",
        "-T [PATTERN]",
        "Display the tasks (matching optional PATTERN) with descriptions, then exit. " +
          "-AT combination displays all the tasks, including those without descriptions.",
        (value: string | null) => {
          this.selectTasksToShow(options, "tasks", value);
        },
      ],
      [
        "--trace=[OUT]",
        "-t",
        "Turn on invoke/execute tracing, enable full backtrace. " +
          "OUT can be stderr (default) or stdout.",
        (value: string | null) => {
          options.trace = true;
          options.backtrace = true;
          this.selectTraceOutput(options, "trace", value);
          FileUtilsExt.verbose(true);
        },
      ],
      ["--verbose", "-v", "Log message to standard output.", () => FileUtilsExt.verbose(true)],
      [
        "--version",
        "-V",
        "Display the program version.",
        () => {
          puts.call($stdout, `rake, version ${VERSION}`);
          exit();
        },
      ],
      [
        "--where",
        "-W [PATTERN]",
        "Describe the tasks (matching optional PATTERN), then exit.",
        (value: string | null) => {
          this.selectTasksToShow(options, "lines", value);
          options.showAllTasks = true;
        },
      ],
      [
        "--no-deprecation-warnings",
        "-X",
        "Disable the deprecation warnings.",
        () => {
          options.ignoreDeprecate = true;
        },
      ],
    ]);
  }

  /** @internal */
  private selectTasksToShow(
    options: ApplicationOptions,
    showTasks: string,
    value: string | null,
  ): void {
    options.showTasks = showTasks;
    options.showTaskPattern = new RegExp(value ?? "");
    TaskManager.recordTaskMetadata = true;
  }

  /** @internal */
  private selectTraceOutput(
    options: ApplicationOptions,
    traceOption: string,
    value: string | null,
  ): void {
    if (value != null) value = value.trim();
    if (value === "stdout") {
      options.traceOutput = STDOUT;
    } else if (value === "stderr" || value == null) {
      options.traceOutput = STDERR;
    } else {
      throw new CommandLineOptionError(`Unrecognized --${traceOption} option '${value}'`);
    }
  }

  /** @internal */
  async handleOptions(argv: readonly string[]): Promise<string[]> {
    this.setDefaultOptions();

    const opts = new OptionParser();
    opts.banner = `${Rake.application!.name} [-f rakefile] {options} targets...`;
    opts.separator("");
    opts.separator("Options are ...");

    opts.onTail("-h", "--help", "-H", "Display this help message.", () => {
      puts.call($stdout, opts.toString());
      exit();
    });

    for (const args of this.standardRakeOptions()) {
      opts.on(...(args as Parameters<OptionParser["on"]>));
    }
    await opts.environment("RAKEOPT");
    return opts.parse(argv);
  }

  /** @internal */
  async rakeRequire(
    fileName: string,
    paths: string[] = LOAD_PATH,
    loaded: string[] = LOADED_FEATURES,
  ): Promise<boolean> {
    const fn = fileName + ".ts";
    if (loaded.includes(fn)) return false;
    for (const path of paths) {
      const fullPath = File.join(path, fn);
      if (await File.isExistAsync(fullPath)) {
        await Rake.loadRakefile(File.expandPath(fullPath));
        loaded.push(fn);
        return true;
      }
    }
    throw new LoadError(`Can't find ${fileName}`);
  }

  /** @internal */
  async findRakefileLocation(): Promise<[string, string] | null> {
    let here = Dir.pwd();
    try {
      let fn: string | null;
      while ((fn = await this.haveRakefile()) == null) {
        Dir.chdir("..");
        if (Dir.pwd() === here || this.options.nosearch) return null;
        here = Dir.pwd();
      }
      return [fn, here];
    } finally {
      Dir.chdir(Rake.originalDir());
    }
  }

  /** @internal */
  printRakefileDirectory(location: string | null): void {
    if (!(this.options.silent || this.originalDir === location)) {
      puts.call($stderr, `(in ${Dir.pwd()})`);
    }
  }

  /**
   * @internal
   * @missingRailsCall directory? — PERMANENT
   */
  async rawLoadRakefile(): Promise<void> {
    const [rakefile, location] = (await this.findRakefileLocation()) ?? [null, null];
    if (
      !this.options.ignoreSystem &&
      (this.options.loadSystem || rakefile == null) &&
      this.systemDir() &&
      (await File.isDirectoryAsync(this.systemDir()))
    ) {
      this.printRakefileDirectory(location);
      await this.glob(`${this.systemDir()}/*.ts`, (name) => this.addImport(name));
    } else {
      if (rakefile == null) {
        throw new RuntimeError(`No Rakefile found (looking for: ${this._rakefiles.join(", ")})`);
      }
      this.rakefile = rakefile;
      Dir.chdir(location);
      this.printRakefileDirectory(location);
      if (this.rakefile != null && this.rakefile !== "") {
        await Rake.loadRakefile(File.expandPath(this.rakefile));
      }
      for (const rlib of this.options.rakelib!) {
        await this.glob(`${rlib}/*.ts`, (name) => this.addImport(name));
      }
    }
    await this.loadImports();
  }

  /** @internal */
  private async glob(path: string, block: (name: string) => void): Promise<void> {
    (await Dir.globAsync(path.replaceAll("\\", "/"))).forEach(block);
  }

  /** @internal */
  systemDir(): string {
    return (this._systemDir ??= ENV["RAKE_SYSTEM"] ?? this.standardSystemDir());
  }

  /** @internal */
  private standardSystemDir(): string {
    return File.join(File.expandPath("~"), ".rake");
  }

  /** @internal */
  collectCommandLineTasks(args: string[]): void {
    this.topLevelTasks = [];
    for (const arg of args) {
      const m = arg.match(/^(\w+)=(.*)$/ms);
      if (m != null) {
        setEnv(m[1], m[2]);
      } else if (!/^-/m.test(arg)) {
        this.topLevelTasks.push(arg);
      }
    }
    if (this.topLevelTasks.length === 0) this.topLevelTasks.push(this.defaultTaskName());
  }

  /** @internal */
  defaultTaskName(): string {
    return "default";
  }

  /** @internal */
  addImport(fn: string): void {
    this._pendingImports.push(fn);
  }

  /** @internal */
  async loadImports(): Promise<void> {
    let fn: string | undefined;
    while ((fn = this._pendingImports.shift()) !== undefined) {
      if (this._imported.includes(fn)) continue;
      await this.lookup(fn)?.invoke();
      const ext = File.extname(fn);
      const loader = this._loaders[ext] ?? this._defaultLoader;
      await loader.load(fn);
      const fnTask = this.lookup(fn);
      if (fnTask != null && (await fnTask.isNeeded())) {
        fnTask.reenable();
        await fnTask.invoke();
        await loader.load(fn);
      }
      this._imported.push(fn);
    }
  }

  /** @internal */
  setDefaultOptions(): void {
    const options = this.options;
    options.alwaysMultitask = false;
    options.backtrace = false;
    options.buildAll = false;
    options.dryrun = false;
    options.ignoreDeprecate = false;
    options.ignoreSystem = false;
    options.jobStats = false;
    options.loadSystem = false;
    options.nosearch = false;
    options.rakelib = ["rakelib"];
    options.showAllTasks = false;
    options.showPrereqs = false;
    options.showTaskPattern = null;
    options.showTasks = null;
    options.silent = false;
    options.suppressBacktracePattern = null;
    options.threadPoolSize = Rake.suggestedThreadCount();
    options.trace = false;
    options.traceOutput = STDERR;
    options.traceRules = false;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Application extends TaskManager, TraceOutput {}
include(Application, TaskManager);
include(Application, TraceOutput);
Rake.Application = Application;
Rake.CommandLineOptionError = CommandLineOptionError;
