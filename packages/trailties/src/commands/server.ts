/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include EnvironmentArgument` (`server_command.rb:94`); the class/interface merge is how a mixin surfaces on the type side. */
import { type BroadcastLogger, getEnv, isBlank, Logger } from "@blazetrails/activesupport";
import {
  block,
  Dir,
  fetch,
  File,
  FileUtils,
  getFs,
  getPath,
  Hash,
  include,
  LoadError,
  setEnv,
  STDERR,
  STDOUT,
  type Included,
} from "@blazetrails/ruby-compat";
import { Handler, type RackEnv } from "@blazetrails/rack";
import { demodulize, isPresent } from "@blazetrails/activesupport";
import { DetailsKey } from "@blazetrails/actionview";
import type { ThorClass } from "@blazetrails/thor";
import type { ThorOptions } from "@blazetrails/thor/core-ext/hash-with-indifferent-access";
import * as Command from "../command.js";
import { requireApplicationBang } from "../command/actions.js";
import { Base } from "../command/base.js";
import { EnvironmentArgument } from "../command/environment-argument.js";
import { DevCaching } from "../dev-caching.js";
import { Trails } from "../rails.js";
import type { ActionViewConfig } from "../trailties/action-view.js";
import type { WatchHandle } from "@blazetrails/trails-tsc";

export interface ServerOptions {
  userSuppliedOptions?: string[];
  server?: string;
  logStdout?: boolean;
  Port?: number;
  Host?: string;
  DoNotReverseLookup?: boolean;
  config?: string;
  environment?: string;
  daemonize?: boolean;
  pid?: string;
  caching?: boolean | null;
  restartCmd?: string;
  earlyHints?: boolean | null;
  SSLEnable?: boolean;
}

export class Server {
  /** @internal */
  _defaultOptions: ServerOptions;
  options: ServerOptions;

  constructor(options: ServerOptions | null = null) {
    this._defaultOptions = options ?? {};
    this.options = this._defaultOptions;
    this.setEnvironment();
  }

  setEnvironment(): void {
    if (getEnv("TRAILS_ENV") === undefined) setEnv("TRAILS_ENV", this.options.environment);
  }

  async start(afterStopCallback: (() => void) | null = null): Promise<void> {
    this.createTmpDirectories();
    this.setupDevCaching();
    const app = await Trails.initialize();
    if (this.options.logStdout) this.logToStdout();

    await app.loadServer();
    const root = Dir.pwd();
    await watchViews(app, root);
    const railsApp = (env: RackEnv) => app.call(env);
    const { Port: port, Host: host } = this.options;
    if (this.options.environment !== "development" || !(await hasViteConfig(root))) {
      const server = await Handler.Node.run(railsApp, { Port: port, Host: host });
      if (afterStopCallback != null) server.once("close", afterStopCallback);
      return;
    }
    const { DevServer } = await import("../server/dev-server.js");
    await new DevServer({ port: port!, host: host!, cwd: root, app: railsApp }).start();
  }

  isServeable(): boolean {
    try {
      this.server();
      return true;
    } catch (error) {
      if (error instanceof LoadError) return false;
      throw error;
    }
  }

  /** @noRailsEquivalent PERMANENT */
  server(): typeof Handler.Node {
    const { server } = this.options;
    if (server == null || server === "node") return Handler.Node;
    throw new LoadError(`cannot load such file -- rack/handler/${server}`);
  }

  middleware(): Hash<string, unknown[]> {
    return new Hash<string, unknown[]>([]);
  }

  defaultOptions(): ServerOptions {
    return { ...this._defaultOptions };
  }

  servedUrl(): string | undefined {
    if (!this.isUsePuma()) {
      return `${this.options.SSLEnable ? "https" : "http"}://${this.options.Host}:${this.options.Port}`;
    }
  }

  /** @internal */
  private setupDevCaching(): void {
    if (this.options.environment === "development") {
      DevCaching.enableByArgument(this.options.caching);
    }
  }

  /** @internal */
  private createTmpDirectories(): void {
    for (const dirToMake of ["cache", "pids", "sockets"]) {
      FileUtils.mkdirP(File.join(Trails.root()!, "tmp", dirToMake));
    }
  }

  /** @internal */
  private logToStdout(): void {
    const console = new Logger(STDOUT);
    console.formatter = Trails.logger!.formatter;
    console.level = Trails.logger!.level;

    if (!Logger.isLoggerOutputsTo(Trails.logger!, STDERR, STDOUT)) {
      (Trails.logger as BroadcastLogger).broadcastTo(console);
    }
  }

  /** @internal */
  private isUsePuma(): boolean {
    return String(this.options.server).endsWith("puma");
  }
}

export interface ServerCommand extends Included<typeof EnvironmentArgument> {
  /** @internal */
  _environment?: string;
  /** @internal */
  _environmentSpecified?: boolean;
  /** @internal */
  _availableEnvironments?: string[];
}

