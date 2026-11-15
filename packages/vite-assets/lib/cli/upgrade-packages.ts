import { Install } from "./install.js";

export class UpgradePackages extends Install {
  static {
    this.desc("Upgrades the npm packages to the recommended versions.");
  }

  override async call(): Promise<void> {
    this.say("Upgrading npm packages");
    await this.installJsPackages(this.jsDependencies().join(" "));
  }
}
