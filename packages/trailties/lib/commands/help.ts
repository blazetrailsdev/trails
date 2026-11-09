import "../constants.help.generated.js";
import type { ThorClass } from "@blazetrails/thor";
import { Base } from "../command/base.js";
import { printingCommands } from "../command.js";

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
  static {
    const klass = this as unknown as ThorClass;
    this.hideCommandBang();

    klass.methodAdded("help");
    klass.methodAdded("helpExtended");
  }

  async help(..._args: unknown[]): Promise<void> {
    this.say(await (this.constructor as typeof HelpCommand).classUsage());
  }

  async helpExtended(..._args: unknown[]): Promise<void> {
    await this.help();

    this.say("");
    this.say("In addition to those commands, there are:");
    this.say("");

    const extendedCommands = (await this.printingCommandsNotInUsage()).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    this.printTable(extendedCommands, { truncate: true });
  }

  /** @internal */
  private static readonly COMMANDS_IN_USAGE = [
    "generate",
    "console",
    "server",
    "test",
    "test:system",
    "dbconsole",
    "new",
  ];

  /** @internal */
  private async printingCommandsNotInUsage(): Promise<[string, string | null][]> {
    return (await printingCommands()).filter(
      ([command]) => !HelpCommand.COMMANDS_IN_USAGE.includes(command),
    );
  }
}
