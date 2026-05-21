import { Command } from "commander";
import { VERSION } from "./version.js";
import { newCommand } from "./commands/new.js";
import { generateCommand } from "./commands/generate.js";
import { serverCommand } from "./commands/server.js";
import { dbCommand } from "./commands/db.js";
import { routesCommand } from "./commands/routes.js";
import { consoleCommand } from "./commands/console.js";
import { destroyCommand } from "./commands/destroy.js";
import { appTemplateCommand } from "./commands/app.js";
import { notesCommand } from "./commands/notes.js";
import { statsCommand } from "./commands/stats.js";
import { credentialsCommand } from "./commands/credentials.js";
import { encryptedCommand } from "./commands/encrypted.js";

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

  program.addCommand(newCommand());
  program.addCommand(generateCommand());
  program.addCommand(serverCommand());
  program.addCommand(dbCommand());
  program.addCommand(routesCommand());
  program.addCommand(consoleCommand());
  program.addCommand(destroyCommand());
  program.addCommand(appTemplateCommand());
  program.addCommand(notesCommand());
  program.addCommand(statsCommand());
  program.addCommand(credentialsCommand());
  program.addCommand(encryptedCommand());

  return program;
}
