import { env as ENV } from "@blazetrails/ruby-compat";
import { ViteAssets } from "../vite-assets.js";
import { Command } from "./command.js";

export interface ViteOptions {
  mode: string;
  args?: string[];
  clobber?: boolean;
  nodeOptions?: string | null;
  inspect?: boolean | null;
  traceDeprecation?: boolean | null;
  [name: string]: unknown;
}

export class Vite extends Command {
  static readonly CURRENT_ENV: string | undefined = ENV["RACK_ENV"] || ENV["TRAILS_ENV"];
  declare static readonly DEFAULT_ENV: string;

  static executableOptions(): void {
    this.option("mode", {
      default: this.DEFAULT_ENV,
      values: ["development", "production", "test"],
      aliases: ["m"],
      desc: "The build mode for Vite",
    });
    this.option("node_options", {
      desc: "Node options for the Vite executable",
      aliases: ["node-options"],
    });
    this.option("inspect", {
      desc: "Run Vite in a debugging session with node --inspect-brk",
      aliases: ["inspect-brk"],
      type: "boolean",
    });
    this.option("trace_deprecation", {
      desc: "Run Vite in debugging mode with node --trace-deprecation",
      aliases: ["trace-deprecation"],
      type: "boolean",
    });
  }

  static sharedOptions(): void {
    this.executableOptions();
    this.option("debug", {
      desc: "Run Vite in verbose mode, printing all debugging output",
      aliases: ["verbose"],
      type: "boolean",
    });
    this.option("clobber", {
      desc: "Clear cache and previous builds",
      type: "boolean",
      aliases: ["clean", "clear"],
    });
  }

  override async call(
    {
      mode,
      args = [],
      clobber = false,
      nodeOptions = null,
      inspect = null,
      traceDeprecation = null,
      ...booleanOpts
    }: ViteOptions,
    block?: (args: string[]) => unknown,
  ): Promise<unknown> {
    ViteAssets.env()["VITE_RUBY_MODE"] = mode;
    await ViteAssets.prewarmConfig();
    if (clobber) await ViteAssets.commands().clobber();

    const nodeOptionsArg = [
      nodeOptions,
      inspect ? "--inspect-brk" : null,
      traceDeprecation ? "--trace-deprecation" : null,
    ]
      .filter((x) => x != null)
      .join(" ");

    if (nodeOptionsArg !== "") args.push(`--node-options="${nodeOptionsArg}"`);

    for (const [name, value] of Object.entries(booleanOpts)) if (value) args.push(`--${name}`);

    return block!(args);
  }
}
