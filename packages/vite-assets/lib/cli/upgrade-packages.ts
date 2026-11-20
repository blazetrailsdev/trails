import { ViteAssets } from "../vite-assets.js";
import { Install } from "./install.js";

export class UpgradePackages extends Install {
  static {
    this.desc("Upgrades the npm packages to the recommended versions.");
  }

  /** @inventedArm prewarmConfig — PERMANENT */
  override async call(): Promise<void> {
    await ViteAssets.prewarmConfig();
    this.say("Upgrading npm packages");
    await this.installJsPackages(this.jsDependencies().join(" "));
  }
}
