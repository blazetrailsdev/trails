import * as Associations from "./associations.js";
import * as AttributeMethods from "./attribute-methods.js";
import type { Attributes } from "./attribute-methods.js";
import { Connection, type DatabaseConfig } from "./connection-handling.js";
import { ConnectionNotEstablished, RecordNotFound } from "./errors.js";
import { Errors } from "./model-errors.js";
import * as ModelSchema from "./model-schema.js";
import * as Persistence from "./persistence.js";
import { Relation, type OrderDirection } from "./relation.js";
import { humanAttributeName, type Translate } from "./translation.js";
import { cast } from "./type.js";
import * as Validations from "./validations.js";

export type ModelClass<T extends Base = Base> = (new (attributes?: Attributes | null) => T) &
  typeof Base;

/**
 * The whole model surface, written out by hand. Each method is one line that
 * hands the record to the module holding the behaviour, in the file Rails
 * keeps it in, so nothing is mixed in at load and no call is dispatched by
 * name.
 */
export class Base {
  static tableName: string | null = null;
  /** @internal */
  static _connection: Connection | null = null;
  /** @internal */
  static _reflections: Map<string, Associations.Reflection> = new Map();
  /** @internal */
  static _validators: Validations.Validator[] = [];
  /** @internal */
  declare static _schema: ModelSchema.ModelSchema;
  /** An application's translations, consulted before the built-in English messages. */
  static i18n: Translate | null = null;

  /** @internal */
  declare _schema: ModelSchema.ModelSchema;
  /** @internal */
  _row: unknown[];
  /** @internal */
  _original: readonly unknown[] | null;
  /** @internal */
  _newRecord: boolean;
  /** @internal */
  _destroyed: boolean;
  /** @internal */
  _associationCache: Map<string, Base | null> | null;
  /** @internal */
  _beforeTypeCast: Map<number, unknown> | null;
  /** @internal */
  _errors: Errors | null;

  declare id: number | null;

  constructor(attributes: Attributes | null = null) {
    const schema = (this.constructor as typeof Base).schema;
    this._row = schema.defaultRow.slice();
    this._original = schema.defaultRow;
    this._newRecord = true;
    this._destroyed = false;
    this._associationCache = null;
    this._beforeTypeCast = null;
    this._errors = null;
    if (attributes !== null) AttributeMethods.assignAttributes(this, attributes);
  }

  static async establishConnection(config: DatabaseConfig): Promise<void> {
    this._connection = new Connection(config);
  }

  static get connection(): Connection {
    if (this._connection === null) {
      throw new ConnectionNotEstablished(`No connection established for ${this.name}`);
    }
    return this._connection;
  }

  static get schema(): ModelSchema.ModelSchema {
    if (Object.hasOwn(this, "_schema")) return this._schema;
    const schema = ModelSchema.reflectSchema(this);
    this._schema = schema;
    this.prototype._schema = schema;
    ModelSchema.registerModel(this);
    AttributeMethods.defineAttributeMethods(schema);
    for (const [name, write] of Associations.associationWriters(this)) {
      schema.writers.set(name, write);
    }
    return schema;
  }

  static async loadSchema(): Promise<void> {
    void this.schema;
  }

  static belongsTo(name: string, options: Associations.BelongsToOptions): void {
    Associations.belongsTo(this, name, options);
  }

  static validates(
    ...args: [...attributes: string[], options: Validations.ValidatesOptions]
  ): void {
    const options = args.at(-1) as Validations.ValidatesOptions;
    const attributes = args.slice(0, -1) as string[];
    if (!Object.hasOwn(this, "_validators")) this._validators = this._validators.slice();
    this._validators.push(...Validations.buildValidators(attributes, options));
  }

  static humanAttributeName(attribute: string): string {
    return humanAttributeName(this.name, attribute, this.i18n);
  }

  static all<T extends Base>(this: ModelClass<T>): Relation<T> {
    return new Relation(this);
  }

  static where<T extends Base>(this: ModelClass<T>, conditions: Attributes): Relation<T> {
    return new Relation(this).where(conditions);
  }

  static order<T extends Base>(
    this: ModelClass<T>,
    ordering: Record<string, OrderDirection>,
  ): Relation<T> {
    return new Relation(this).order(ordering);
  }

  static limit<T extends Base>(this: ModelClass<T>, value: number | string | null): Relation<T> {
    return new Relation(this).limit(value);
  }

  static includes<T extends Base>(this: ModelClass<T>, ...names: string[]): Relation<T> {
    return new Relation(this).includes(...names);
  }

  static first<T extends Base>(this: ModelClass<T>): Promise<T | null> {
    return new Relation(this).first();
  }

  static count<T extends Base>(this: ModelClass<T>): Promise<number> {
    return new Relation(this).count();
  }

  static findBy<T extends Base>(this: ModelClass<T>, conditions: Attributes): Promise<T | null> {
    return new Relation(this).findBy(conditions);
  }

  static async find<T extends Base>(this: ModelClass<T>, id: unknown): Promise<T> {
    const schema = this.schema;
    const primaryKey = ModelSchema.primaryKeyBang(schema);
    const key = cast(schema.types[schema.primaryKeyIndex], id);
    const row = this.connection.selectRow(schema.findSql, [key]);
    if (row === undefined) {
      throw new RecordNotFound(`Couldn't find ${this.name} with '${primaryKey}'=${String(id)}`);
    }
    return Persistence.instantiate(schema, row) as T;
  }

  static async create<T extends Base>(
    this: ModelClass<T>,
    attributes: Attributes | null = null,
  ): Promise<T> {
    const record = new this(attributes);
    Persistence.save(record);
    return record;
  }

  static async createBang<T extends Base>(
    this: ModelClass<T>,
    attributes: Attributes | null = null,
  ): Promise<T> {
    const record = new this(attributes);
    Persistence.saveBang(record);
    return record;
  }

  readAttribute(name: string): unknown {
    return AttributeMethods.readAttribute(this, name);
  }

  readAttributeBeforeTypeCast(name: string): unknown {
    return AttributeMethods.readAttributeBeforeTypeCast(this, name);
  }

  writeAttribute(name: string, value: unknown): void {
    AttributeMethods.writeAttribute(this, name, value);
  }

  assignAttributes(attributes: Attributes): void {
    AttributeMethods.assignAttributes(this, attributes);
  }

  get attributes(): Attributes {
    return AttributeMethods.attributes(this);
  }

  get changes(): Record<string, [unknown, unknown]> {
    return AttributeMethods.changes(this);
  }

  get isChanged(): boolean {
    return AttributeMethods.changedIndexes(this).length > 0;
  }

  isNewRecord(): boolean {
    return this._newRecord;
  }

  isDestroyed(): boolean {
    return this._destroyed;
  }

  isPersisted(): boolean {
    return !this._newRecord && !this._destroyed;
  }

  get errors(): Errors {
    return (this._errors ??= new Errors(this));
  }

  async isValid(): Promise<boolean> {
    return Persistence.isValid(this);
  }

  async save(): Promise<boolean> {
    return Persistence.save(this);
  }

  async saveBang(): Promise<true> {
    return Persistence.saveBang(this);
  }

  async update(attributes: Attributes): Promise<boolean> {
    AttributeMethods.assignAttributes(this, attributes);
    return Persistence.save(this);
  }

  async destroy(): Promise<this> {
    Persistence.destroy(this);
    return this;
  }
}
