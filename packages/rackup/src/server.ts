import {
  Builder,
  CommonLogger,
  ContentLength,
  Lint,
  RELEASE,
  REQUEST_METHOD,
  ShowExceptions,
  TempfileReaper,
} from "@blazetrails/rack";
import {
  abort,
  ARGV,
  Errno,
  env,
  exit,
  File,
  Hash,
  NameError,
  LoadError,
  trap,
  OptionParser,
  Process,
  rbFRequire,
  rbRequireLoaded,
  atExit,
  createTmpname,
  FileUtils,
  rbFRequireFile,
  rbGvSet,
  rbInspect,
  LOAD_PATH,
  PP,
  rbProgname,
  setEnv,
  STDERR,
  STDOUT,
  warn,
} from "@blazetrails/ruby-compat";
import { Handler } from "./handler.js";

export interface ServerOptions {
  app?: unknown;
  builder?: string;
  config?: string;
  environment?: string;
  server?: string;
  daemonize?: boolean | string;
  pid?: string | null;
  Host?: string;
  Port?: number | string;
  AccessLog?: unknown[];
  debug?: boolean;
  warn?: boolean;
  quiet?: boolean;
  include?: string[];
  require?: string[];
  heapfile?: string;
  profileFile?: string;
  profileMode?: string;
  [name: string]: unknown;
}

type MiddlewareEntry = unknown[] | ((server: Server) => Promise<unknown[] | null>);

interface ObjectSpaceLike {
  traceObjectAllocationsStart(): void;
  dumpAll(options: { output: unknown }): unknown;
}

interface StackProfLike {
  run(options: { mode: string; out: unknown }, block: () => unknown): Promise<unknown>;
}

interface HandlerLike {
  name: string;
  validOptions?(): Record<string, string>;
  run(app: unknown, options: ServerOptions, block?: unknown): unknown;
  shutdown?(): unknown;
}

/** @noRailsEquivalent PERMANENT */
const loadPath: Record<string, (() => Promise<unknown>) | undefined> = {};

