/**
 * Command recorder — records migration commands for reversal.
 *
 * Mirrors: ActiveRecord::Migration::CommandRecorder
 */

import { IrreversibleMigration } from "../migration.js";
import {
  findJoinTableName as _findJoinTableName,
  joinTableName as _joinTableName,
} from "./join-table.js";

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

  set reverting(value: boolean) {
    this._reverting = value;
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
      const reversed = this._commands.reverse().map(({ cmd, args }) => {
        const [invertedCmd, invertedArgs] = this._dispatchInvert(cmd, args);
        return { cmd: invertedCmd, args: invertedArgs };
      });
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
    const [invertedCmd, invertedArgs] = this._dispatchInvert(cmd, args);
    return { cmd: invertedCmd, args: invertedArgs };
  }

  /**
   * Record a change_table block. When a callback is given, operations inside
   * the block are individually recorded so they can be inverted.  With
   * `bulk: true` the operations are captured into a sub-recorder and stored as
   * a single batched command (mirrors the Rails bulk alter path).
   *
   * Mirrors: ActiveRecord::Migration::CommandRecorder#change_table
   */
  async changeTable(
    tableName: string,
    options: Record<string, unknown> = {},
    fn?: (t: RecorderTableProxy) => Promise<void> | void,
  ): Promise<void> {
    if (!fn) {
      this.record("changeTable", [tableName, options]);
      return;
    }

    const supportsBulk =
      typeof (this._delegate as any)?.supportsBulkAlter === "function" &&
      (this._delegate as any).supportsBulkAlter() === true;

    if (options["bulk"] && supportsBulk) {
      // Bulk path: sub-recorder captures commands, parent stores a single
      // changeTable entry that invertChangeTable knows how to flip.
      const sub = new CommandRecorder(this._delegate);
      sub.reverting = this._reverting;
      const proxy = new RecorderTableProxy(tableName, sub);
      await fn(proxy);
      this._commands.push({ cmd: "changeTable", args: [tableName, sub.commands] });
    } else {
      // Non-bulk: route operations directly through this recorder so the
      // enclosing revert() block can invert them individually.
      const proxy = new RecorderTableProxy(tableName, this);
      await fn(proxy);
    }
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

  /** Returns the full inverse command list. */
  inverse(): Array<{ cmd: string; args: unknown[] }> {
    return [...this._commands].reverse().map(({ cmd, args }) => {
      const [invertedCmd, invertedArgs] = this._dispatchInvert(cmd, args);
      return { cmd: invertedCmd, args: invertedArgs };
    });
  }

  // ---------------------------------------------------------------------------
  // invert* methods — mirrors Rails private StraightReversions + overrides
  // ---------------------------------------------------------------------------

  /** @internal */
  invertCreateTable(args: unknown[]): [string, unknown[]] {
    const a = args.slice();
    // createTable may be recorded as [name, options, fn] — find the trailing options hash
    let optsIdx = -1;
    for (let i = a.length - 1; i >= 0; i--) {
      const el = a[i];
      if (typeof el === "object" && el !== null && !Array.isArray(el)) {
        optsIdx = i;
        break;
      }
    }
    if (optsIdx !== -1) {
      const opts = { ...(a[optsIdx] as Record<string, unknown>) };
      delete opts["ifNotExists"];
      a[optsIdx] = opts;
    }
    return ["dropTable", a];
  }

  /** @internal */
  invertDropTable(args: unknown[]): [string, unknown[]] {
    const a = args.slice();
    let options: Record<string, unknown> = {};
    if (a.length > 0 && typeof a[a.length - 1] === "object" && a[a.length - 1] !== null) {
      options = { ...(a.pop() as Record<string, unknown>) };
    }
    delete options["ifExists"];

    if (a.length > 1) {
      throw new IrreversibleMigration(
        "To avoid mistakes, drop_table is only reversible if given a single table name.",
      );
    }
    if (a.length === 1 && Object.keys(options).length === 0) {
      throw new IrreversibleMigration(
        "To avoid mistakes, drop_table is only reversible if given options or a block (can be empty).",
      );
    }

    const result = [...a];
    if (Object.keys(options).length > 0) result.push(options);
    return ["createTable", result];
  }

  /** @internal */
  invertCreateJoinTable(args: unknown[]): [string, unknown[]] {
    return ["dropJoinTable", args];
  }

  /** @internal */
  invertDropJoinTable(args: unknown[]): [string, unknown[]] {
    return ["createJoinTable", args];
  }

  /** @internal */
  invertAddColumn(args: unknown[]): [string, unknown[]] {
    return ["removeColumn", args];
  }

  /** @internal */
  invertRemoveColumn(args: unknown[]): [string, unknown[]] {
    if (args.length <= 2) {
      throw new IrreversibleMigration("remove_column is only reversible if given a type.");
    }
    return ["addColumn", args];
  }

  /** @internal */
  invertAddIndex(args: unknown[]): [string, unknown[]] {
    return ["removeIndex", args];
  }

  /** @internal */
  invertRemoveIndex(args: unknown[]): [string, unknown[]] {
    const a = args.slice();
    let options: Record<string, unknown> = {};
    // extract_options! only strips a trailing Hash, never an Array (which is a column list)
    if (
      a.length > 0 &&
      typeof a[a.length - 1] === "object" &&
      a[a.length - 1] !== null &&
      !Array.isArray(a[a.length - 1])
    ) {
      options = { ...(a.pop() as Record<string, unknown>) };
    }
    const table = a[0];
    let columns = a[1] as unknown;
    if (columns === undefined) {
      columns = options["column"];
      delete options["column"];
    }
    if (!columns) {
      throw new IrreversibleMigration("remove_index is only reversible if given a :column option.");
    }
    delete options["ifExists"];
    const result: unknown[] = [table, columns];
    if (Object.keys(options).length > 0) result.push(options);
    return ["addIndex", result];
  }

  /** @internal */
  invertAddTimestamps(args: unknown[]): [string, unknown[]] {
    return ["removeTimestamps", args];
  }

  /** @internal */
  invertRemoveTimestamps(args: unknown[]): [string, unknown[]] {
    return ["addTimestamps", args];
  }

  /** @internal */
  invertAddReference(args: unknown[]): [string, unknown[]] {
    return ["removeReference", args];
  }

  /** @internal */
  invertRemoveReference(args: unknown[]): [string, unknown[]] {
    return ["addReference", args];
  }

  /** @internal */
  invertAddForeignKey(args: unknown[]): [string, unknown[]] {
    const a = args.slice();
    if (a.length > 0 && typeof a[a.length - 1] === "object" && a[a.length - 1] !== null) {
      const opts = { ...(a[a.length - 1] as Record<string, unknown>) };
      delete opts["validate"];
      a[a.length - 1] = opts;
    }
    return ["removeForeignKey", a];
  }

  /** @internal */
  invertRemoveForeignKey(args: unknown[]): [string, unknown[]] {
    const a = args.slice();
    let options: Record<string, unknown> = {};
    if (a.length > 0 && typeof a[a.length - 1] === "object" && a[a.length - 1] !== null) {
      options = { ...(a.pop() as Record<string, unknown>) };
    }
    const fromTable = a[0];
    let toTable = a[1] as unknown;
    if (toTable === undefined) {
      toTable = options["toTable"];
      delete options["toTable"];
    }
    if (!toTable) {
      throw new IrreversibleMigration(
        "remove_foreign_key is only reversible if given a second table",
      );
    }
    const result: unknown[] = [fromTable, toTable];
    if (Object.keys(options).length > 0) result.push(options);
    return ["addForeignKey", result];
  }

  /** @internal */
  invertAddCheckConstraint(args: unknown[]): [string, unknown[]] {
    const a = args.slice();
    if (a.length > 0 && typeof a[a.length - 1] === "object" && a[a.length - 1] !== null) {
      const opts = { ...(a[a.length - 1] as Record<string, unknown>) };
      delete opts["validate"];
      if ("ifNotExists" in opts) {
        opts["ifExists"] = opts["ifNotExists"];
        delete opts["ifNotExists"];
      }
      a[a.length - 1] = opts;
    }
    return ["removeCheckConstraint", a];
  }

  /** @internal */
  invertRemoveCheckConstraint(args: unknown[]): [string, unknown[]] {
    if (args.length < 2) {
      throw new IrreversibleMigration(
        "remove_check_constraint is only reversible if given an expression.",
      );
    }
    const a = args.slice();
    if (a.length > 0 && typeof a[a.length - 1] === "object" && a[a.length - 1] !== null) {
      const opts = { ...(a[a.length - 1] as Record<string, unknown>) };
      if ("ifExists" in opts) {
        opts["ifNotExists"] = opts["ifExists"];
        delete opts["ifExists"];
      }
      a[a.length - 1] = opts;
    }
    return ["addCheckConstraint", a];
  }

  /** @internal */
  invertAddExclusionConstraint(args: unknown[]): [string, unknown[]] {
    return ["removeExclusionConstraint", args];
  }

  /** @internal */
  invertRemoveExclusionConstraint(args: unknown[]): [string, unknown[]] {
    if (args.length < 2) {
      throw new IrreversibleMigration(
        "remove_exclusion_constraint is only reversible if given an expression.",
      );
    }
    return ["addExclusionConstraint", args];
  }

  /** @internal */
  invertAddUniqueConstraint(args: unknown[]): [string, unknown[]] {
    const options =
      args.length > 0 && typeof args[args.length - 1] === "object" && args[args.length - 1] !== null
        ? (args[args.length - 1] as Record<string, unknown>)
        : {};
    if (options["usingIndex"]) {
      throw new IrreversibleMigration(
        "add_unique_constraint is not reversible if given an using_index.",
      );
    }
    return ["removeUniqueConstraint", args];
  }

  /** @internal */
  invertRemoveUniqueConstraint(args: unknown[]): [string, unknown[]] {
    const a = args.slice();
    // extract_options! only strips a trailing Hash, never an Array
    if (
      a.length > 0 &&
      typeof a[a.length - 1] === "object" &&
      a[a.length - 1] !== null &&
      !Array.isArray(a[a.length - 1])
    ) {
      a.pop();
    }
    const columns = a[1];
    if (!columns) {
      throw new IrreversibleMigration(
        "remove_unique_constraint is only reversible if given an column_name.",
      );
    }
    return ["addUniqueConstraint", args];
  }

  /** @internal */
  invertRenameTable(args: unknown[]): [string, unknown[]] {
    const [oldName, newName, ...rest] = args;
    const result: unknown[] = [newName, oldName];
    if (rest.length > 0) result.push(...rest);
    return ["renameTable", result];
  }

  /** @internal */
  invertRenameColumn(args: unknown[]): [string, unknown[]] {
    const [table, oldName, newName, ...rest] = args;
    return ["renameColumn", [table, newName, oldName, ...rest]];
  }

  /** @internal */
  invertChangeColumn(_args: unknown[]): [string, unknown[]] {
    throw new IrreversibleMigration(
      "change_column is not reversible. Use change_column_default or change_column_null instead.",
    );
  }

  /** @internal */
  invertChangeTable(args: unknown[]): [string, unknown[]] {
    const [tableName, subCommands] = args as [string, Array<{ cmd: string; args: unknown[] }>];
    const inverted = [...subCommands].reverse().map(({ cmd, args: subArgs }) => {
      const [iCmd, iArgs] = this._dispatchInvert(cmd, subArgs);
      return { cmd: iCmd, args: iArgs };
    });
    return ["changeTable", [tableName, inverted]];
  }

  /** @internal */
  invertTransaction(args: unknown[]): [string, unknown[]] {
    throw new IrreversibleMigration(
      "This migration uses transaction, which is not automatically reversible.",
    );
  }

  /** @internal */
  invertRemoveColumns(args: unknown[]): [string, unknown[]] {
    const last = args[args.length - 1];
    if (
      !(typeof last === "object" && last !== null && "type" in (last as Record<string, unknown>))
    ) {
      throw new IrreversibleMigration("remove_columns is only reversible if given a type.");
    }
    return ["addColumns", args];
  }

  /** @internal */
  invertRenameIndex(args: unknown[]): [string, unknown[]] {
    const [table, oldName, newName] = args;
    return ["renameIndex", [table, newName, oldName]];
  }

  /** @internal */
  invertChangeColumnDefault(args: unknown[]): [string, unknown[]] {
    const [table, column, options] = args;
    if (
      !(
        typeof options === "object" &&
        options !== null &&
        "from" in (options as Record<string, unknown>) &&
        "to" in (options as Record<string, unknown>)
      )
    ) {
      throw new IrreversibleMigration(
        "change_column_default is only reversible if given a :from and :to option.",
      );
    }
    const opts = options as Record<string, unknown>;
    return ["changeColumnDefault", [table, column, { from: opts["to"], to: opts["from"] }]];
  }

  /** @internal */
  invertChangeColumnNull(args: unknown[]): [string, unknown[]] {
    const a = args.slice() as unknown[];
    (a as unknown[])[2] = !(a[2] as boolean);
    return ["changeColumnNull", a];
  }

  /** @internal */
  invertChangeColumnComment(args: unknown[]): [string, unknown[]] {
    const [table, column, options] = args;
    if (
      !(
        typeof options === "object" &&
        options !== null &&
        "from" in (options as Record<string, unknown>) &&
        "to" in (options as Record<string, unknown>)
      )
    ) {
      throw new IrreversibleMigration(
        "change_column_comment is only reversible if given a :from and :to option.",
      );
    }
    const opts = options as Record<string, unknown>;
    return ["changeColumnComment", [table, column, { from: opts["to"], to: opts["from"] }]];
  }

  /** @internal */
  invertChangeTableComment(args: unknown[]): [string, unknown[]] {
    const [table, options] = args;
    if (
      !(
        typeof options === "object" &&
        options !== null &&
        "from" in (options as Record<string, unknown>) &&
        "to" in (options as Record<string, unknown>)
      )
    ) {
      throw new IrreversibleMigration(
        "change_table_comment is only reversible if given a :from and :to option.",
      );
    }
    const opts = options as Record<string, unknown>;
    return ["changeTableComment", [table, { from: opts["to"], to: opts["from"] }]];
  }

  /** @internal */
  invertCreateEnum(args: unknown[]): [string, unknown[]] {
    return ["dropEnum", args];
  }

  /** @internal */
  invertEnableExtension(args: unknown[]): [string, unknown[]] {
    return ["disableExtension", args];
  }

  /** @internal */
  invertDisableExtension(args: unknown[]): [string, unknown[]] {
    return ["enableExtension", args];
  }

  /** @internal */
  invertDropEnum(args: unknown[]): [string, unknown[]] {
    // Mirror Rails: extract_options! strips trailing hash, then check second positional arg
    const a = args.slice();
    if (
      a.length > 0 &&
      typeof a[a.length - 1] === "object" &&
      a[a.length - 1] !== null &&
      !Array.isArray(a[a.length - 1])
    ) {
      a.pop();
    }
    if (a[1] === undefined) {
      throw new IrreversibleMigration(
        "drop_enum is only reversible if given a list of enum values.",
      );
    }
    return ["createEnum", args];
  }

  /** @internal */
  invertRenameEnum(args: unknown[]): [string, unknown[]] {
    const [name, newName] = args;
    const resolvedNewName =
      typeof newName === "object" &&
      newName !== null &&
      "to" in (newName as Record<string, unknown>)
        ? (newName as Record<string, unknown>)["to"]
        : newName;
    return ["renameEnum", [resolvedNewName, name]];
  }

  /** @internal */
  invertRenameEnumValue(args: unknown[]): [string, unknown[]] {
    const [typeName, options] = args;
    if (
      !(
        typeof options === "object" &&
        options !== null &&
        "from" in (options as Record<string, unknown>) &&
        "to" in (options as Record<string, unknown>)
      )
    ) {
      throw new IrreversibleMigration(
        "rename_enum_value is only reversible if given a :from and :to option.",
      );
    }
    const opts = options as Record<string, unknown>;
    return ["renameEnumValue", [typeName, { from: opts["to"], to: opts["from"] }]];
  }

  /** @internal */
  invertDropVirtualTable(args: unknown[]): [string, unknown[]] {
    // Mirror Rails: extract_options! strips trailing hash, then check second positional arg
    const a = args.slice();
    if (
      a.length > 0 &&
      typeof a[a.length - 1] === "object" &&
      a[a.length - 1] !== null &&
      !Array.isArray(a[a.length - 1])
    ) {
      a.pop();
    }
    if (a[1] === undefined) {
      throw new IrreversibleMigration("drop_virtual_table is only reversible if given options.");
    }
    return ["createVirtualTable", args];
  }

  /** @internal */
  findJoinTableName(table1: string, table2: string, options?: { tableName?: string }): string {
    return _findJoinTableName(table1, table2, options);
  }

  /** @internal */
  joinTableName(table1: string, table2: string): string {
    return _joinTableName(table1, table2);
  }

  // ---------------------------------------------------------------------------
  // private dispatch
  // ---------------------------------------------------------------------------

  private _dispatchInvert(cmd: string, args: unknown[]): [string, unknown[]] {
    const methodName = `invert${cmd.charAt(0).toUpperCase()}${cmd.slice(1)}` as keyof this;
    const method = this[methodName];
    if (typeof method === "function") {
      return (method as (args: unknown[]) => [string, unknown[]]).call(this, args);
    }
    throw new IrreversibleMigration(`${cmd} is not reversible`);
  }
}

