import { File } from "@blazetrails/ruby-compat";
import type { ThorClass } from "@blazetrails/thor";
import { Command } from "commander";
import { AppGenerator } from "../generators/rails/app/app-generator.js";
import { getPackageManager, packageManagerInstall } from "../package-manager.js";

/** @noRailsEquivalent CONVERGEABLE app-generator-run-bundle-and-after-bundle-callbacks */
class NewAppGenerator extends AppGenerator {
  declare static generator: AppGenerator | undefined;

  static isExitOnFailure(): boolean {
    return true;
  }

  static sourceRoot(): Promise<string | null | undefined> {
    return AppGenerator.sourceRoot();
  }

  static dispatch(...[command, givenArgs, givenOpts, config]: Parameters<ThorClass["dispatch"]>) {
    const parent = (AppGenerator as unknown as ThorClass).dispatch;
    return parent.call(
      this as unknown as ThorClass,
      command,
      givenArgs,
      givenOpts,
      config,
      (instance: unknown) => {
        this.generator = instance as AppGenerator;
      },
    );
  }
}

export function newCommand(): Command {
  const cmd = new Command("new");

  cmd
    .description("Create a new trails application")
    .helpOption(false)
    .allowUnknownOption()
    .allowExcessArguments()
    .action(async (_options, command: Command) => {
      NewAppGenerator.generator = undefined;
      await (NewAppGenerator as unknown as ThorClass).start(command.args);
      const generator = NewAppGenerator.generator as AppGenerator | undefined;
      if (generator === undefined || generator.options.pretend) return;

      const name = String(generator.appPath);
      const appDir = File.expandPath(name);
      const pm = generator.packageManager;

      if (!generator.options.skipBundle) {
        console.log(`  Installing dependencies with ${pm}...`);
        const pmAdapter = getPackageManager(appDir, { fallback: pm });
        const result = packageManagerInstall(appDir, pmAdapter);
        if (result.status === 0) {
          console.log("  Dependencies installed");
        } else {
          console.log(`  Could not install dependencies — run '${pm} install' manually`);
        }
      }

      console.log("");
      console.log(`  Done! cd ${name} && trails server`);
    });

  return cmd;
}
