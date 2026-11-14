import { ArgumentError, Errno, exec, File, rbInspect } from "@blazetrails/ruby-compat";
import type { Config } from "./config.js";
import { IO } from "./io.js";
import { MissingExecutableError } from "./missing-executable-error.js";
import type { ViteAssets } from "./vite-assets.js";

export class Runner {
  /** @internal */
  private readonly _viteRuby: ViteAssets;

  constructor(viteRuby: ViteAssets) {
    this._viteRuby = viteRuby;
  }

  /**
   * @missingRailsCall within_root — PERMANENT
   * @missingRailsArgs exec — CONVERGEABLE vite-assets-framework-libraries-reads-loaded-packages
   */
  async run(argv: string[], { exec: isExec = false }: { exec?: boolean } = {}): Promise<unknown> {
    try {
      const config = await this.config();
      const cmd = await this.commandFor(argv);
      if (isExec) return exec(...(cmd.slice(1) as [string, ...string[]]));

      const logOrNoop = config.hideBuildConsoleOutput
        ? null
        : (line: string) => this.logger.info("vite", () => line);
      return await IO.capture(...cmd, { chdir: config.root.toString(), withOutput: logOrNoop });
    } catch (error) {
      if (error instanceof Errno.ENOENT) throw new MissingExecutableError(error);
      throw error;
    }
  }

  /** @internal */
  private config(): Promise<Config> {
    return this._viteRuby.config();
  }

  /** @internal */
  private get logger() {
    return this._viteRuby.logger;
  }

  /** @internal */
  private env(): Record<string, string> {
    return this._viteRuby.env();
  }

  /** @internal */
  private async commandFor(args: string[]): Promise<[Record<string, string>, ...string[]]> {
    const config = await this.config();
    const cmd: [Record<string, string>, ...string[]] = [config.toEnv(this.env())];
    const execArgs = args.filter((arg) => arg.startsWith("--node-options"));
    const viteArgs = args.filter((arg) => !arg.startsWith("--node-options"));
    cmd.push(...(await this.viteExecutable(...execArgs)));
    cmd.push(...viteArgs);
    if (!(args.includes("--mode") || args.includes("-m"))) cmd.push("--mode", config.mode);
    return cmd;
  }

  /** @internal */
  private async viteExecutable(...execArgs: string[]): Promise<string[]> {
    const config = await this.config();
    const binPath = config.viteBinPath;
    if (
      binPath != null &&
      (await File.isExistAsync(File.expandPath(binPath, config.root.toString())))
    ) {
      return [binPath];
    }

    let x: string[];
    switch (config.packageManager) {
      case "npm":
        x = ["npx"];
        break;
      case "pnpm":
        x = ["pnpm", "exec"];
        break;
      case "bun":
        x = ["bun", "x", "--bun"];
        break;
      case "yarn":
        x = ["yarn"];
        break;
      default:
        throw new ArgumentError(`Unknown package manager ${rbInspect(config.packageManager)}`);
    }

    return [...x, ...execArgs, "vite"];
  }
}