export class ServerCommand extends Base {
  static readonly RACK_HANDLER_GEMS = [
    "cgi",
    "webrick",
    "scgi",
    "thin",
    "puma",
    "unicorn",
    "falcon",
  ];
  static readonly RACK_HANDLERS = [...ServerCommand.RACK_HANDLER_GEMS, "fastcgi", "lsws"];
  static readonly RECOMMENDED_SERVER = "puma";

  static readonly DEFAULT_PORT = 3000;
  static readonly DEFAULT_PIDFILE = "tmp/pids/server.pid";

  declare options: ThorOptions<ServerCommandOptions>;
  /** @internal */
  _originalOptions: string[];
  /** @internal */
  _userSuppliedOptions?: string[];

  static {
    const klass = this as unknown as ThorClass;
    include(this, EnvironmentArgument);

    klass.classOption("port", {
      aliases: "-p",
      type: "numeric",
      desc: "Run Rails on the specified port - defaults to 3000.",
      banner: "port",
    });
    klass.classOption("binding", {
      aliases: "-b",
      type: "string",
      desc: "Bind Rails to the specified IP - defaults to 'localhost' in development and '0.0.0.0' in other environments'.",
      banner: "IP",
    });
    klass.classOption("config", {
      aliases: "-c",
      type: "string",
      default: "config.ru",
      desc: "Use a custom rackup configuration.",
      banner: "file",
    });
    klass.classOption("daemon", {
      aliases: "-d",
      type: "boolean",
      default: false,
      desc: "Run server as a Daemon.",
    });
    klass.classOption("using", {
      aliases: "-u",
      type: "string",
      desc: "Specify the Rack server used to run the application (thin/puma/webrick).",
      banner: "name",
    });
    klass.classOption("pid", {
      aliases: "-P",
      type: "string",
      desc: `Specify the PID file. Defaults to ${this.DEFAULT_PIDFILE} in development.`,
    });
    klass.classOption("devCaching", {
      aliases: "-C",
      type: "boolean",
      default: null,
      desc: "Specify whether to perform caching in development.",
    });
    klass.classOption("restart", { type: "boolean", default: null, hide: true });
    klass.classOption("earlyHints", {
      type: "boolean",
      default: null,
      desc: "Enable HTTP/2 early hints.",
    });
    klass.classOption("logToStdout", {
      type: "boolean",
      default: null,
      optional: true,
      desc: "Whether to log to stdout. Enabled by default in development when not daemonized.",
    });

    klass.noCommands(() => {
      klass.methodAdded("serverOptions");
      klass.methodAdded("environment");
    });
    klass.desc("server", "Start the Rails server");
    klass.methodAdded("perform");
  }

  /** @inlinedFrom Rails::Command::EnvironmentArgument#initialize rails/v8.0.2/railties/lib/rails/command/environment_argument.rb:16-26 */
  constructor(...args: ConstructorParameters<typeof Base>) {
    super(...args);

    this._environmentSpecified = isPresent(this.options.environment);

    if (!this._environmentSpecified) {
      this.options = this.options.merge({ environment: Command.environment() });
    } else if (!this.availableEnvironments().includes(this.options.environment!)) {
      this.options = this.options.merge({
        environment: this.expandEnvironmentName(this.options.environment!),
      });
    }

    this._originalOptions = (args[1] as string[]).filter((option) => option !== "--restart");
  }

  /** @missingRailsCall application — CONVERGEABLE server-start-after-stop-callback-and-trap */
  async perform(): Promise<void> {
    this.prepareRestart();

    const server = new Server(this.serverOptions());
    await requireApplicationBang();
    Dir.chdir(Trails.root()!);

    if (server.isServeable()) {
      this.printBootInformation(server.server().name, server.servedUrl());
      const afterStopCallback = () => {
        if (!this.options.daemon) this.say("Exiting");
      };
      await server.start(afterStopCallback);
    } else {
      this.say(this.rackServerSuggestion(this.options.using ?? null));
    }
  }

  serverOptions(): ServerOptions {
    return {
      userSuppliedOptions: this.userSuppliedOptions(),
      server: this.options.using,
      logStdout: this.isLogToStdout(),
      Port: this.port(),
      Host: this.host(),
      DoNotReverseLookup: true,
      config: this.options.config,
      environment: this.environment(),
      daemonize: this.options.daemon,
      pid: this.pid(),
      caching: this.options.devCaching,
      restartCmd: this.restartCommand(),
      earlyHints: this.earlyHints(),
    };
  }

  /** @internal */
  private userSuppliedOptions(): string[] {
    return (this._userSuppliedOptions ??= (() => {
      const userFlag: Record<string, boolean> = {};
      for (const command of this._originalOptions) {
        if (command.startsWith("--")) {
          const option = command.split("=")[0];
          userFlag[option] = true;
        } else {
          const match = /^(-.)/.exec(command);
          if (match) userFlag[match[0]] = true;
        }
      }

      const userSuppliedOptions: string[] = [];
      const classOptions = (this.constructor as unknown as ThorClass).classOptions();
      for (const option of Object.values(classOptions)) {
        if (option.aliases.some((name) => userFlag[name]) || userFlag[option.switchName]) {
          let name = option.name;
          switch (name) {
            case "port":
              name = "Port";
              break;
            case "binding":
              name = "Host";
              break;
            case "devCaching":
              name = "caching";
              break;
            case "daemonize":
              name = "daemon";
              break;
          }
          userSuppliedOptions.push(name);
        }
      }
      if (getEnv("HOST") != null || getEnv("BINDING") != null) userSuppliedOptions.push("Host");
      if (getEnv("PORT") != null) userSuppliedOptions.push("Port");
      if (getEnv("PIDFILE") != null) userSuppliedOptions.push("pid");
      return [...new Set(userSuppliedOptions)];
    })());
  }