/**
 * Table proxy used inside CommandRecorder#changeTable blocks. Routes each
 * Table-style method call to recorder.record() so the parent recorder (or
 * revert block) can capture and optionally invert the individual operations.
 *
 * Mirrors: the Table object yielded by CommandRecorder#change_table in Rails
 * (non-bulk path: `yield delegate.update_table_definition(table_name, self)`).
 */
export class RecorderTableProxy {
  constructor(
    private _tableName: string,
    private _recorder: CommandRecorder,
  ) {}

  private _col(name: string, type: string, options: Record<string, unknown>): void {
    this._recorder.record("addColumn", [this._tableName, name, type, options]);
  }

  string(name: string, options: Record<string, unknown> = {}): void {
    this._col(name, "string", options);
  }
  text(name: string, options: Record<string, unknown> = {}): void {
    this._col(name, "text", options);
  }
  integer(name: string, options: Record<string, unknown> = {}): void {
    this._col(name, "integer", options);
  }
  float(name: string, options: Record<string, unknown> = {}): void {
    this._col(name, "float", options);
  }
  decimal(name: string, options: Record<string, unknown> = {}): void {
    this._col(name, "decimal", options);
  }
  boolean(name: string, options: Record<string, unknown> = {}): void {
    this._col(name, "boolean", options);
  }
  date(name: string, options: Record<string, unknown> = {}): void {
    this._col(name, "date", options);
  }
  datetime(name: string, options: Record<string, unknown> = {}): void {
    this._col(name, "datetime", options);
  }
  bigint(name: string, options: Record<string, unknown> = {}): void {
    this._col(name, "bigint", options);
  }