export class Options {
  /** @missingRailsArgs new — CONVERGEABLE ruby-compat-optparse-initialize-banner-width-indent */
  async parseBang(args: string[]): Promise<ServerOptions> {
    const options: ServerOptions = {};
    const optParser = new OptionParser();
    optParser.banner = "Usage: rackup [ruby options] [rack options] [rackup config]";

    optParser.separator("");
    optParser.separator("Ruby options:");

    let lineno = 1;
    optParser.on("-e", "--eval LINE", "evaluate a LINE of code", (line) => {
      (0, eval)(`${"\n".repeat(lineno - 1)}${line as string}\n//# sourceURL=-e`);
      lineno += 1;
    });

    optParser.on("-d", "--debug", "set debugging flags (set $DEBUG to true)", () => {
      options.debug = true;
    });
    optParser.on("-w", "--warn", "turn warnings on for your script", () => {
      options.warn = true;
    });
    optParser.on("-q", "--quiet", "turn off logging", () => {
      options.quiet = true;
    });

    optParser.on(
      "-I",
      "--include PATH",
      "specify $LOAD_PATH (may be used more than once)",
      (path) => {
        (options.include ??= []).push(...(path as string).split(":"));
      },
    );

    optParser.on(
      "-r",
      "--require LIBRARY",
      "require the library, before executing your script",
      (library) => {
        (options.require ??= []).push(library as string);
      },
    );

    optParser.separator("");
    optParser.separator("Rack options:");
    optParser.on(
      "-b",
      "--builder BUILDER_LINE",
      "evaluate a BUILDER_LINE of code as a builder script",
      (line) => {
        options.builder = line as string;
      },
    );

    optParser.on("-s", "--server SERVER", "serve using SERVER (thin/puma/webrick)", (s) => {
      options.server = s as string;
    });

    optParser.on("-o", "--host HOST", "listen on HOST (default: localhost)", (host) => {
      options.Host = host as string;
    });

    optParser.on("-p", "--port PORT", "use PORT (default: 9292)", (port) => {
      options.Port = port as string;
    });

    optParser.on(
      "-O",
      "--option NAME[=VALUE]",
      `pass VALUE to the server as option NAME. If no VALUE, sets it to true. Run '${rbProgname()} -s SERVER -h' to get a list of options for SERVER`,
      (option) => {
        const i = (option as string).indexOf("=");
        const name = i === -1 ? (option as string) : (option as string).slice(0, i);
        let value: string | boolean | undefined =
          i === -1 ? undefined : (option as string).slice(i + 1);
        if (value === undefined) value = true;
        options[name] = value;
      },
    );

    optParser.on(
      "-E",
      "--env ENVIRONMENT",
      "use ENVIRONMENT for defaults (default: development)",
      (e) => {
        options.environment = e as string;
      },
    );

    optParser.on("-D", "--daemonize", "run daemonized in the background", () => {
      options.daemonize ||= true;
    });

    optParser.on(
      "--daemonize-noclose",
      "run daemonized in the background without closing stdout/stderr",
      () => {
        options.daemonize = "noclose";
      },
    );

    optParser.on("-P", "--pid FILE", "file to store PID", (f) => {
      options.pid = File.expandPath(f as string);
    });

    optParser.separator("");
    optParser.separator("Profiling options:");

    optParser.on(
      "--heap HEAPFILE",
      "Build the application, then dump the heap to HEAPFILE",
      (e) => {
        options.heapfile = e as string;
      },
    );

    optParser.on(
      "--profile PROFILE",
      "Dump CPU or Memory profile to PROFILE (defaults to a tempfile)",
      (e) => {
        options.profileFile = e as string;
      },
    );

    optParser.on("--profile-mode MODE", "Profile mode (cpu|wall|object)", (e) => {
      if (!["cpu", "wall", "object"].includes(e as string)) {
        throw new OptionParser.InvalidOption(`unknown profile mode: ${e as string}`);
      }
      options.profileMode = e as string;
    });

    optParser.separator("");
    optParser.separator("Common options:");

    optParser.onTail("-h", "-?", "--help", "Show this message", async () => {
      STDOUT.puts(optParser.toString());
      STDOUT.puts(await this.handlerOpts(options));

      exit();
    });

    optParser.onTail("--version", "Show version", () => {
      STDOUT.puts(`Rack ${RELEASE}`);
      exit();
    });

    try {
      args = await optParser.parse(args);
    } catch (e) {
      if (!(e instanceof OptionParser.InvalidOption)) throw e;
      warn(e.message);
      abort(optParser.toString());
    }

    const last = args.at(-1);
    if (last != null && last !== "") options.config = last;
    return options;
  }

  async handlerOpts(options: ServerOptions): Promise<string> {
    try {
      const info: string[] = [];
      const server = ((await Handler.get(options.server)) ??
        (await Handler.default())) as HandlerLike | null;
      if (server != null && typeof server.validOptions === "function") {
        info.push("");
        info.push(`Server-specific options for ${server.name}:`);

        let hasOptions = false;
        for (const [name, description] of Object.entries(server.validOptions())) {
          if (/^(Host|Port)[^a-zA-Z]/.test(name)) continue;
          info.push(`  -O ${name.padEnd(21)} ${description}`);
          hasOptions = true;
        }
        if (!hasOptions) return "";
      }
      return info.join("\n");
    } catch (error) {
      if (!(error instanceof NameError || error instanceof LoadError)) throw error;
      return `Warning: Could not find handler specified (${options.server ?? "default"}) to determine handler-specific options`;
    }
  }
}

export class Server<TOptions extends ServerOptions = ServerOptions> {
  static Options = Options;

  static async start(options: ServerOptions | null = null): Promise<unknown> {
    return new this(options).start();
  }

  /** @internal */
  _ignoreOptions: string[];
  /** @internal */
  _useDefaultOptions: boolean;
  /** @internal */
  _options: ServerOptions = {};
  /** @internal */
  _app: unknown = null;
  /** @internal */
  _server: HandlerLike | null = null;
  /** @internal */
  _wrappedApp: unknown = null;
  /** @internal */
  _ready: Promise<void> = Promise.resolve();