  /** @internal */
  private port(): number {
    return this.options.port ?? parseInt(getEnv("PORT", String(ServerCommand.DEFAULT_PORT)), 10);
  }

  /** @internal */
  private host(): string {
    if (this.options.binding != null) {
      return this.options.binding;
    } else {
      const defaultHost = this.environment() === "development" ? "localhost" : "0.0.0.0";

      return getEnv("BINDING", defaultHost);
    }
  }

  /** @internal */
  environment(): string {
    return this.options.environment || Command.environment();
  }

  /** @internal */
  private restartCommand(): string {
    return `${this.executable()} ${this._originalOptions.join(" ")} --restart`;
  }

  /** @internal */
  private earlyHints(): boolean | null | undefined {
    return this.options.earlyHints;
  }

  /** @internal */
  private isLogToStdout(): boolean {
    return fetch<boolean>(
      this.options,
      "logToStdout",
      block(() => isBlank(this.options.daemon) && this.environment() === "development"),
    );
  }

  /** @internal */
  private pid(): string | undefined {
    const defaultPidfile =
      this.environment() === "development" ? ServerCommand.DEFAULT_PIDFILE : null;
    const pid = this.options.pid ?? getEnv("PIDFILE") ?? defaultPidfile;
    if (pid != null) return File.expandPath(pid);
  }

  /** @internal */
  private prepareRestart(): void {
    const pid = this.pid();
    if (pid != null && this.options.restart) FileUtils.rmF(pid);
  }

  /** @internal */
  private rackServerSuggestion(server: string | null): string {
    if (server == null) {
      return `Could not find a server gem. Maybe you need to add one to the Gemfile?

  gem "${ServerCommand.RECOMMENDED_SERVER}"

Run \`${this.executable()} --help\` for more options.
`;
    } else if (ServerCommand.RACK_HANDLER_GEMS.includes(server)) {
      return `Could not load server "${server}". Maybe you need to the add it to the Gemfile?

  gem "${server}"

Run \`${this.executable()} --help\` for more options.
`;
    } else {
      const error = new Command.CorrectableNameError(
        `Could not find server '${server}'.`,
        server,
        ServerCommand.RACK_HANDLERS,
      );
      return `${error.detailedMessage()}
Run \`${this.executable()} --help\` for more options.
`;
    }
  }

  /** @internal */
  private printBootInformation(server: string, url: string | undefined): void {
    this.say(`=> Booting ${demodulize(server)}
=> Trails ${Trails.version()} application starting in ${Trails.env} ${url}
=> Run \`${this.executable()} --help\` for more startup options
`);
  }

  /** @internal */
  private executable(): string {
    return (this.constructor as typeof Base).executable();
  }
}

interface ServerCommandOptions extends Record<string, unknown> {
  port?: number;
  binding?: string;
  config?: string;
  daemon?: boolean;
  using?: string;
  pid?: string;
  devCaching?: boolean | null;
  restart?: boolean | null;
  earlyHints?: boolean | null;
  logToStdout?: boolean | null;
  environment?: string;
}

/** @noRailsEquivalent PERMANENT */
async function watchViews(
  app: Awaited<ReturnType<typeof Trails.initialize>>,
  root: string,
): Promise<WatchHandle | null> {
  const { config } = app;
  const actionView: ActionViewConfig | undefined = config?.actionView;
  if (actionView == null) return null;
  const cacheTemplateLoading = actionView.cacheTemplateLoading;
  const enableCaching =
    cacheTemplateLoading == null ? !config.isReloadingEnabled() : cacheTemplateLoading;
  if (enableCaching) return null;

  const { watchViews: watchViewFiles } = await import("@blazetrails/trails-tsc");
  let started = false;
  let initialError: Error | null = null;
  const handle = await watchViewFiles({
    cwd: root,
    onRebuild: ({ kind }) => {
      if (kind === "change") DetailsKey.clear();
    },
    onError: (err, trigger) => {
      if (!started) initialError ??= err;
      console.error(`trails-tsc-views: ${trigger ?? "build"}: ${err.message}`);
    },
  });
  started = true;
  if (initialError !== null) {
    handle.close();
    throw initialError;
  }
  return handle;
}

async function hasViteConfig(root: string): Promise<boolean> {
  const fs = getFs();
  const p = getPath();
  return (
    (await fs.exists(p.join(root, "vite.config.ts"))) ||
    (await fs.exists(p.join(root, "vite.config.js")))
  );
}
