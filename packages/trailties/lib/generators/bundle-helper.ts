import "../constants.bundle-helper.generated.js";
import { File, rbFSystem } from "@blazetrails/ruby-compat";
import { getPackageManager } from "../package-manager.js";

interface BundleHelperHost {
  options: { quiet?: boolean };
  destinationRoot: string;
  packageManager?: string;
  sayStatus(status: unknown, message: unknown, logStatus?: unknown): void;
  execInstallCommand(
    installCommand: string,
    command: string,
    env: Record<string, string>,
    params: { quiet?: boolean },
  ): Promise<void>;
}

export const BundleHelper = {
  async installCommand(
    this: BundleHelperHost,
    command: string,
    env: Record<string, string> = {},
    params: { quiet?: boolean } = {},
  ): Promise<void> {
    const pm = getPackageManager(this.destinationRoot, {
      fallback: this.packageManager,
    });
    this.sayStatus("run", `${pm.name} ${command}`);
    await this.execInstallCommand(pm.name, command, env, params);
  },

  /** @internal */
  async execInstallCommand(
    this: BundleHelperHost,
    installCommand: string,
    command: string,
    env: Record<string, string>,
    params: { quiet?: boolean },
  ): Promise<void> {
    const fullCommand = `"${installCommand}" ${command}`;
    if (this.options.quiet || params.quiet) {
      await rbFSystem(env, fullCommand, { out: File.NULL });
    } else {
      await rbFSystem(env, fullCommand);
    }
  },
};
