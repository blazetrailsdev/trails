/**
 * Command recorder — records migration commands for reversal.
 *
 * Mirrors: ActiveRecord::Migration::CommandRecorder
 */

import { methodMissingProxy } from "@blazetrails/activesupport";

import { IrreversibleMigration } from "../migration.js";
import type { Table } from "../connection-adapters/abstract/schema-definitions.js";
import {
  findJoinTableName as _findJoinTableName,
  joinTableName as _joinTableName,
} from "./join-table.js";

/**
 * A recorded migration block — the third element of a command tuple, Rails'
 * `&block` (migration/command_recorder.rb:109).
 */
export type MigrationBlock = (...args: any[]) => unknown;

/** A recorded command: `[cmd, args, block]` (migration/command_recorder.rb:109). */
export type MigrationCommand = [string, unknown[], MigrationBlock?];

export class CommandRecorder {
  private _commands: MigrationCommand[] = [];
  private _delegate: unknown;
  private _reverting = false;

  constructor(delegate?: unknown) {
    this._delegate = delegate ?? null;
    // Stands in for Rails' `method_missing` / `respond_to_missing?`
    // (command_recorder.rb:395-406), which forward any method the recorder does
    // not define to the delegate. JS has no method_missing, so the forwarding
    // lives in a Proxy returned from the constructor — class-wide, as in Rails.
    return methodMissingProxy(this, { delegate: (target) => target._delegate });
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

  /** Mirrors `attr_accessor :commands` (command_recorder.rb:65) — the live
   *  array, which `change_table`'s bulk path and `revert` mutate in place. */
  get commands(): MigrationCommand[] {
    return this._commands;
  }

  set commands(value: MigrationCommand[]) {
    this._commands = value;
  }

  /**
   * Record a command. When the recorder is in reverting mode the command is
   * inverted at record time (mirrors Rails' `record`, which stores
   * `inverse_of(...)` when `@reverting`), so nested `revert` blocks cancel out
   * by double-negation.
   */
  record(cmd: string, args: unknown[], block?: MigrationBlock): void {
    if (this._reverting) {
      this._commands.push(this.inverseOf(cmd, args, block));
    } else {
      this._commands.push([cmd, args, block]);
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
   * (command_recorder.rb:114-123). The `method in this` test is Ruby's
   * `respond_to?(method, true)` (command_recorder.rb:116), routed through the
   * `methodMissingProxy` `has` trap; membership is tested before the read,
   * because a name the recorder does not answer reads back as the proxy's
   * `NoMethodError`-raising function rather than `undefined`.
   */
  inverseOf(cmd: string, args: unknown[], block?: MigrationBlock): MigrationCommand {
    const method = `invert${cmd.charAt(0).toUpperCase()}${cmd.slice(1)}` as keyof this;
    if (!(method in this)) {
      throw new IrreversibleMigration(
        `This migration uses ${cmd}, which is not automatically reversible.\n` +
          `To make the migration reversible you can either:\n` +
          `1. Define #up and #down methods in place of the #change method.\n` +
          `2. Use the #reversible method to define reversible behavior.\n`,
      );
    }
    return (this[method] as (args: unknown[], block?: MigrationBlock) => MigrationCommand).call(
      this,
      args,
      block,
    );
  }

  /**
   * Record a change_table block. When a callback is given, operations inside
   * the block are individually recorded so they can be inverted.  With
   * `bulk: true` the operations are captured into a sub-recorder and stored as
   * a single batched command (mirrors the Rails bulk alter path).
   *
   * Mirrors: ActiveRecord::Migration::CommandRecorder#change_table
   * (command_recorder.rb:141-152). The bulk path's recorded lambda reaches
   * `bulkChangeTable` through the `methodMissingProxy`, as the Ruby lambda's
   * `self` reaches it through `method_missing` (command_recorder.rb:142).
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
      const recorder = new CommandRecorder(this._delegate);
      recorder.reverting = this._reverting;
      await callback(delegate.updateTableDefinition(tableName, recorder));
      const commands = recorder.commands;
      this._commands.push([
        "changeTable",
        [tableName],
        () =>
          (
            this as unknown as {
              bulkChangeTable(tableName: string, operations: MigrationCommand[]): Promise<void>;
            }
          ).bulkChangeTable(tableName, commands),
      ]);
    } else {
      await callback(delegate.updateTableDefinition(tableName, this));
    }
  }

  /**
   * Replay all recorded commands against the given migration.
   *
   * Mirrors: ActiveRecord::Migration::CommandRecorder#replay
   * (command_recorder.rb:148-152). TS has no block syntax: Ruby's `&block`
   * passes nothing when the block is nil, so an absent block must not become a
   * trailing `undefined` argument to a splat-taking method like
   * `drop_table(*table_names)`.
   */
  async replay(migration: { [key: string]: (...args: any[]) => Promise<void> }): Promise<void> {
    for (const [cmd, args, block] of this.commands) {
      const rest = [...args, ...(block === undefined ? [] : [block])];
      // `migration.send(cmd, ...)` (command_recorder.rb:150) lands in
      // `Migration#method_missing` (migration.rb:1045) for a command the
      // migration does not define itself — `transaction`, say. TS has no
      // implicit dispatch, so the fallback is spelled out.
      if (typeof migration[cmd] === "function") {
        await migration[cmd](...rest);
      } else {
        await (
          migration as unknown as { methodMissing(name: string, ...args: unknown[]): Promise<void> }
        ).methodMissing(cmd, ...rest);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // invert* methods — mirrors Rails private StraightReversions + overrides
  // ---------------------------------------------------------------------------

  /**
   * @internal
   *
   * @missingRailsCall delete — PERMANENT: Ruby `Hash#delete(:if_not_exists)`
   *   (migration/command_recorder.rb:199); JS spells the same operation as the
   *   `delete` OPERATOR (command-recorder.ts:192), which records no callee.
   */
  invertCreateTable(args: unknown[], block?: MigrationBlock): MigrationCommand {
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
    return ["dropTable", a, block];
  }

  /**
   * @internal
   *
   * TS has no block syntax, so a recordable method's trailing callback rides
   * inside `args` where Ruby carries it in the block seat (the `revert order`
   * test's `create_table("bananas", &block)`); either position is Rails'
   * `block` for the reversibility check (command_recorder.rb:214).
   */
  invertDropTable(args: unknown[], block?: MigrationBlock): MigrationCommand {
    const a = args.slice();
    let argsBlock: unknown;
    if (a.length > 0 && typeof a[a.length - 1] === "function") {
      argsBlock = a.pop();
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
    if (
      a.length === 1 &&
      Object.keys(options).length === 0 &&
      block === undefined &&
      argsBlock === undefined
    ) {
      throw new IrreversibleMigration(
        "To avoid mistakes, drop_table is only reversible if given options or a block (can be empty).",
      );
    }

    const result = [...a];
    if (Object.keys(options).length > 0) result.push(options);
    if (argsBlock !== undefined) result.push(argsBlock);
    return ["createTable", result, block];
  }

  /** @internal Straight reversion — `execute_block: :execute_block` (command_recorder.rb:158). */
  invertExecuteBlock(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["executeBlock", args, block];
  }

  /** @internal */
  invertCreateJoinTable(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["dropJoinTable", args, block];
  }

  /** @internal */
  invertDropJoinTable(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["createJoinTable", args, block];
  }

  /** @internal */
  invertAddColumn(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["removeColumn", args, block];
  }

  /** @internal */
  invertRemoveColumn(args: unknown[], block?: MigrationBlock): MigrationCommand {
    if (typeof args[2] !== "string") {
      throw new IrreversibleMigration("remove_column is only reversible if given a type.");
    }
    return ["addColumn", args, block];
  }

  /** @internal */
  invertAddIndex(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["removeIndex", args, block];
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
  invertAddTimestamps(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["removeTimestamps", args, block];
  }

  /** @internal */
  invertRemoveTimestamps(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["addTimestamps", args, block];
  }

  /** @internal */
  invertAddReference(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["removeReference", args, block];
  }

  /** Alias of invertAddReference (Rails: `alias :invert_add_belongs_to :invert_add_reference`). @internal */
  invertAddBelongsTo(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return this.invertAddReference(args, block);
  }

  /** @internal */
  invertRemoveReference(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["addReference", args, block];
  }

  /** Alias of invertRemoveReference (Rails: `alias :invert_remove_belongs_to :invert_remove_reference`). @internal */
  invertRemoveBelongsTo(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return this.invertRemoveReference(args, block);
  }

  /**
   * @internal
   *
   * @missingRailsCall delete — PERMANENT: Ruby `Hash#delete(:validate)`
   *   (migration/command_recorder.rb:288); JS spells the same operation as the
   *   `delete` OPERATOR (command-recorder.ts:326), which records no callee.
   */
  invertAddForeignKey(args: unknown[], block?: MigrationBlock): MigrationCommand {
    const a = args.slice();
    if (a.length > 0 && typeof a[a.length - 1] === "object" && a[a.length - 1] !== null) {
      const opts = { ...(a[a.length - 1] as Record<string, unknown>) };
      delete opts["validate"];
      a[a.length - 1] = opts;
    }
    return ["removeForeignKey", a, block];
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
  invertAddCheckConstraint(args: unknown[], block?: MigrationBlock): MigrationCommand {
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
    return ["removeCheckConstraint", a, block];
  }

  /** @internal */
  invertRemoveCheckConstraint(args: unknown[], block?: MigrationBlock): MigrationCommand {
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
    return ["addCheckConstraint", a, block];
  }

  /** @internal */
  invertAddExclusionConstraint(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["removeExclusionConstraint", args, block];
  }

  /** @internal */
  invertRemoveExclusionConstraint(args: unknown[], block?: MigrationBlock): MigrationCommand {
    if (args.length < 2) {
      throw new IrreversibleMigration(
        "remove_exclusion_constraint is only reversible if given an expression.",
      );
    }
    return ["addExclusionConstraint", args, block];
  }

  /** @internal */
  invertAddUniqueConstraint(args: unknown[], block?: MigrationBlock): MigrationCommand {
    const options =
      args.length > 0 && typeof args[args.length - 1] === "object" && args[args.length - 1] !== null
        ? (args[args.length - 1] as Record<string, unknown>)
        : {};
    if (options["usingIndex"]) {
      throw new IrreversibleMigration(
        "add_unique_constraint is not reversible if given an using_index.",
      );
    }
    return ["removeUniqueConstraint", args, block];
  }

  /** @internal */
  invertRemoveUniqueConstraint(args: unknown[], block?: MigrationBlock): MigrationCommand {
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
    return ["addUniqueConstraint", args, block];
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
  invertTransaction(args: unknown[], _block?: MigrationBlock): MigrationCommand {
    // Rails runs the block here, via `sub_recorder.revert(&block)`
    // (command_recorder.rb:187), and the run has to COMPLETE before the
    // `transaction` tuple is appended: the block's statements record their
    // inverses onto THIS recorder — the sub-recorder only toggles its own
    // direction and stays empty — so they must land first. A TS block returns
    // a promise and this method is sync, so the await lives in the one place
    // that has an await point: the `transaction` forwarder below, which runs
    // the block to completion and only then appends what this method builds.
    // That forwarder is the sole producer of a `transaction` command, in Ruby
    // (command_recorder.rb:125-132) as here, so no reachable path leaves the
    // block unrun.
    const subRecorder = new CommandRecorder(this._delegate);
    const invertionsProc = async (): Promise<void> => {
      await subRecorder.replay(
        this as unknown as { [key: string]: (...args: unknown[]) => Promise<void> },
      );
    };
    return ["transaction", args, invertionsProc as unknown as MigrationBlock];
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
  invertCreateEnum(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["dropEnum", args, block];
  }

  /** @internal */
  invertEnableExtension(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["disableExtension", args, block];
  }

  /** @internal */
  invertDisableExtension(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["enableExtension", args, block];
  }

  /** @internal */
  invertCreateSchema(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["dropSchema", args, block];
  }

  /** @internal */
  invertDropSchema(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["createSchema", args, block];
  }

  /** @internal */
  invertCreateVirtualTable(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["dropVirtualTable", args, block];
  }

  /** @internal */
  invertDropEnum(args: unknown[], block?: MigrationBlock): MigrationCommand {
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
    return ["createEnum", args, block];
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
  invertDropVirtualTable(args: unknown[], block?: MigrationBlock): MigrationCommand {
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
    return ["createVirtualTable", args, block];
  }

  /** @internal */
  findJoinTableName(table1: string, table2: string, options?: { tableName?: string }): string {
    return _findJoinTableName(table1, table2, options);
  }

  /** @internal */
  joinTableName(table1: string, table2: string): string {
    return _joinTableName(table1, table2);
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

/**
 * `transaction` is generated like every other recordable command
 * (command_recorder.rb:125-132), but it also carries the first half of
 * `invert_transaction` (:186-188): Ruby's `inverse_of` runs the block inline
 * because a Ruby block is synchronous, while a TS block returns a promise. So
 * the block runs — recording its commands, already inverted, onto this
 * recorder — before `record` appends the `transaction` command itself.
 */
(CommandRecorder.prototype as unknown as Record<string, unknown>)["transaction"] = async function (
  this: CommandRecorder,
  ...args: unknown[]
): Promise<void> {
  const block =
    typeof args[args.length - 1] === "function" ? (args.pop() as MigrationBlock) : undefined;
  if (this.reverting && block !== undefined) {
    // `record`'s reverting arm is `inverse_of` (command_recorder.rb:94-100),
    // and `invert_transaction` runs the block before returning its tuple
    // (:186-190). Both halves are spelled out here because only this method has
    // an await point: the block runs to completion — its inverses landing on
    // this recorder first, and a throw propagating to the caller — and the
    // inverted `transaction` command — which `record`'s reverting arm builds
    // through `invertTransaction` — is appended after them, Ruby's order.
    await (block as () => Promise<void>)();
    this.record("transaction", args);
    return;
  }
  this.record("transaction", args, block);
};

for (const method of REVERSIBLE_AND_IRREVERSIBLE_METHODS) {
  if (method in CommandRecorder.prototype) continue;
  (CommandRecorder.prototype as unknown as Record<string, unknown>)[method] = function (
    this: CommandRecorder,
    ...args: unknown[]
  ): void {
    // Ruby's `*args` carries only the arguments actually passed
    // (command_recorder.rb:125-132); a TS method with optional parameters
    // materializes trailing `undefined`s, which would otherwise be recorded and
    // replayed as real arguments.
    while (args.length > 0 && args[args.length - 1] === undefined) args.pop();
    this.record(method, args);
  };
}
