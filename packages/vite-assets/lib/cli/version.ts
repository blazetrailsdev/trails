import { ViteAssets } from "../vite-assets.js";
import { Command } from "./command.js";

export class Version extends Command {
  static {
    this.desc("Print version");
  }

  override call(): Promise<void> {
    return ViteAssets.commands().printInfo();
  }
}
