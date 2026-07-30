/**
 * Command recorder — records migration commands for reversal.
 *
 * Mirrors: ActiveRecord::Migration::CommandRecorder
 */

import { IrreversibleMigration } from "../migration.js";
import type { Table } from "../connection-adapters/abstract/schema-definitions.js";
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

  /**
   * Record a command. When the recorder is in reverting mode the command is
   * inverted at record time (mirrors Rails' `record`, which stores
   * `inverse_of(...)` when `@reverting`), so nested `revert` blocks cancel out
   * by double-negation.
   */
  record(cmd: string, args: unknown[]): void {
    if (this._reverting) {
      const [iCmd, iArgs] = this._dispatchInvert(cmd, args);
      this._commands.push({ cmd: iCmd, args: iArgs });
    } else {
      this._commands.push({ cmd, args });
    }
  }

  /**
   * Alias of addReference (Rails: `alias :add_belongs_to :add_reference`).
   * Records the `addReference` command — the alias shares the underlying
   * generated recordable method, so it records `:add_reference` verbatim.
   */
  addBelongsTo(...args: unknown[]): void {
    this.record("addReference", args);
  }

  /** Alias of removeReference (Rails: `alias :remove_belongs_to :remove_reference`). */
  removeBelongsTo(...args: unknown[]): void {
    this.record("removeReference", args);
  }

  /**
   * Execute a block in reverting mode. Commands recorded inside the block
   * are collected, reversed, and their inverses are appended to the
   * command list.
   *
   * Mirrors: ActiveRecord::Migration::CommandRecorder#revert
   */
  async revert(fn: () => Promise<void>): Promise<void> {
    // Mirrors Rails: toggle reverting, capture the block's commands (already
    // inverted at record time), then splice them back in reverse order.
    this._reverting = !this._reverting;
    const previous = this._commands;
    this._commands = [];
    try {
      await fn();
    } finally {
      const captured = this._commands.reverse();
      this._commands = previous.concat(captured);
      this._reverting = !this._reverting;
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
    fnOrOptions: ((t: Table) => Promise<void> | void) | Record<string, unknown>,
    fn?: (t: Table) => Promise<void> | void,
  ): Promise<void> {
    const options: Record<string, unknown> = typeof fnOrOptions === "function" ? {} : fnOrOptions;
    const callback = typeof fnOrOptions === "function" ? fnOrOptions : fn;
    if (!callback) {
      throw new TypeError(
        "changeTable requires a callback. Rails change_table always takes a block.",
      );
    }
    const delegate = this._delegate as {
      supportsBulkAlter?(): boolean;
      updateTableDefinition(tableName: string, base: unknown): Table;
    };
    const supportsBulk =
      typeof delegate?.supportsBulkAlter === "function" && delegate.supportsBulkAlter() === true;

    if (options["bulk"] && supportsBulk) {
      // Mirrors Rails: the sub-recorder inherits `reverting`, so the block's
      // operations are inverted as they are recorded, and the parent entry is
      // pushed onto @commands directly rather than through record() — pushing
      // it raw is what keeps an enclosing revert() from inverting the already
      // inverted sub-list a second time.
      const sub = new CommandRecorder(this._delegate);
      sub.reverting = this._reverting;
      await callback(delegate.updateTableDefinition(tableName, sub));
      // Deviation: Rails stores `[:change_table, [table_name], -> t {
      // bulk_change_table(table_name, commands) }]` — a callable third element.
      // Trails' command shape is `{ cmd, args }` with no block slot, so the
      // captured sub-commands are stored as the second arg instead and
      // replay() expands them. Converging on the callable form is a change to
      // the command tuple and replay() across every recorded command, which is
      // out of scope here.
      this._commands.push({ cmd: "changeTable", args: [tableName, sub.commands] });
    } else {
      // Non-bulk: route operations directly through this recorder so the
      // enclosing revert() block can invert them individually.
      await callback(delegate.updateTableDefinition(tableName, this));
    }
  }

  /**
   * Replay all recorded commands against the given migration.
   *
   * Mirrors: ActiveRecord::Migration::CommandRecorder#replay
   */
  async replay(migration: { [key: string]: (...args: any[]) => Promise<void> }): Promise<void> {
    for (const { cmd, args } of this._commands) {
      // Bulk changeTable stores [tableName, subCommands[]]. Replay each
      // sub-command individually rather than forwarding the array as an arg.
      if (cmd === "changeTable" && Array.isArray(args[1])) {
        const subCmds = args[1] as Array<{ cmd: string; args: unknown[] }>;
        for (const { cmd: sub, args: subArgs } of subCmds) {
          if (typeof migration[sub] === "function") {
            await migration[sub](...subArgs);
          }
        }
      } else if (typeof migration[cmd] === "function") {
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
    // The reversal block (table definition) rides as a trailing function, the
    // same convention create_table uses (see the `revert order` test).
    let block: unknown;
    if (a.length > 0 && typeof a[a.length - 1] === "function") {
      block = a.pop();
    }
    let options: Record<string, unknown> = {};
    if (
      a.length > 0 &&
      typeof a[a.length - 1] === "object" &&
      a[a.length - 1] !== null &&
      !Array.isArray(a[a.length - 1])
    ) {
      options = { ...(a.pop() as Record<string, unknown>) };
    }
    delete options["ifExists"];

    if (a.length > 1) {
      throw new IrreversibleMigration(
        "To avoid mistakes, drop_table is only reversible if given a single table name.",
      );
    }
    if (a.length === 1 && Object.keys(options).length === 0 && block === undefined) {
      throw new IrreversibleMigration(
        "To avoid mistakes, drop_table is only reversible if given options or a block (can be empty).",
      );
    }

    const result = [...a];
    if (Object.keys(options).length > 0) result.push(options);
    if (block !== undefined) result.push(block);
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
    if (typeof args[2] !== "string") {
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
    let columns = a[1];
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

  /** Alias of invertAddReference (Rails: `alias :invert_add_belongs_to :invert_add_reference`). @internal */
  invertAddBelongsTo(args: unknown[]): [string, unknown[]] {
    return this.invertAddReference(args);
  }

  /** @internal */
  invertRemoveReference(args: unknown[]): [string, unknown[]] {
    return ["addReference", args];
  }

  /** Alias of invertRemoveReference (Rails: `alias :invert_remove_belongs_to :invert_remove_reference`). @internal */
  invertRemoveBelongsTo(args: unknown[]): [string, unknown[]] {
    return this.invertRemoveReference(args);
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
    let toTable = a[1];
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
  invertAddColumns(args: unknown[]): [string, unknown[]] {
    return ["removeColumns", args];
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
    const a = args.slice();
    a[2] = !(a[2] as boolean);
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

/** Mirrors: ActiveRecord::Migration::CommandRecorder::ReversibleAndIrreversibleMethods */
const REVERSIBLE_AND_IRREVERSIBLE_METHODS = [
  "createTable",
  "createJoinTable",
  "renameTable",
  "addColumn",
  "removeColumn",
  "renameIndex",
  "renameColumn",
  "addIndex",
  "removeIndex",
  "addTimestamps",
  "removeTimestamps",
  "changeColumnDefault",
  "addReference",
  "removeReference",
  "transaction",
  "dropJoinTable",
  "dropTable",
  "executeBlock",
  "enableExtension",
  "disableExtension",
  "changeColumn",
  "execute",
  "removeColumns",
  "changeColumnNull",
  "addForeignKey",
  "removeForeignKey",
  "changeColumnComment",
  "changeTableComment",
  "addCheckConstraint",
  "removeCheckConstraint",
  "addExclusionConstraint",
  "removeExclusionConstraint",
  "addUniqueConstraint",
  "removeUniqueConstraint",
  "createEnum",
  "dropEnum",
  "renameEnum",
  "addEnumValue",
  "renameEnumValue",
  "createSchema",
  "dropSchema",
  "createVirtualTable",
  "dropVirtualTable",
] as const;

for (const method of REVERSIBLE_AND_IRREVERSIBLE_METHODS) {
  if (method in CommandRecorder.prototype) continue;
  (CommandRecorder.prototype as unknown as Record<string, unknown>)[method] = function (
    this: CommandRecorder,
    ...args: unknown[]
  ): void {
    this.record(method, args);
  };
}
