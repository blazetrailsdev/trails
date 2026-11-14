import { underscore } from "@blazetrails/activesupport";
import {
  Dir,
  env as ENV,
  Errno,
  File,
  Pathname,
  rbFLoad,
  stderr as $stderr,
} from "@blazetrails/ruby-compat";
import { ViteRuby } from "./vite-ruby.js";

export interface ConfigOptions {
  additionalEntrypoints: string[];
  assetHost: string | null;
  assetsDir: string;
  autoBuild: boolean;
  buildCacheDir: Pathname;
  publicOutputDir: string;
  configPath: string;
  devServerConnectionCheck: boolean;
  devServerConnectTimeout: number;
  packageManager: string | null;
  publicDir: string;
  entrypointsDir: string;
  sourceCodeDir: string;
  skipCompatibilityCheck: boolean;
  skipProxy: boolean;
  host: string;
  https: boolean;
  port: number;
  hideBuildConsoleOutput: boolean;
  viteBinPath: string | null;
  watchAdditionalPaths: string[];
  base: string;
  ssrBuildEnabled: boolean;
  ssrEntrypoint: string;
  ssrOutputDir: Pathname;
  mode: string;
  root: Pathname;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface Config extends Readonly<ConfigOptions> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Config {
  static readonly DEV_SERVER_META_BASENAME = "vite-ruby";

  /** @internal */
  private readonly _config: Record<string, unknown>;

  origin(): string {
    return `${this.protocol()}://${this.hostWithPort()}`;
  }

  protocol(): string {
    return this.https ? "https" : "http";
  }

  hostWithPort(): string {
    return `${this.host}:${this.port}`;
  }

  knownManifestPaths(): Pathname[] {
    return [
      this.buildOutputDir().join(".vite/manifest.json"),

      this.buildOutputDir().join(".vite/manifest-assets.json"),
    ];
  }

  async manifestPaths(): Promise<Pathname[]> {
    const paths = this.knownManifestPaths();
    const exist = await Promise.all(paths.map((path) => File.isExistAsync(path.toString())));
    return paths.filter((_, i) => exist[i]);
  }

  buildOutputDir(): Pathname {
    return this.root.join(this.publicDir, this.publicOutputDir);
  }

  devServerMetaPath(): Pathname {
    return this.root.join("tmp", `${Config.DEV_SERVER_META_BASENAME}-${this.mode}.json`);
  }

  resolvedEntrypointsDir(): Pathname {
    return this.viteRootDir().join(this.entrypointsDir);
  }

  viteCacheDir(): Pathname {
    return this.root.join("node_modules/.vite");
  }

  viteRootDir(): Pathname {
    return this.root.join(this.sourceCodeDir);
  }

  async loadRubyConfig(): Promise<void> {
    const rbConfigPath = File.expandPath(
      this.configPath.replace(/.json$/, ".ts"),
      this.root.toString(),
    );
    if (await File.isExistAsync(rbConfigPath)) await rbFLoad(rbConfigPath);
  }

  toEnv(envVars: Record<string, string> = ViteRuby.env()): Record<string, string> {
    const env: Record<string, string> = {};
    for (const option of Config.CONFIGURABLE_WITH_ENV) {
      const value = this._config[option];
      if (value != null) {
        env[`${ViteRuby.ENV_PREFIX}_${underscore(option).toUpperCase()}`] = String(value);
      }
    }
    return { ...env, ...envVars };
  }

  watchedPaths(): readonly string[] {
    return Object.freeze([
      ...[...this.watchAdditionalPaths, ...this.additionalEntrypoints].filter(
        (dir) => !(dir.startsWith("~/") || dir.startsWith(this.sourceCodeDir)),
      ),
      `${this.sourceCodeDir}/**/*`,
      this.configPath.replace(/.json$/, ".{rb,json}"),
      ...Config.DEFAULT_WATCHED_PATHS,
    ]);
  }

  withinRoot<T>(block: (path: string) => T): T {
    return Dir.chdir(File.expandPath(this.root.toString()), block);
  }

  /** @internal */
  private async coerceValues(config: Record<string, unknown>): Promise<void> {
    config.mode = String(config.mode ?? "");
    config.port = Number.parseInt(String(config.port ?? 0), 10) || 0;
    const root = (config.root = new Pathname(String(config.root)));
    config.buildCacheDir = root.join(String(config.buildCacheDir));
    config.ssrOutputDir = root.join(String(config.ssrOutputDir));
    config.devServerConnectTimeout = Number.parseFloat(String(config.devServerConnectTimeout)) || 0;
    this.coerceBooleans(
      config,
      "autoBuild",
      "devServerConnectionCheck",
      "hideBuildConsoleOutput",
      "https",
      "skipCompatibilityCheck",
      "skipProxy",
    );
    config.packageManager ||= await this.detectPackageManager(root);
  }

  /** @internal */
  private coerceBooleans(config: Record<string, unknown>, ...names: string[]): void {
    const truthy = [true, "true"];
    for (const name of names) config[name] = truthy.includes(config[name] as boolean | string);
  }

  /** @internal */
  private async detectPackageManager(root: Pathname): Promise<string> {
    const exist = (name: string) => File.isExistAsync(root.join(name).toString());
    if (await exist("package-lock.json")) return "npm";
    if (await exist("pnpm-lock.yaml")) return "pnpm";
    if ((await exist("bun.lockb")) || (await exist("bun.lock"))) return "bun";
    if (await exist("yarn.lock")) return "yarn";

    return "npm";
  }

  /** @missingRailsCall verify_plugin_version — CONVERGEABLE vite-assets-builder-commands-runner */
  private constructor(attrs: Record<string, unknown>) {
    this._config = attrs;
  }

  static async resolveConfig(
    attrs: Partial<Record<keyof ConfigOptions, unknown>> = {},
  ): Promise<Config> {
    const config = { ...Config.configDefaults(), ...attrs } as Record<string, unknown>;
    const filePath = File.join(String(config.root), String(config.configPath));
    const fileConfig = await Config.configFromFile(filePath, { mode: String(config.mode) });
    const resolved = new Config({
      ...Config.DEFAULT_CONFIG,
      ...fileConfig,
      ...Config.configFromEnv(),
      ...config,
    });
    await resolved.coerceValues(resolved._config);
    Object.freeze(resolved._config);
    return resolved;
  }

  /** @internal */
  private static configDefaults({
    assetHost = null,
    mode = Object.hasOwn(ENV, "RACK_ENV") ? ENV["RACK_ENV"] : "development",
    root = Dir.pwd(),
  }: { assetHost?: unknown; mode?: unknown; root?: unknown } = {}): Record<string, unknown> {
    const defaults: Record<string, unknown> = {
      assetHost: Config.optionFromEnv("assetHost") ?? assetHost,
      configPath: Config.optionFromEnv("configPath") ?? Config.DEFAULT_CONFIG.configPath,
      mode: Config.optionFromEnv("mode") ?? mode,
      root: Config.optionFromEnv("root") ?? root,
    };
    return Object.fromEntries(
      Object.entries(defaults).filter(([, value]) => value != null && value !== false),
    );
  }

  /** @internal */
  private static async loadJson(path: string): Promise<Record<string, Record<string, unknown>>> {
    return JSON.parse(await File.readAsync(File.expandPath(path)));
  }

  /** @internal */
  private static optionFromEnv(name: string): string | undefined {
    return ViteRuby.env()[`${ViteRuby.ENV_PREFIX}_${underscore(name).toUpperCase()}`];
  }

  /** @internal */
  private static configFromEnv(): Record<string, string> {
    const envVars: Record<string, string> = {};
    for (const option of Config.CONFIGURABLE_WITH_ENV) {
      const value = Config.optionFromEnv(option);
      if (value != null) envVars[option] = value;
    }
    return envVars;
  }

  /** @internal */
  private static async configFromFile(
    path: string,
    { mode }: { mode: string },
  ): Promise<Record<string, unknown>> {
    try {
      const multiEnvConfig = await Config.loadJson(path);
      return {
        ...(Object.hasOwn(multiEnvConfig, "all") ? multiEnvConfig.all : {}),
        ...(Object.hasOwn(multiEnvConfig, mode) ? multiEnvConfig[mode] : {}),
      };
    } catch (error) {
      if (!(error instanceof Errno.ENOENT)) throw error;
      const { message } = error as { message: string };
      $stderr.write(
        `Check that your vite.json configuration file is available in the load path:\n\n\t${message}\n\n`,
      );
      return {};
    }
  }

  static DEFAULT_CONFIG: Readonly<Record<string, unknown>>;

  static readonly NOT_CONFIGURABLE_WITH_ENV: readonly string[] = Object.freeze([
    "additionalEntrypoints",
    "watchAdditionalPaths",
  ]);

  static CONFIGURABLE_WITH_ENV: readonly string[];

  static readonly DEFAULT_WATCHED_PATHS: readonly string[] = Object.freeze([
    "bun.lockb",
    "package-lock.json",
    "package.json",
    "pnpm-lock.yaml",
    "postcss.config.js",
    "tailwind.config.js",
    "vite.config.js",
    "vite.config.mjs",
    "vite.config.mts",
    "vite.config.ts",
    "windi.config.ts",
    "yarn.lock",
  ]);
}

Config.DEFAULT_CONFIG = Object.freeze(
  await Config["loadJson"](new URL("../default.vite.json", import.meta.url).pathname),
);
Config.CONFIGURABLE_WITH_ENV = Object.freeze(
  [...Object.keys(Config.DEFAULT_CONFIG), "mode", "root"].filter(
    (option) => !Config.NOT_CONFIGURABLE_WITH_ENV.includes(option),
  ),
);

for (const option of [...Config.CONFIGURABLE_WITH_ENV, ...Config.NOT_CONFIGURABLE_WITH_ENV]) {
  Object.defineProperty(Config.prototype, option, {
    get(this: { _config: Record<string, unknown> }) {
      return this._config[option];
    },
    configurable: true,
  });
}
