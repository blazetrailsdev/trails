import { ViteAssets } from "../vite-assets.js";
import { Vite, type ViteOptions } from "./vite.js";

export class Dev extends Vite {
  static override readonly DEFAULT_ENV = Vite.CURRENT_ENV || "development";

  static {
    this.desc("Start the Vite development server.");
    this.sharedOptions();
    this.option("force", { desc: "Force Vite to re-bundle dependencies", type: "boolean" });
  }

  override call(options: ViteOptions): Promise<unknown> {
    return super.call(options, (args) => ViteAssets.run(args, { exec: true }));
  }
}
