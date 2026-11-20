import { env as ENV } from "@blazetrails/ruby-compat";
import { ViteAssets } from "../vite-assets.js";
import { Command } from "./command.js";

export class Clobber extends Command {
  static {
    this.desc("Clear the Vite cache, temp files, and builds");

    const currentEnv = ENV["RACK_ENV"] || ENV["TRAILS_ENV"] || "development";

    this.option("mode", {
      default: currentEnv,
      values: ["development", "production", "test"],
      aliases: ["m"],
      desc: "The mode to use",
    });
  }

  override async call({ mode }: { mode: string }): Promise<void> {
    ViteAssets.env()["VITE_RUBY_MODE"] = mode;
    await ViteAssets.prewarmConfig();
    return ViteAssets.commands().clobber();
  }
}
