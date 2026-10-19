import {
  compact,
  hashDelete,
  include,
  isEmpty,
  last,
  rbFSend,
  rbObjDup,
  rtest,
  uniq,
} from "@blazetrails/ruby-compat";
import {
  extractOptionsBang,
  isBlank,
  isPlainObject,
  methodMissingProxy,
} from "@blazetrails/activesupport";

import { ActiveRecord } from "../namespaces.js";
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

  async record(cmd: string, args: unknown[], block?: MigrationBlock): Promise<MigrationCommand[]> {
    if (this._reverting) {
      this._commands.push(await this.inverseOf(cmd, args, block));
    } else {
      this._commands.push([cmd, args, block]);
    }
    return this._commands;
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

  async inverseOf(
    command: string,
    args: unknown[],
    block?: MigrationBlock,
  ): Promise<MigrationCommand> {
    const method = `invert${command.charAt(0).toUpperCase()}${command.slice(1)}` as keyof this;
    if (!(method in this)) {
      throw new ActiveRecord.IrreversibleMigration(
        `This migration uses ${command}, which is not automatically reversible.\n` +
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
    options: Record<string, unknown> = {},
    block?: (t: Table) => Promise<void> | void,
  ): Promise<void> {
    const delegate = this.delegate as {
      supportsBulkAlter(): boolean;
      updateTableDefinition(tableName: string, base: unknown): Table;
    };
    if (delegate.supportsBulkAlter() && options["bulk"]) {
      const recorder = new CommandRecorder(this.delegate);
      recorder.reverting = this._reverting;
      await block!(delegate.updateTableDefinition(tableName, recorder));
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
      await block!(delegate.updateTableDefinition(tableName, this));
    }
  }

  async replay(migration: unknown): Promise<void> {
    for (const [cmd, args, block] of this.commands) {
      await rbFSend(migration, cmd, ...args, ...compact([block]));
    }
  }

  private static StraightReversions: Record<
    string,
    (args: unknown[], block?: MigrationBlock) => MigrationCommand
  > = {};

  static {
    for (const [cmd, inv] of Object.entries({
      executeBlock: "executeBlock",
      createTable: "dropTable",
      createJoinTable: "dropJoinTable",
      addColumn: "removeColumn",
      addIndex: "removeIndex",
      addTimestamps: "removeTimestamps",
      addReference: "removeReference",
      addForeignKey: "removeForeignKey",
      addCheckConstraint: "removeCheckConstraint",
      addExclusionConstraint: "removeExclusionConstraint",
      addUniqueConstraint: "removeUniqueConstraint",
      enableExtension: "disableExtension",
      createEnum: "dropEnum",
      createSchema: "dropSchema",
      createVirtualTable: "dropVirtualTable",
    })) {
      for (const [method, inverse] of uniq([
        [inv, cmd],
        [cmd, inv],
      ])) {
        this.StraightReversions[`invert${method.charAt(0).toUpperCase()}${method.slice(1)}`] = (
          args: unknown[],
          block?: MigrationBlock,
        ): MigrationCommand => [inverse, args, block];
      }
    }
    include(this, this.StraightReversions);
  }

  /** @internal */
  invertCreateTable(args: unknown[], block?: MigrationBlock): MigrationCommand {
    if (isPlainObject(last(args))) {
      delete (last(args) as Record<string, unknown>).ifNotExists;
    }
    return ["dropTable", args, block];
  }

  /** @internal */
  invertDropTable(args: unknown[], block?: MigrationBlock): MigrationCommand {
    const options = extractOptionsBang(args);
    delete options["ifExists"];

    if (args.length > 1) {
      throw new ActiveRecord.IrreversibleMigration(
        "To avoid mistakes, drop_table is only reversible if given a single table name.",
      );
    }

    if (args.length === 1 && Object.keys(options).length === 0 && block == null) {
      throw new ActiveRecord.IrreversibleMigration(
        "To avoid mistakes, drop_table is only reversible if given options or a block (can be empty).",
      );
    }

    if (!isEmpty(options)) args.push(options);

    return ["createTable", args, block];
  }

  /** @internal */
  invertRemoveColumn(args: unknown[], block?: MigrationBlock): MigrationCommand {
    if (args.length <= 2) {
      throw new ActiveRecord.IrreversibleMigration(
        "remove_column is only reversible if given a type.",
      );
    }
    return ["addColumn", args, block];
  }

  /** @internal */
  invertRemoveIndex(args: unknown[]): [string, unknown[]] {
    const options = extractOptionsBang(args);
    const table = args[0];
    let columns = args[1];

    if (!rtest(columns)) columns = hashDelete(options, "column");

    if (!rtest(columns)) {
      throw new ActiveRecord.IrreversibleMigration(
        "remove_index is only reversible if given a :column option.",
      );
    }

    delete options.ifExists;

    args = [table, columns];
    if (!isEmpty(options)) args.push(options);

    return ["addIndex", args];
  }

  /** @internal */
  invertAddBelongsTo(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["removeReference", args, block];
  }

  /** @internal */
  invertRemoveBelongsTo(args: unknown[], block?: MigrationBlock): MigrationCommand {
    return ["addReference", args, block];
  }

  /** @internal */
  invertAddForeignKey(args: unknown[], block?: MigrationBlock): MigrationCommand {
    if (isPlainObject(last(args))) delete (last(args) as Record<string, unknown>).validate;
    return ["removeForeignKey", args, block];
  }

  /** @internal */
  invertRemoveForeignKey(args: unknown[]): [string, unknown[]] {
    const options = extractOptionsBang(args);
    const fromTable = args[0];
    let toTable = args[1];

    if (!rtest(toTable)) toTable = hashDelete(options, "toTable");

    if (toTable == null) {
      throw new ActiveRecord.IrreversibleMigration(
        "remove_foreign_key is only reversible if given a second table",
      );
    }

    const reversedArgs = [fromTable, toTable];
    if (!isEmpty(options)) reversedArgs.push(options);
    return ["addForeignKey", reversedArgs];
  }

  /** @internal */
  invertAddCheckConstraint(args: unknown[], block?: MigrationBlock): MigrationCommand {
    const options = last(args);
    if (isPlainObject(options)) {
      delete options.validate;
      if ("ifNotExists" in options) options["ifExists"] = hashDelete(options, "ifNotExists");
    }
    return ["removeCheckConstraint", args, block];
  }

  /** @internal */
  invertRemoveCheckConstraint(args: unknown[], block?: MigrationBlock): MigrationCommand {
    if (args.length < 2) {
      throw new ActiveRecord.IrreversibleMigration(
        "remove_check_constraint is only reversible if given an expression.",
      );
    }

    const options = last(args);
    if (isPlainObject(options)) {
      if ("ifExists" in options) options["ifNotExists"] = hashDelete(options, "ifExists");
    }
    return ["addCheckConstraint", args, block];
  }

  /** @internal */
  invertRemoveExclusionConstraint(args: unknown[], block?: MigrationBlock): MigrationCommand {
    if (args.length < 2) {
      throw new ActiveRecord.IrreversibleMigration(
        "remove_exclusion_constraint is only reversible if given an expression.",
      );
    }
    return ["addExclusionConstraint", args, block];
  }

  /** @internal */
  invertAddUniqueConstraint(args: unknown[], block?: MigrationBlock): MigrationCommand {
    const options = extractOptionsBang(rbObjDup(args));

    if (rtest(options["usingIndex"])) {
      throw new ActiveRecord.IrreversibleMigration(
        "add_unique_constraint is not reversible if given an using_index.",
      );
    }
    return ["removeUniqueConstraint", args, block];
  }

  /** @internal */
  invertRemoveUniqueConstraint(args: unknown[], block?: MigrationBlock): MigrationCommand {
    const dup = rbObjDup(args);
    extractOptionsBang(dup);
    const [_table, columns] = dup;
    if (isBlank(columns)) {
      throw new ActiveRecord.IrreversibleMigration(
        "remove_unique_constraint is only reversible if given an column_name.",
      );
    }
    return ["addUniqueConstraint", args, block];
  }

  /** @internal */
  invertRenameTable(args: unknown[]): [string, unknown[]] {
    const [oldName, newName, options] = args;
    args = [newName, oldName];
    if (rtest(options)) args.push(options);
    return ["renameTable", args];
  }

  /** @internal */
  invertRenameColumn(args: unknown[]): [string, unknown[]] {
    const [tableName, oldName, newName] = args;
    return ["renameColumn", [tableName, newName, oldName]];
  }

  /** @internal */
  async invertTransaction(args: unknown[], block?: MigrationBlock): Promise<MigrationCommand> {
    const subRecorder = new CommandRecorder(this.delegate);
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
    if (!(isPlainObject(last) && "type" in last)) {
      throw new ActiveRecord.IrreversibleMigration(
        "remove_columns is only reversible if given a type.",
      );
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
    const [table, column, options] = args as [unknown, unknown, Record<string, unknown> | null];
    if (
      !(typeof options === "object" && options !== null && "from" in options && "to" in options)
    ) {
      throw new ActiveRecord.IrreversibleMigration(
        "change_column_default is only reversible if given a :from and :to option.",
      );
    }
    return [
      "changeColumnDefault",
      [
        table,
        column,
        {
          from: options["to"],
          to: options["from"],
        },
      ],
    ];
  }

  /** @internal */
  invertChangeColumnNull(args: unknown[]): [string, unknown[]] {
    args[2] = !rtest(args[2]);
    return ["changeColumnNull", args];
  }

  /** @internal */
  invertChangeColumnComment(args: unknown[]): [string, unknown[]] {
    const [table, column, options] = args as [unknown, unknown, Record<string, unknown> | null];
    if (
      !(typeof options === "object" && options !== null && "from" in options && "to" in options)
    ) {
      throw new ActiveRecord.IrreversibleMigration(
        "change_column_comment is only reversible if given a :from and :to option.",
      );
    }
    return [
      "changeColumnComment",
      [
        table,
        column,
        {
          from: options["to"],
          to: options["from"],
        },
      ],
    ];
  }

  /** @internal */
  invertChangeTableComment(args: unknown[]): [string, unknown[]] {
    const [table, options] = args as [unknown, Record<string, unknown> | null];
    if (
      !(typeof options === "object" && options !== null && "from" in options && "to" in options)
    ) {
      throw new ActiveRecord.IrreversibleMigration(
        "change_table_comment is only reversible if given a :from and :to option.",
      );
    }
    return [
      "changeTableComment",
      [
        table,
        {
          from: options["to"],
          to: options["from"],
        },
      ],
    ];
  }

  /** @internal */
  invertDropEnum(args: unknown[], block?: MigrationBlock): MigrationCommand {
    const dup = rbObjDup(args);
    extractOptionsBang(dup);
    const [_enum, values] = dup;
    if (!rtest(values)) {
      throw new ActiveRecord.IrreversibleMigration(
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
    if (!(isPlainObject(options) && "from" in options && "to" in options)) {
      throw new ActiveRecord.IrreversibleMigration(
        "rename_enum_value is only reversible if given a :from and :to option.",
      );
    }

    [options["to"], options["from"]] = [options["from"], options["to"]];
    return ["renameEnumValue", [typeName, options]];
  }

  /** @internal */
  invertDropVirtualTable(args: unknown[], block?: MigrationBlock): MigrationCommand {
    const dup = rbObjDup(args);
    extractOptionsBang(dup);
    const [_enum, values] = dup;
    if (!rtest(values)) {
      throw new ActiveRecord.IrreversibleMigration(
        "drop_virtual_table is only reversible if given options.",
      );
    }
    return ["createVirtualTable", args, block];
  }

  /** @internal */
  findJoinTableName(table1: string, table2: string, options?: { tableName?: string }): string {
    return _findJoinTableName.call(this, table1, table2, options);
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
    ...args: [...args: unknown[], block: MigrationBlock] | unknown[]
  ): Promise<MigrationCommand[]> {
    while (args.length > 0 && args[args.length - 1] === undefined) args.pop();
    const block =
      typeof args[args.length - 1] === "function" ? (args.pop() as MigrationBlock) : undefined;
    while (args.length > 0 && args[args.length - 1] === undefined) args.pop();
    return this.record(method, args, block);
  };
}
