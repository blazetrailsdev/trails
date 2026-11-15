import { env as ENV } from "@blazetrails/ruby-compat";
import { ViteAssets } from "../vite-assets.js";
import { Command } from "./command.js";

const currentEnv = ENV["RACK_ENV"] || ENV["TRAILS_ENV"] || "development";

export class Clobber extends Command {
  static {
    this.desc("Clear the Vite cache, temp files, and builds");

    this.option("mode", {
      default: currentEnv,
      values: ["development", "production", "test"],
      aliases: ["m"],
      desc: "The mode to use",
    });
  }

  override call({ mode }: { mode: string }): Promise<void> {
    ViteAssets.env()["VITE_RUBY_MODE"] = mode;
    return ViteAssets.commands().clobber();
  }
}
