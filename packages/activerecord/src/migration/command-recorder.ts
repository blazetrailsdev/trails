import { extractOptionsBang, isPlainObject, methodMissingProxy } from "@blazetrails/activesupport";

import { IrreversibleMigration } from "../migration.js";
import type { Table } from "../connection-adapters/abstract/schema-definitions.js";
import {
  findJoinTableName as _findJoinTableName,
  joinTableName as _joinTableName,
} from "./join-table.js";

export type MigrationBlock = (...args: any[]) => unknown;

export type MigrationCommand = [string, unknown[], MigrationBlock?];

export class CommandRecorder {
  private _commands: MigrationCommand[] = [];
  private _delegate: unknown;
  private _reverting = false;

  constructor(delegate?: unknown) {
    this._delegate = delegate ?? null;
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

  get commands(): MigrationCommand[] {
    return this._commands;
  }

  set commands(value: MigrationCommand[]) {
    this._commands = value;
  }

  async record(cmd: string, args: unknown[], block?: MigrationBlock): Promise<void> {
    if (this._reverting) {
      this._commands.push(await this.inverseOf(cmd, args, block));
    } else {
      this._commands.push([cmd, args, block]);
    }
  }

  async addBelongsTo(...args: unknown[]): Promise<void> {
    await this.record("addReference", args);
  }

  async removeBelongsTo(...args: unknown[]): Promise<void> {
    await this.record("removeReference", args);
  }

  async revert(fn: () => Promise<void>): Promise<void> {
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

  async inverseOf(cmd: string, args: unknown[], block?: MigrationBlock): Promise<MigrationCommand> {
    const method = `invert${cmd.charAt(0).toUpperCase()}${cmd.slice(1)}` as keyof this;
    if (!(method in this)) {
      throw new IrreversibleMigration(
        `This migration uses ${cmd}, which is not automatically reversible.\n` +
          `To make the migration reversible you can either:\n` +
          `1. Define #up and #down methods in place of the #change method.\n` +
          `2. Use the #reversible method to define reversible behavior.\n`,
      );
    }
    return (
      this[method] as (
        args: unknown[],
        block?: MigrationBlock,
      ) => MigrationCommand | Promise<MigrationCommand>
    ).call(this, args, block);
  }

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

  async replay(migration: { [key: string]: (...args: any[]) => Promise<void> }): Promise<void> {
    for (const [cmd, args, block] of this.commands) {
      const rest = [...args, ...(block === undefined ? [] : [block])];
      if (typeof migration[cmd] === "function") {
        await migration[cmd](...rest);
      } else {
        await (
          migration as unknown as { methodMissing(name: string, ...args: unknown[]): Promise<void> }
        ).methodMissing(cmd, ...rest);
      }
    }
  }

  /**
   * @internal
   * @missingRailsCall delete — PERMANENT
   */
  invertCreateTable(args: unknown[], block?: MigrationBlock): MigrationCommand {
    const last = args[args.length - 1];
    if (isPlainObject(last)) {
      delete (last as Record<string, unknown>)["ifNotExists"];
    }
    return ["dropTable", args, block];
  }

  /** @internal */
  invertDropTable(args: unknown[], block?: MigrationBlock): MigrationCommand {
    const [rest, options] = extractOptionsBang(args);
    args = rest;
    delete options["ifExists"];

    if (args.length > 1) {
      throw new IrreversibleMigration(
        "To avoid mistakes, drop_table is only reversible if given a single table name.",
      );
    }

    if (args.length === 1 && Object.keys(options).length === 0 && block == null) {
      throw new IrreversibleMigration(
        "To avoid mistakes, drop_table is only reversible if given options or a block (can be empty).",
      );
    }

    if (Object.keys(options).length > 0) args = [...args, options];

    return ["createTable", args, block];
  }

  /**
   * @internal Straight reversion — `execute_block: :execute_block` (command_recorder.rb:158).
   * @noRailsEquivalent CONVERGEABLE the `execute_block: :execute_block` entry of CommandRecorder's inverse table (command_recorder.rb:158) as a method.
   */
  invertExecuteBlock(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["executeBlock", args, block];
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE CommandRecorder#invert_create_join_table (command_recorder.rb:176).
   */
  invertCreateJoinTable(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["dropJoinTable", args, block];
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE the `drop_join_table: :create_join_table` inverse entry (command_recorder.rb:160) as a method.
   */
  invertDropJoinTable(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["createJoinTable", args, block];
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE the `add_column: :remove_column` inverse entry (command_recorder.rb:161) as a method.
   */
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

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE the `add_index: :remove_index` inverse entry (command_recorder.rb:162) as a method.
   */
  invertAddIndex(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["removeIndex", args, block];
  }

  /** @internal */
  invertRemoveIndex(args: unknown[]): [string, unknown[]] {
    const a = args.slice();
    let options: Record<string, unknown> = {};
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

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE the `add_timestamps: :remove_timestamps` inverse entry (command_recorder.rb:163) as a method.
   */
  invertAddTimestamps(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["removeTimestamps", args, block];
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE the `remove_timestamps: :add_timestamps` inverse entry (command_recorder.rb:163) as a method.
   */
  invertRemoveTimestamps(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["addTimestamps", args, block];
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE the `add_reference: :remove_reference` inverse entry (command_recorder.rb:164) as a method.
   */
  invertAddReference(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["removeReference", args, block];
  }

  /** @internal */
  invertAddBelongsTo(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return this.invertAddReference(args, block);
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE CommandRecorder#invert_remove_reference (command_recorder.rb:176).
   */
  invertRemoveReference(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["addReference", args, block];
  }

  /** @internal */
  invertRemoveBelongsTo(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return this.invertRemoveReference(args, block);
  }

  /**
   * @internal
   * @missingRailsCall delete — PERMANENT
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

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE the `add_exclusion_constraint: :remove_exclusion_constraint` inverse entry (command_recorder.rb:167) as a method.
   */
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

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE CommandRecorder#invert_change_column, which Ruby defines only to raise IrreversibleMigration (command_recorder.rb:53).
   */
  invertChangeColumn(_args: unknown[]): [string, unknown[]] {
    throw new IrreversibleMigration(
      "change_column is not reversible. Use change_column_default or change_column_null instead.",
    );
  }

  /** @internal */
  async invertTransaction(args: unknown[], block?: MigrationBlock): Promise<MigrationCommand> {
    const subRecorder = new CommandRecorder(this._delegate);
    await subRecorder.revert(block as () => Promise<void>);

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

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE the `[:add_columns, args]` return of CommandRecorder#invert_remove_columns (command_recorder.rb:233), which Ruby reaches by inversion rather than a named method.
   */
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

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE the `create_enum: :drop_enum` inverse entry (command_recorder.rb:170) as a method.
   */
  invertCreateEnum(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["dropEnum", args, block];
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE the `enable_extension: :disable_extension` inverse entry (command_recorder.rb:169) as a method.
   */
  invertEnableExtension(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["disableExtension", args, block];
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE the `disable_extension: :enable_extension` inverse entry (command_recorder.rb:169) as a method.
   */
  invertDisableExtension(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["enableExtension", args, block];
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE the `create_schema: :drop_schema` inverse entry (command_recorder.rb:171) as a method.
   */
  invertCreateSchema(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["dropSchema", args, block];
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE the `drop_schema: :create_schema` inverse entry (command_recorder.rb:171) as a method.
   */
  invertDropSchema(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["createSchema", args, block];
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE the `create_virtual_table: :drop_virtual_table` inverse entry (command_recorder.rb:172) as a method.
   */
  invertCreateVirtualTable(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["dropVirtualTable", args, block];
  }

  /** @internal */
  invertDropEnum(args: unknown[], block?: MigrationBlock): MigrationCommand {
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
  ): Promise<void> {
    const block =
      typeof args[args.length - 1] === "function" ? (args.pop() as MigrationBlock) : undefined;
    return this.record(method, args, block);
  };
}
