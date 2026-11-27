import {
  env as ENV,
  Dir,
  File,
  getHttpAsync,
  Logger,
  rbFLoad,
  stdout as $stdout,
  StandardError,
  SystemCallError,
  Timeout,
  TopLevel,
} from "@blazetrails/ruby-compat";
import { Build } from "./build.js";
import { Builder } from "./builder.js";
import { Commands } from "./commands.js";
import { CompatibilityCheck } from "./compatibility-check.js";
import { Config, type ConfigOptions } from "./config.js";
import { DevServerProxy } from "./dev-server-proxy.js";
import { Error } from "./error.js";
import { IO } from "./io.js";
import { Manifest } from "./manifest.js";
import { MissingEntrypointError } from "./missing-entrypoint-error.js";
import { MissingExecutableError } from "./missing-executable-error.js";
import { Runner } from "./runner.js";
import { DEFAULT_PLUGIN_VERSION, DEFAULT_VITE_VERSION, VERSION } from "./version.js";

type ConfigAttrs = Partial<Record<keyof ConfigOptions, unknown>>;

export class ViteAssets {
  declare static Build: typeof Build;
  declare static CLI: typeof import("./cli.js").CLI;
  declare static Builder: typeof Builder;
  declare static Commands: typeof Commands;
  declare static CompatibilityCheck: typeof CompatibilityCheck;
  declare static Config: typeof Config;
  declare static DevServerProxy: typeof DevServerProxy;
  declare static Error: typeof Error;
  declare static Manifest: typeof Manifest;
  declare static MissingEntrypointError: typeof MissingEntrypointError;
  declare static MissingExecutableError: typeof MissingExecutableError;
  declare static IO: typeof IO;
  declare static Runner: typeof Runner;

  static readonly VERSION = VERSION;

  static readonly DEFAULT_VITE_VERSION = DEFAULT_VITE_VERSION;
  static readonly DEFAULT_PLUGIN_VERSION = DEFAULT_PLUGIN_VERSION;

  static readonly ENV_PREFIX = "VITE_RUBY";

  static readonly COMPANION_LIBRARIES: Readonly<Record<string, string>> = Object.freeze({
    "@blazetrails/vite-trails": "trails",
    vite_hanami: "hanami",
    vite_padrino: "padrino",
    "jekyll-vite": "jekyll",
    vite_rails_legacy: "rails",
    vite_plugin_legacy: "rack",
  });

  /** @noRailsEquivalent PERMANENT */
  static readonly FRAMEWORK_PACKAGES: Readonly<Record<string, string>> = Object.freeze({
    trails: "@blazetrails/trailties",
  });

  /** @internal */
  private static _instance: ViteAssets | undefined;

  /** @inventedArm readAsync — PERMANENT */
  static async frameworkLibraries(): Promise<[string, { name: string; version: unknown }][]> {
    const appPackage = File.join(Dir.pwd(), "package.json");
    if (!(await File.isExistAsync(appPackage))) return [];
    const app = JSON.parse(await File.readAsync(appPackage)) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const result: [string, { name: string; version: unknown }][] = [];
    for (const [name, framework] of Object.entries(this.COMPANION_LIBRARIES)) {
      if (!Object.hasOwn({ ...app.devDependencies, ...app.dependencies }, name)) continue;
      const libraryPackage = File.join(Dir.pwd(), "node_modules", name, "package.json");
      if (!(await File.isExistAsync(libraryPackage))) continue;
      const library = JSON.parse(await File.readAsync(libraryPackage)) as {
        name: string;
        version: unknown;
      };
      result.push([framework, library]);
    }
    return result;
  }

  static instance(): ViteAssets {
    return (this._instance ??= new this());
  }

  static config(): Config {
    return this.instance().config();
  }

  /** @noRailsEquivalent PERMANENT */
  static prewarmConfig(): Promise<Config> {
    return this.instance().prewarmConfig();
  }

  static configure(options: ConfigAttrs = {}): Promise<Config> {
    return this.instance().configure(options);
  }

  static digest(): Promise<string> {
    return this.instance().digest();
  }

  static commands(): Commands {
    return this.instance().commands();
  }

  static run(argv: string[], options: { exec?: boolean } = {}): Promise<unknown> {
    return this.instance().run(argv, options);
  }

  static env(): Record<string, string> {
    return this.instance().env();
  }

  static isRunProxy(): Promise<boolean> {
    return this.instance().isRunProxy();
  }

  static mode(): string {
    return this.config().mode;
  }

  static bootstrap(): Promise<unknown> {
    return this.instance().manifest().refresh();
  }

  static installTasks(): Promise<true> {
    return rbFLoad(decodeURIComponent(new URL("./tasks/vite.rake.js", import.meta.url).pathname));
  }

  static reloadWith(configOptions: ConfigAttrs = {}): ViteAssets {
    return (this._instance = new this(configOptions));
  }