  constructor(options: ServerOptions | null = null) {
    this._ignoreOptions = [];

    if (options != null) {
      this._useDefaultOptions = false;
      this._options = options;
      if (options.app != null) this._app = options.app;
    } else {
      this._useDefaultOptions = true;
      this._ready = this.parseOptions(ARGV).then((parsed) => {
        this._options = parsed;
      });
    }
  }

  setOptions(options: ServerOptions): void {
    this._options = options;
  }

  get options(): TOptions {
    const mergedOptions = this._useDefaultOptions
      ? { ...this.defaultOptions(), ...this._options }
      : this._options;
    return Object.fromEntries(
      Object.entries(mergedOptions).filter(([k]) => !this._ignoreOptions.includes(k)),
    ) as TOptions;
  }

  defaultOptions(): ServerOptions {
    const environment = env["RACK_ENV"] ?? "development";
    const defaultHost = environment === "development" ? "localhost" : "0.0.0.0";

    return {
      environment: environment,
      pid: null,
      Port: 9292,
      Host: defaultHost,
      AccessLog: [],
      config: "config.ru",
    };
  }

  async app(): Promise<unknown> {
    return (this._app ??= this.options.builder
      ? this.buildAppFromString()
      : await this.buildAppAndOptionsFromConfig());
  }

  static loggingMiddleware(): (server: Server) => Promise<unknown[] | null> {
    return async (server: Server) =>
      /CGI/.test((await server.server()).name) || server.options.quiet
        ? null
        : [CommonLogger, STDERR];
  }

  static defaultMiddlewareByEnvironment(): Hash<string, MiddlewareEntry[]> {
    const m = new Hash<string, MiddlewareEntry[]>((h, k) => {
      const value: MiddlewareEntry[] = [];
      h.set(k, value);
      return value;
    });
    m.set("deployment", [[ContentLength], this.loggingMiddleware(), [TempfileReaper]]);
    m.set("development", [
      [ContentLength],
      this.loggingMiddleware(),
      [ShowExceptions],
      [Lint],
      [TempfileReaper],
    ]);

    return m;
  }

  static middleware(): Hash<string, MiddlewareEntry[]> {
    return this.defaultMiddlewareByEnvironment();
  }

  middleware(): Hash<string, MiddlewareEntry[]> {
    return (this.constructor as typeof Server).middleware();
  }

  async start(block: ((...args: unknown[]) => unknown) | null = null): Promise<unknown> {
    await this._ready;
    const options = this.options;

    if (options.warn) {
      rbGvSet("$-w", true);
    }

    const includes = options.include;
    if (includes != null) {
      LOAD_PATH.unshift(...includes);
    }

    for (const library of options.require ?? []) {
      await rbFRequireFile(library);
    }

    if (options.debug) {
      rbGvSet("$DEBUG", true);
      STDOUT.puts(rbInspect(options.server));
      await PP.pp(await this.wrappedApp());
      await PP.pp(await this.app());
    }

    if (options.pid != null) await this.checkPidBang();

    await this.handleProfiling(options.heapfile, options.profileMode, options.profileFile, () =>
      this.wrappedApp(),
    );

    if (options.daemonize) this.daemonizeApp();

    if (options.pid != null) await this.writePid();

    trap("INT", () => {
      if (typeof this._server!.shutdown === "function") {
        this._server!.shutdown();
      } else {
        exit();
      }
    });

    return (await this.server()).run(await this.wrappedApp(), options, block);
  }

  async server(): Promise<HandlerLike> {
    return (this._server ??= ((await Handler.get(this.options.server)) ??
      (await Handler.default())) as HandlerLike);
  }

  /** @internal */
  private async buildAppAndOptionsFromConfig(): Promise<unknown> {
    if (!File.isExist(this.options.config!)) {
      abort(`configuration ${this.options.config} not found`);
    }

    return Builder.parseFile(this.options.config!);
  }