  rename(oldName: string, newName: string): void {
    this._recorder.record("renameColumn", [this._tableName, oldName, newName]);
  }

  remove(name: string, options: Record<string, unknown> = {}): void {
    const args: unknown[] = [this._tableName, name];
    if (options["type"]) {
      args.push(options["type"]);
      const rest = Object.fromEntries(Object.entries(options).filter(([k]) => k !== "type"));
      if (Object.keys(rest).length > 0) args.push(rest);
    }
    this._recorder.record("removeColumn", args);
  }

  change(name: string, type: string, options: Record<string, unknown> = {}): void {
    this._recorder.record("changeColumn", [this._tableName, name, type, options]);
  }

  changeDefault(name: string, value: unknown): void {
    this._recorder.record("changeColumnDefault", [this._tableName, name, value]);
  }

  changeNull(name: string, nullable: boolean, defaultValue?: unknown): void {
    const args: unknown[] = [this._tableName, name, nullable];
    if (defaultValue !== undefined) args.push(defaultValue);
    this._recorder.record("changeColumnNull", args);
  }

  index(columns: string | string[], options: Record<string, unknown> = {}): void {
    this._recorder.record("addIndex", [this._tableName, columns, options]);
  }

  removeIndex(options: Record<string, unknown> = {}): void {
    this._recorder.record("removeIndex", [this._tableName, options]);
  }

  timestamps(options: Record<string, unknown> = {}): void {
    this._recorder.record("addTimestamps", [this._tableName, options]);
  }

  removeTimestamps(options: Record<string, unknown> = {}): void {
    this._recorder.record("removeTimestamps", [this._tableName, options]);
  }
}
