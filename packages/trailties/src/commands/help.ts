import { Command } from "commander";
import { Base } from "../command/base.js";

const USAGE = `Usage:
  bin/trails COMMAND [options]

You must specify a command. The most common commands are:

  generate     Generate new code (short-cut alias: "g")
  console      Start the Trails console (short-cut alias: "c")
  server       Start the Trails server (short-cut alias: "s")
  new          Create a new Trails application

All commands can be run with -h (or --help) for more information.`;

const COMMANDS_IN_USAGE = [
  "generate",
  "console",
  "server",
  "test",
  "test:system",
  "dbconsole",
  "new",
];

export class HelpCommand extends Base {
  declare options: { program: Command };

  static override classUsage(): string {
    return USAGE;
  }

  help(..._args: string[]): void {
    this.say((this.constructor as typeof HelpCommand).classUsage());
  }

  helpExtended(..._args: string[]): void {
    this.help();

    this.say("");
    this.say("In addition to those commands, there are:");
    this.say("");

    const extendedCommands = this.printingCommandsNotInUsage().sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    const width = Math.max(0, ...extendedCommands.map(([command]) => command.length));
    for (const [command, desc] of extendedCommands)
      this.say(`${command.padEnd(width)}  ${desc}`.trimEnd());
  }

  /** @internal */
  private printingCommandsNotInUsage(): Array<[string, string]> {
    const program = this.options.program;
    return program
      .createHelp()
      .visibleCommands(program)
      .map((command): [string, string] => [command.name(), command.description()])
      .filter(([command]) => !COMMANDS_IN_USAGE.includes(command));
  }
}

export function helpCommand(): Command {
  const cmd = new Command("help");
  cmd
    .argument("[args...]")
    .action((args: string[], _opts: unknown, command: Command) =>
      new HelpCommand({ program: command.parent! }).help(...args),
    );
  cmd
    .command("help_extended")
    .argument("[args...]")
    .action((args: string[], _opts: unknown, command: Command) =>
      new HelpCommand({ program: command.parent!.parent! }).helpExtended(...args),
    );
  return cmd;
}
