import { exec } from "@blazetrails/ruby-compat";
import { ViteAssets } from "../vite-assets.js";
import { Install } from "./install.js";

export class Upgrade extends Install {
  static {
    this.desc("Updates Vite Ruby related gems and npm packages.");
  }

  override async call(): Promise<void> {
    await this.upgradeRubyGems();
    this.upgradeNpmPackages();
  }

  /**
   * @internal
   * @missingRailsArgs run_with_capture — PERMANENT
   */
  protected async upgradeRubyGems(): Promise<void> {
    this.say("Updating gems");

    const libraries = (await ViteAssets.frameworkLibraries()).map(([, library]) => library.name);

    const { packageManager } = await ViteAssets.config();
    await this.runWithCapture(
      `${packageManager} update @blazetrails/vite-assets ${libraries.join(" ")}`,
    );
  }

  /** @internal */
  protected upgradeNpmPackages(): never {
    return exec("bundle exec vite upgrade_packages");
  }
}
