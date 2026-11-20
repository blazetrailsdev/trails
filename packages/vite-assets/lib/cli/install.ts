import {
  Dir,
  env as ENV,
  File,
  FileUtils as RbFileUtils,
  Pathname,
  setEnv,
  stderr,
  StringIO,
  STDOUT as $stdout,
  rbClearMethodCache,
} from "@blazetrails/ruby-compat";
import type { Config } from "../config.js";
import { IO } from "../io.js";
import { ViteAssets } from "../vite-assets.js";
import { Command } from "./command.js";
import { FileUtils } from "./file-utils.js";

export class Install extends Command {
  static {
    this.desc("Performs the initial configuration setup to get started with Vite Ruby.");

    this.option("package_manager", {
      values: ["npm", "pnpm", "yarn", "bun"],
      aliases: ["package-manager", "with"],
      desc: "The package manager to use when installing JS dependencies.",
    });
  }

  /** @internal */
  private _root: Pathname | undefined;
  declare private append: typeof FileUtils.append;
  declare private appendUnlessPresent: typeof FileUtils.appendUnlessPresent;
  declare private cp: typeof FileUtils.cp;
  declare private injectLineAfter: typeof FileUtils.injectLineAfter;
  declare private injectLineAfterLast: typeof FileUtils.injectLineAfterLast;
  declare private injectLineBefore: typeof FileUtils.injectLineBefore;
  declare private replaceFirstLine: typeof FileUtils.replaceFirstLine;
  declare private write: typeof FileUtils.write;

  override async call({
    packageManager = null,
  }: { packageManager?: string | null } = {}): Promise<void> {
    if (packageManager)
      setEnv("VITE_RUBY_PACKAGE_MANAGER", ENV["VITE_RUBY_PACKAGE_MANAGER"] || packageManager);
    await ViteAssets.prewarmConfig();

    this.say("Creating binstub");
    await ViteAssets.commands().installBinstubs();

    this.say("Creating configuration files");
    await this.createConfigurationFiles();

    this.say("Installing sample files");
    await this.installSampleFiles();

    this.say("Installing js dependencies");
    await this.installJsDependencies();

    this.say("Adding files to .gitignore");
    await this.installGitignore();

    this.say("\nVite ⚡️ Ruby successfully installed! 🎉");
  }

  /** @internal */
  protected jsDependencies(): string[] {
    return [
      `vite@${ViteAssets.DEFAULT_VITE_VERSION}`,
      `vite-plugin-ruby@${ViteAssets.DEFAULT_PLUGIN_VERSION}`,
    ];
  }

  /** @internal */
  protected async setupAppFiles(): Promise<void> {
    const config = this.config();
    await this.copyTemplate("config/vite.json", { to: config.configPath });

    const rackupFile = (await this.root()).join("config.ru");
    if (await File.isExistAsync(rackupFile.toString())) {
      await this.injectLineAfterLast(
        rackupFile,
        "require",
        "use(ViteRuby::DevServerProxy, ssl_verify_none: true) if ViteRuby.run_proxy?",
      );
    }
  }

  /** @internal */
  protected async installSampleFiles(): Promise<void> {
    await this.copyTemplate("entrypoints/application.js", {
      to: this.config().resolvedEntrypointsDir().join("application.js"),
    });
  }

  /** @internal */
  private config(): Config {
    return ViteAssets.config();
  }

  static {
    for (const util of [
      "append",
      "appendUnlessPresent",
      "cp",
      "injectLineAfter",
      "injectLineAfterLast",
      "injectLineBefore",
      "replaceFirstLine",
      "write",
    ] as const) {
      Object.defineProperty(this.prototype, util, {
        value: (...args: unknown[]) =>
          (FileUtils[util] as (...args: unknown[]) => Promise<void>)(...args).catch(
            () => undefined,
          ),
        writable: true,
        configurable: true,
      });
      rbClearMethodCache();
    }
  }

  static readonly TEMPLATES_PATH = new Pathname(
    decodeURIComponent(new URL("../../templates", import.meta.url).pathname),
  );

  /** @internal */
  private copyTemplate(path: string, { to }: { to: Pathname | string }): Promise<void> {
    return this.cp(Install.TEMPLATES_PATH.join(path), to);
  }

  /** @internal */
  private async createConfigurationFiles(): Promise<void> {
    const root = await this.root();
    await this.copyTemplate("config/vite.config.ts", { to: root.join("vite.config.ts") });
    await this.append(root.join("Procfile.dev"), "vite: bin/vite dev");
    await this.setupAppFiles();
    ViteAssets.reloadWith({ configPath: this.config().configPath });
    await ViteAssets.prewarmConfig();
  }

  /** @internal */
  private async installJsDependencies(): Promise<void> {
    const root = await this.root();
    const packageJson = root.join("package.json");
    if (!(await File.isExistAsync(packageJson.toString()))) {
      await this.write(
        packageJson,
        `{
  "private": true,
  "type": "module"
}
`,
      );
    }

    let isNotModule: boolean | null;
    try {
      isNotModule = JSON.parse(await packageJson.read())["type"] !== "module";
    } catch {
      isNotModule = null;
    }
    if (isNotModule) {
      await RbFileUtils.mvAsync(
        root.join("vite.config.ts").toString(),
        root.join("vite.config.mts").toString(),
        { force: true, verbose: true },
      );
    }

    await this.installJsPackages(this.jsDependencies().join(" "));
  }

  /** @internal */
  private async installGitignore(): Promise<void> {
    const gitignoreFile = (await this.root()).join(".gitignore");
    if (!(await File.isExistAsync(gitignoreFile.toString()))) return;

    await this.append(
      gitignoreFile,
      `
# Vite Ruby
/public/vite*
node_modules
# Vite uses dotenv and suggests to ignore local-only env files. See
# https://vite.dev/guide/env-and-mode.html#env-files
*.local
`,
    );
  }

  /** @internal */
  private async root(): Promise<Pathname> {
    return (this._root ??= await this.silentWarnings(async () => this.config().root));
  }

  /** @internal */
  protected say(...args: string[]): void {
    $stdout.puts(...args);
  }

  /** @internal */
  protected async runWithCapture(
    args: string,
    options: Record<string, unknown> = {},
  ): Promise<void> {
    const root = await this.root();
    await Dir.chdir(root.toString(), async () => {
      const [, stderr, status] = await IO.capture(args, options);
      if (!(status.isSuccess() || stderr === "")) this.say(stderr);
    });
  }

  /** @internal */
  protected async installJsPackages(deps: string): Promise<void> {
    const config = this.config();
    await this.runWithCapture(`${config.packageManager} add -D ${deps}`, { stdinData: "\n" });
  }

  /** @internal */
  protected async silentWarnings<T>(block: () => Promise<T>): Promise<T> {
    const oldStderr = stderr.write;
    const io = new StringIO();
    stderr.write = (chunk) => (io.write(String(chunk)), true);
    try {
      return await block();
    } finally {
      stderr.write = oldStderr;
    }
  }
}
