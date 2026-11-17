import { ArgumentError, exec, rbInspect } from "@blazetrails/ruby-compat";
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

  /** @internal */
  protected async upgradeRubyGems(): Promise<void> {
    this.say("Updating gems");

    const libraries = (await ViteAssets.frameworkLibraries()).map(([, library]) => library.name);

    const { packageManager } = await ViteAssets.config();
    let update: string;
    switch (packageManager) {
      case "npm":
      case "pnpm":
      case "bun":
        update = "update";
        break;
      case "yarn":
        update = "upgrade";
        break;
      default:
        throw new ArgumentError(`Unknown package manager ${rbInspect(packageManager)}`);
    }

    await this.runWithCapture(
      `${packageManager} ${update} @blazetrails/vite-assets ${libraries.join(" ")}`,
    );
  }

  /**
   * @internal
   * @missingRailsArgs exec — PERMANENT
   */
  protected upgradeNpmPackages(): never {
    return exec("bin/vite upgrade_packages");
  }
}
