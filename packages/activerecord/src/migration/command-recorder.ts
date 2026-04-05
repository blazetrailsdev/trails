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
  private _delegate: unknown;
  private _reverting = false;

  constructor(delegate?: unknown) {
    this._delegate = delegate ?? null;
  }

  get delegate(): unknown {
    return this._delegate;
  }

  get reverting(): boolean {
    return this._reverting;
  }

  get commands(): Array<{ cmd: string; args: unknown[] }> {
    return [...this._commands];
  }

  record(cmd: string, args: unknown[]): void {
    this._commands.push({ cmd, args });
  }

  /**
   * Execute a block in reverting mode. Commands recorded inside the block
   * are collected, reversed, and their inverses are appended to the
   * command list.
   *
   * Mirrors: ActiveRecord::Migration::CommandRecorder#revert
   */
  async revert(fn: () => Promise<void>): Promise<void> {
    const was = this._reverting;
    this._reverting = !was;
    const savedCommands = this._commands;
    this._commands = [];
    try {
      await fn();
      const reversed = this._commands.reverse().map(({ cmd, args }) => ({
        cmd: this._invertCommand(cmd),
        args: this._invertArgs(cmd, args),
      }));
      this._commands = savedCommands;
      for (const entry of reversed) {
        this._commands.push(entry);
      }
    } catch (e) {
      this._commands = savedCommands;
      throw e;
    } finally {
      this._reverting = was;
    }
  }

  /**
   * Returns the inverse command and args for the given command.
   *
   * Mirrors: ActiveRecord::Migration::CommandRecorder#inverse_of
   */
  inverseOf(cmd: string, args: unknown[]): { cmd: string; args: unknown[] } {
    return {
      cmd: this._invertCommand(cmd),
      args: this._invertArgs(cmd, args),
    };
  }

  /**
   * Record a change_table block. In Rails, this captures the operations
   * performed inside the block for later reversal.
   *
   * Mirrors: ActiveRecord::Migration::CommandRecorder#change_table
   */
  changeTable(tableName: string, options: Record<string, unknown> = {}): void {
    this.record("changeTable", [tableName, options]);
  }

  /**
   * Replay all recorded commands against the given migration.
   *
   * Mirrors: ActiveRecord::Migration::CommandRecorder#replay
   */
  async replay(migration: { [key: string]: (...args: any[]) => Promise<void> }): Promise<void> {
    for (const { cmd, args } of this._commands) {
      if (typeof migration[cmd] === "function") {
        await migration[cmd](...args);
      }
    }
  }

  /**
   * Returns the full inverse command list (all recorded commands reversed
   * with their operations inverted).
   */
  inverse(): Array<{ cmd: string; args: unknown[] }> {
    return [...this._commands].reverse().map(({ cmd, args }) => ({
      cmd: this._invertCommand(cmd),
      args: this._invertArgs(cmd, args),
    }));
  }

  private _invertArgs(cmd: string, args: unknown[]): unknown[] {
    if (cmd === "renameTable") {
      return [...args].reverse();
    } else if (cmd === "renameColumn" || cmd === "renameIndex") {
      if (args.length >= 3) {
        const [table, from, to, ...rest] = args;
        return [table, to, from, ...rest];
      }
    }
    return args;
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
      changeTable: "changeTable",
      changeColumnDefault: "changeColumnDefault",
      changeColumnNull: "changeColumnNull",
    };

    const inverted = inversions[cmd];
    if (!inverted) {
      throw new Error(`${cmd} is not reversible`);
    }
    return inverted;
  }
}
