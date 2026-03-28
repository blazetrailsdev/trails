/**
 * Command recorder — records migration commands for reversal.
 *
 * Mirrors: ActiveRecord::Migration::CommandRecorder
 */

export interface StraightReversions {
  invertCreateTable(args: unknown[]): unknown[];
  invertDropTable(args: unknown[]): unknown[];
  invertAddColumn(args: unknown[]): unknown[];
  invertRemoveColumn(args: unknown[]): unknown[];
  invertAddIndex(args: unknown[]): unknown[];
  invertRemoveIndex(args: unknown[]): unknown[];
  invertAddTimestamps(args: unknown[]): unknown[];
  invertRemoveTimestamps(args: unknown[]): unknown[];
}

export class CommandRecorder {
  private _commands: Array<{ cmd: string; args: unknown[] }> = [];

  get commands(): Array<{ cmd: string; args: unknown[] }> {
    return [...this._commands];
  }

  record(cmd: string, args: unknown[]): void {
    this._commands.push({ cmd, args });
  }

  inverse(): Array<{ cmd: string; args: unknown[] }> {
    return [...this._commands].reverse().map(({ cmd, args }) => {
      const invertedCmd = this._invertCommand(cmd);
      let invertedArgs: unknown[] = args;

      if (cmd === "renameTable") {
        invertedArgs = [...args].reverse();
      } else if (cmd === "renameColumn" || cmd === "renameIndex") {
        if (args.length >= 3) {
          const [table, from, to, ...rest] = args;
          invertedArgs = [table, to, from, ...rest];
        }
      }

      return { cmd: invertedCmd, args: invertedArgs };
    });
  }

  private _invertCommand(cmd: string): string {
    const inversions: Record<string, string> = {
      createTable: "dropTable",
      dropTable: "createTable",
      addColumn: "removeColumn",
      removeColumn: "addColumn",
      addIndex: "removeIndex",
      removeIndex: "addIndex",
      addTimestamps: "removeTimestamps",
      removeTimestamps: "addTimestamps",
      addReference: "removeReference",
      removeReference: "addReference",
      addForeignKey: "removeForeignKey",
      removeForeignKey: "addForeignKey",
      addCheckConstraint: "removeCheckConstraint",
      removeCheckConstraint: "addCheckConstraint",
      enableExtension: "disableExtension",
      disableExtension: "enableExtension",
      renameTable: "renameTable",
      renameColumn: "renameColumn",
      renameIndex: "renameIndex",
    };

    const inverted = inversions[cmd];
    if (!inverted) {
      throw new Error(`${cmd} is not reversible`);
    }
    return inverted;
  }
}
