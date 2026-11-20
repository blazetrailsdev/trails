import { ViteAssets } from "../vite-assets.js";
import { Command } from "./command.js";

export class Version extends Command {
  static {
    this.desc("Print version");
  }

  override async call(): Promise<void> {
    await ViteAssets.prewarmConfig();
    return ViteAssets.commands().printInfo();
  }
}
