import { ViteAssets } from "../vite-assets.js";
import { Vite, type ViteOptions } from "./vite.js";

export class Build extends Vite {
  static override readonly DEFAULT_ENV = Vite.CURRENT_ENV || "production";

  static {
    this.desc("Bundle all entrypoints using Vite.");
    this.sharedOptions();
    this.option("ssr", { desc: "Build the SSR entrypoint instead", type: "boolean" });
    this.option("force", {
      desc: "Force the build even if assets have not changed",
      type: "boolean",
    });
    this.option("watch", {
      desc: "Start the Rollup watcher and rebuild on files changes",
      type: "boolean",
    });
    this.option("profile", { desc: "Gather performance metrics from the build ", type: "boolean" });
  }

  override call(options: ViteOptions): Promise<unknown> {
    return super.call(options, (args) => ViteAssets.commands().buildFromTask(...args));
  }
}
