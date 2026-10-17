import { Command } from "commander";
import { VERSION } from "./version.js";
import { hiddenCommands } from "./command.js";
import { subclasses } from "./command/behavior.js";

export { Trails } from "./rails.js";
export { Application } from "./application.js";
export { Engine } from "./engine.js";
export { Trailtie } from "./trailtie.js";

export {
  registerPackageManagerAdapter,
  packageManagerAdapterConfig,
  detectPackageManager,
  getPackageManager,
  packageManagerInstall,
  type PackageManagerAdapter,
} from "./package-manager.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("trails")
    .description("TypeScript framework inspired by Ruby on Rails")
    .enablePositionalOptions()
    .version(VERSION, "-v, --version");

  for (const factory of subclasses()) {
    const command = factory();
    program.addCommand(command, {
      hidden: hiddenCommands().some((klass) => klass.commandName() === command.name()),
    });
  }

  return program;
}
