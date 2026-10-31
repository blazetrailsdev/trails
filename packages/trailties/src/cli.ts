import { Command } from "commander";
import { VERSION } from "./gem-version.js";
import { hiddenCommands } from "./command.js";
import { commanderFactories } from "./command/behavior.js";

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
    .version(VERSION.STRING, "-v, --version");

  for (const factory of commanderFactories()) {
    const command = factory();
    program.addCommand(command, {
      hidden: hiddenCommands().some((klass) => klass.commandName() === command.name()),
    });
  }

  return program;
}
