import {
  env as ENV,
  exitBang,
  File,
  FileUtils,
  Gem,
  Logger,
  rbFBackquote,
  setEnv,
  StandardError,
  STDOUT as $stdout,
  TopLevel,
  warn,
} from "@blazetrails/ruby-compat";
import type { Builder } from "./builder.js";
import { CompatibilityCheck } from "./compatibility-check.js";
import type { Config } from "./config.js";
import type { Manifest } from "./manifest.js";
import type { ViteAssets } from "./vite-assets.js";

export class Commands {
  /** @internal */
  private readonly _viteRuby: ViteAssets;

  constructor(viteRuby: ViteAssets) {
    this._viteRuby = viteRuby;
  }

  buildFromTask(...args: string[]): Promise<unknown> {
    return this.withNodeEnv(Object.hasOwn(ENV, "NODE_ENV") ? ENV["NODE_ENV"]! : "production", () =>
      this.ensureLogGoesToStdout(async () => (await this.build(...args)) || exitBang()),
    );
  }

  async build(...args: string[]): Promise<boolean> {
    const result = await this.builder().build(...args);
    await this.manifest().refresh();
    return result;
  }

  async clobber(): Promise<void> {
    const config = await this.config();
    const dirs = [
      config.buildOutputDir(),
      config.ssrOutputDir,
      config.buildCacheDir,
      config.viteCacheDir(),
    ];
    for (const dir of dirs) {
      if (await File.isExistAsync(dir.toString())) await FileUtils.rmtreeAsync(dir.toString());
    }
    $stdout.puts(`Removed vite cache and output dirs:\n\t${dirs.join("\n\t")}`);
  }

  /**
   * @inventedArm cpAsync — PERMANENT
   * @inventedArm chmodAsync — PERMANENT
   */
  async installBinstubs(): Promise<void> {
    const bin = (await this.config()).root.join("bin");
    const binstub = bin.join("vite").toString();
    await FileUtils.mkdirPAsync(bin.toString());
    await FileUtils.cpAsync(
      decodeURIComponent(new URL("../templates/bin/vite", import.meta.url).pathname),
      binstub,
    );
    await File.chmodAsync(0o755, binstub);
  }

  async isLegacyNpmVersion(): Promise<boolean> {
    try {
      return (parseInt(await rbFBackquote("npm --version"), 10) || 0) < 7;
    } catch (error) {
      if (!(error instanceof StandardError)) throw error;
      return false;
    }
  }

  async isLegacyYarnVersion(): Promise<boolean> {
    try {
      return (parseInt(await rbFBackquote("yarn --version"), 10) || 0) < 2;
    } catch (error) {
      if (!(error instanceof StandardError)) throw error;
      return false;
    }
  }

  async verifyInstall(): Promise<void> {
    const config = await this.config();
    if (!(await File.isExistAsync(config.root.join("bin/vite").toString()))) {
      warn(`
vite binstub not found.
Have you run \`bundle binstub vite_ruby\`?
Make sure the bin directory and bin/vite are not included in .gitignore
`);
    }

    const configPath = config.root.join(config.configPath);
    if (!(await File.isExistAsync(configPath.toString()))) {
      warn(`
Configuration ${configPath} file for vite-plugin-ruby not found.
Make sure \`bundle exec vite install\` has run successfully before running dependent tasks.
`);
      exitBang();
    }
  }

  async printInfo(): Promise<void> {
    const config = await this.config();
    await config.withinRoot(async () => {
      $stdout.puts(`bin/vite present?: ${await File.isExistAsync("bin/vite")}`);

      $stdout.puts(`vite_ruby: ${TopLevel.ViteAssets!.VERSION}`);
      for (const [framework, library] of TopLevel.ViteAssets!.frameworkLibraries()) {
        $stdout.puts(`${library.name}: ${library.version}`);
        $stdout.puts(`${framework}: ${Gem.loadedSpecs[framework]?.version ?? ""}`);
      }

      $stdout.puts(`ruby: ${await rbFBackquote("ruby --version")}`);
      $stdout.puts(`node: ${await rbFBackquote("node --version")}`);

      const pkg = config.packageManager;
      let pkgVersion: string | null;
      try {
        pkgVersion = await rbFBackquote(`${pkg} --version`);
      } catch {
        pkgVersion = null;
      }
      $stdout.puts(`${pkg}: ${pkgVersion ?? ""}`);

      $stdout.puts("\n");
      const packages = await rbFBackquote("npm ls vite vite-plugin-ruby");
      const packagesMsg = packages.includes("vite@")
        ? `installed packages:\n${packages}`
        : "❌ Check that vite and vite-plugin-ruby have been added as development dependencies and installed.";
      $stdout.puts(packagesMsg);

      await CompatibilityCheck.verifyPluginVersion(config.root);
    });
  }

  /** @internal */
  private config(): Promise<Config> {
    return this._viteRuby.config();
  }

  /** @internal */
  private builder(): Builder {
    return this._viteRuby.builder();
  }

  /** @internal */
  private manifest(): Manifest {
    return this._viteRuby.manifest();
  }

  /** @internal */
  private get logger(): Logger {
    return this._viteRuby.logger;
  }

  /** @internal */
  private set logger(logger: Logger) {
    this._viteRuby.logger = logger;
  }

  /** @internal */
  private async withNodeEnv<T>(env: string, block: () => Promise<T>): Promise<T> {
    const original = ENV["NODE_ENV"];
    setEnv("NODE_ENV", env);
    try {
      return await block();
    } finally {
      setEnv("NODE_ENV", original);
    }
  }

  /** @internal */
  private async ensureLogGoesToStdout<T>(block: () => Promise<T>): Promise<T> {
    const oldLogger = this.logger;

    this.logger = new Logger($stdout, {
      formatter: (_severity, _time, progname, msg) => (progname === "vite" ? msg : `${msg}\n`),
    });
    try {
      return await block();
    } finally {
      this.logger = oldLogger;
    }
  }
}