  /** @internal */
  private async handleProfiling(
    heapfile: string | undefined,
    profileMode: string | undefined,
    filename: string | undefined,
    block: () => unknown,
  ): Promise<unknown> {
    if (heapfile != null) {
      await rbFRequire(loadPath, "objspace");
      const { ObjectSpace } = rbRequireLoaded("objspace") as { ObjectSpace: ObjectSpaceLike };
      ObjectSpace.traceObjectAllocationsStart();
      await block();
      await File.openAsync(heapfile, "w", (f) => ObjectSpace.dumpAll({ output: f }));
      return exit();
    }

    if (profileMode != null) {
      await rbFRequire(loadPath, "stackprof");
      await rbFRequire(loadPath, "tempfile");
      const { StackProf } = rbRequireLoaded("stackprof") as { StackProf: StackProfLike };

      await this.makeProfileName(filename, async (filename) => {
        await File.openAsync(filename, "w", async (f) => {
          await StackProf.run({ mode: profileMode, out: f }, block);
          STDOUT.puts(`Profile written to: ${filename}`);
        });
      });
      return exit();
    }

    return block();
  }

  /** @internal */
  private async makeProfileName(
    filename: string | undefined,
    block: (filename: string) => Promise<void>,
  ): Promise<void> {
    if (filename != null) {
      await block(filename);
    } else {
      await createTmpname("profile.dump", null, {}, (tmpname) => block(tmpname));
    }
  }

  /** @internal */
  private buildAppFromString(): unknown {
    return Builder.newFromString(this.options.builder!);
  }

  /** @internal */
  private async parseOptions(args: string[]): Promise<ServerOptions> {
    if (Object.hasOwn(env, REQUEST_METHOD)) args.length = 0;

    this._options = await this.optParser().parseBang(args);
    this._options.config = File.expandPath(this.options.config!);
    setEnv("RACK_ENV", this.options.environment);
    return this._options;
  }

  /** @internal */
  protected optParser(): { parseBang(args: string[]): ServerOptions | Promise<ServerOptions> } {
    return new Options();
  }

  /** @internal */
  private async buildApp(app: unknown): Promise<unknown> {
    const entries = [...this.middleware().get(this.options.environment!)!].reverse();
    for (let middleware of entries) {
      if (typeof middleware === "function")
        middleware = (await middleware(this)) as MiddlewareEntry;
      if (middleware == null) continue;
      const [klass, ...args] = middleware as [new (...args: unknown[]) => unknown, ...unknown[]];
      app = new klass(app, ...args);
    }
    return app;
  }

  /** @internal */
  protected async wrappedApp(): Promise<unknown> {
    return (this._wrappedApp ??= await this.buildApp(await this.app()));
  }

  /** @internal */
  private daemonizeApp(): void {
    Process.daemon(true, this.options.daemonize === "noclose");
  }

  /** @internal */
  private async writePid(): Promise<void> {
    for (;;) {
      try {
        await File.writeAsync(this.options.pid!, `${Process.pid}`, { mode: "wx" });
        atExit(() => FileUtils.rmF(this.options.pid!));
        return;
      } catch (error) {
        if (!(error instanceof Errno.EEXIST)) throw error;
        await this.checkPidBang();
      }
    }
  }

  /**
   * @internal
   * @missingRailsCall read — PERMANENT
   */
  private async checkPidBang(): Promise<void> {
    if (!(await File.isExistAsync(this.options.pid!))) return;

    let pid = 0;
    try {
      pid = parseInt(await File.readAsync(this.options.pid!), 10) || 0;
      if (pid === 0) throw new Errno.ESRCH();

      Process.kill(0, pid);
      this.exitWithPid(pid);
    } catch (error) {
      if (error instanceof Errno.ESRCH) {
        await File.deleteAsync(this.options.pid!);
      } else if (error instanceof Errno.EPERM) {
        this.exitWithPid(pid);
      } else {
        throw error;
      }
    }
  }

  /** @internal */
  private exitWithPid(pid: number): never {
    STDERR.puts(`A server is already running (pid: ${pid}, file: ${this.options.pid}).`);
    return exit(1);
  }
}