  /** @internal */
  private readonly _configOptions: ConfigAttrs;
  /** @internal */
  private _logger: Logger | undefined;
  /** @internal */
  private _env: Record<string, string> | undefined;
  /** @internal */
  private _config: Config | undefined;
  /** @internal */
  private _manifest: Manifest | undefined;
  /** @internal */
  private _running: boolean | undefined;
  /** @internal */
  private _runningCheckedAt = 0;
  /** @internal */
  private _runner: Runner | undefined;
  /** @internal */
  private _commands: Commands | undefined;
  /** @internal */
  private _builder: Builder | undefined;
  /** @internal */
  private _devServerMeta: unknown;
  /** @internal */
  private _devServerMetaCheckedAt: number | undefined;

  constructor(configOptions: ConfigAttrs = {}) {
    this._configOptions = configOptions;
  }

  get logger(): Logger {
    return (this._logger ??= new Logger($stdout));
  }

  set logger(logger: Logger) {
    this._logger = logger;
  }

  digest(): Promise<string> {
    return this.builder().watchedFilesDigest();
  }

  async isDevServerRunning(): Promise<boolean> {
    if (!(await this.isDevMode())) return false;
    const config = this.config();
    if (config.devServerConnectionCheck) return this.isDevServerConnected();

    const meta = await this.devServerMeta();
    return (
      meta !== null &&
      typeof meta === "object" &&
      !Array.isArray(meta) &&
      (meta as Record<string, unknown>).port === config.port
    );
  }

  env(): Record<string, string> {
    return (this._env ??= Object.fromEntries(
      Object.entries(ENV).filter(
        (entry): entry is [string, string] =>
          entry[1] !== undefined && entry[0].startsWith(ViteAssets.ENV_PREFIX),
      ),
    ));
  }

  async isDevMode(): Promise<boolean> {
    try {
      const config = this.config();
      return config.mode === "development" || (config.mode === "test" && !ENV["CI"]);
    } catch (error) {
      this.logger.error(`Failed to check mode for Vite: ${(error as StandardError).message}`);
      return false;
    }
  }

  declare isRunProxy: () => Promise<boolean>;

  run(argv: string[], options: { exec?: boolean } = {}): Promise<unknown> {
    return (this._runner ??= new Runner(this)).run(argv, options);
  }

  builder(): Builder {
    return (this._builder ??= new Builder(this));
  }

  commands(): Commands {
    return (this._commands ??= new Commands(this));
  }

  /** @missingRailsCall configure — PERMANENT */
  config(): Config {
    return this._config!;
  }

  /** @noRailsEquivalent PERMANENT */
  async prewarmConfig(): Promise<Config> {
    if (this._config === undefined) {
      await this.configure();
      await this._config!.loadRubyConfig();
    }

    return this._config!;
  }

  async configure(options: ConfigAttrs = {}): Promise<Config> {
    return (this._config = await Config.resolveConfig({ ...this._configOptions, ...options }));
  }

  manifest(): Manifest {
    return (this._manifest ??= new Manifest(this));
  }

  /**
   * @internal
   * @inventedArm timeout — PERMANENT
   */
  private async isDevServerConnected(): Promise<boolean> {
    if (this._running !== undefined && Date.now() - this._runningCheckedAt < 1000) {
      return this._running;
    }

    try {
      const config = this.config();
      const http = await getHttpAsync();
      const connection = await Timeout.timeout(config.devServerConnectTimeout, null, null, () =>
        http.connect!({ host: config.host, port: config.port }),
      );
      connection.close();
      return (this._running = true);
    } catch {
      return (this._running = false);
    } finally {
      this._runningCheckedAt = Date.now();
    }
  }

  /** @internal */
  private async devServerMeta(): Promise<unknown> {
    try {
      if (
        this._devServerMetaCheckedAt !== undefined &&
        Date.now() - this._devServerMetaCheckedAt < 1000
      ) {
        return this._devServerMeta;
      }

      const path = this.config().devServerMetaPath();
      return (this._devServerMeta = (await File.isExistAsync(path.toString()))
        ? JSON.parse(await path.read())
        : null);
    } catch (error) {
      if (!(error instanceof SyntaxError || error instanceof SystemCallError)) throw error;
      return (this._devServerMeta = null);
    } finally {
      this._devServerMetaCheckedAt = Date.now();
    }
  }
}

ViteAssets.prototype.isRunProxy = ViteAssets.prototype.isDevMode;

ViteAssets.Build = Build;
ViteAssets.Builder = Builder;
ViteAssets.Commands = Commands;
ViteAssets.CompatibilityCheck = CompatibilityCheck;
ViteAssets.Config = Config;
ViteAssets.DevServerProxy = DevServerProxy;
ViteAssets.Error = Error;
ViteAssets.Manifest = Manifest;
ViteAssets.MissingEntrypointError = MissingEntrypointError;
ViteAssets.MissingExecutableError = MissingExecutableError;
ViteAssets.IO = IO;
ViteAssets.Runner = Runner;

TopLevel.ViteAssets = ViteAssets;

declare module "@blazetrails/ruby-compat/object" {
  interface TopLevelConstants {
    ViteAssets?: typeof ViteAssets;
  }
}
