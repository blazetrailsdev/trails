import {
  Autoload,
  extend,
  isPlainObject,
  kernelArray,
  Notifications,
  type Extended,
} from "@blazetrails/activesupport";
import {
  first,
  Hash,
  hasKey,
  isEmpty,
  partition,
  rbInspect,
  rtest,
  symbolToS,
  toS,
  toSym,
} from "@blazetrails/ruby-compat";
import type { Base } from "../base.js";
import type { Result } from "../result.js";
import type { AssociationSpec } from "../relation/query-methods.js";
import { Nodes, Table as ArelTable } from "@blazetrails/arel";
import { _reflectOnAssociation } from "../reflection.js";
import { Associations } from "../namespaces.js";
import { JoinBase } from "./join-dependency/join-base.js";
import { JoinAssociation } from "./join-dependency/join-association.js";
import { JoinPart } from "./join-dependency/join-part.js";
import { EagerLoadPolymorphicError } from "./errors.js";
import { ConfigurationError } from "../errors.js";
import type { AliasTracker } from "./alias-tracker.js";

export class Aliases {
  private _tables: Aliases.Table[];
  private _aliasCache: Map<JoinPart | null, Map<string, string>>;
  private _columnsCache: Map<JoinPart | null, Aliases.Column[]>;

  constructor(tables: Aliases.Table[]) {
    this._tables = tables;
    this._aliasCache = new Map();
    for (const table of tables) {
      const i = new Map<string, string>();
      for (const column of table.columns) i.set(column.name, column.alias);
      this._aliasCache.set(table.node, i);
    }
    this._columnsCache = new Map();
    for (const table of tables) this._columnsCache.set(table.node, table.columns);
  }

  columns(): Nodes.As[] {
    return this._tables.flatMap((table) => table.columnAliases());
  }

  columnAliases(node: JoinPart | null): Aliases.Column[] | undefined {
    return this._columnsCache.get(node);
  }

  columnAlias(node: JoinPart | null, column: string): string | undefined {
    return this._aliasCache.get(node)?.get(column);
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Aliases {
  export class Table {
    node: JoinPart | null;
    columns: Column[];

    constructor(node: JoinPart | null, columns: Column[]) {
      this.node = node;
      this.columns = columns;
    }

    columnAliases(): Nodes.As[] {
      const t = this.node!.table as ArelTable | Nodes.TableAlias;
      return this.columns.map((column) => t.get(column.name).as(column.alias));
    }
  }

  export class Column {
    name: string;
    alias: string;

    constructor(name: string, alias: string) {
      this.name = name;
      this.alias = alias;
    }
  }
}

export class JoinDependency {
  private _baseModel: typeof Base;
  private _baseAlias: string;
  private _aliasTracker!: AliasTracker;
  private _aliasesCache?: Aliases;
  private _joinRootAlias = true;
  private readonly _joinRoot: JoinBase;
  private readonly _joinType: typeof Nodes.InnerJoin | typeof Nodes.OuterJoin;
  private _references: Map<string, string> = new Map();
  /** @internal */
  private _joinedTables: Hash<readonly object[], [ArelTable | Nodes.TableAlias, boolean]> =
    new Hash();
  constructor(
    base: typeof Base,
    table: ArelTable | Nodes.TableAlias | null,
    associations: AssociationSpec | AssociationSpec[] | null,
    joinType: typeof Nodes.InnerJoin | typeof Nodes.OuterJoin | null,
  ) {
    this._baseModel = base;
    table ??= (base as any).arelTable;
    this._baseAlias = (table as any).name ?? (base as any).tableName;
    this._joinType = joinType ?? Nodes.OuterJoin;
    const tree = JoinDependency.makeTree(associations ?? []);
    this._joinRoot = new JoinBase(base, table as ArelTable, this.build(tree, base));
  }

  /** @internal */
  get joinRoot(): JoinBase {
    return this._joinRoot;
  }

  /** @internal */
  private build(associations: Record<string, any>, baseKlass: typeof Base): JoinAssociation[] {
    return Object.keys(associations).flatMap((name) => {
      const right = associations[name];
      const reflection = this.findReflection(baseKlass, name);
      reflection.checkValidityBang();
      reflection.checkEagerLoadableBang();

      if (reflection.isPolymorphic()) {
        throw new EagerLoadPolymorphicError(reflection);
      }

      return [new JoinAssociation(reflection, this.build(right, reflection.klass))];
    });
  }

  get baseKlass(): typeof Base {
    return this._baseModel;
  }

  get reflections(): any[] {
    return this.joinRoot
      .drop(1)
      .map((node) => (node as any).reflection)
      .filter((reflection) => reflection != null);
  }

  /** @internal */
  get joinType(): typeof Nodes.InnerJoin | typeof Nodes.OuterJoin {
    return this._joinType;
  }

  joinConstraints(
    joinsToAdd: JoinDependency[],
    aliasTracker: AliasTracker,
    references: Array<string | Nodes.SqlLiteral>,
  ): Nodes.Join[] {
    this._aliasTracker = aliasTracker;
    this._joinedTables = new Hash();
    this._references = new Map();

    if (!isEmpty(references)) {
      for (const tableName of references) {
        if (tableName instanceof Nodes.SqlLiteral) {
          this._references.set(tableName.toString(), tableName.toString());
        }
      }
    }

    const joins = this.makeJoinConstraints(this.joinRoot, this.joinType);

    return joins.concat(
      joinsToAdd.flatMap((oj) => {
        if (this.joinRoot.isMatch(oj.joinRoot)) {
          return this.walk(this.joinRoot, oj.joinRoot, oj.joinType);
        } else {
          return this.makeJoinConstraints(oj.joinRoot, oj.joinType);
        }
      }),
    );
  }

  /** @internal */
  private makeJoinConstraints(
    joinRoot: JoinPart,
    joinType: typeof Nodes.InnerJoin | typeof Nodes.OuterJoin,
  ): Nodes.Join[] {
    return joinRoot.children.flatMap((child) => this.makeConstraints(joinRoot, child, joinType));
  }

  /** @internal */
  private walk(
    left: JoinPart,
    right: JoinPart,
    joinType: typeof Nodes.InnerJoin | typeof Nodes.OuterJoin,
  ): Nodes.Join[] {
    const [intersection, missing] = partition(
      right.children.map((node1): [JoinAssociation | undefined, JoinAssociation] => [
        left.children.find((node2) => node1.isMatch(node2)),
        node1,
      ]),
      first,
    );

    const joins = intersection.flatMap(([l, r]) => {
      r.table = l!.table;
      return this.walk(l!, r, joinType);
    });
    return joins.concat(missing.flatMap(([, n]) => this.makeConstraints(left, n, joinType)));
  }

  /** @internal */
  private makeConstraints(
    parent: JoinPart,
    child: JoinAssociation,
    joinType: typeof Nodes.InnerJoin | typeof Nodes.OuterJoin,
  ): Nodes.Join[] {
    const foreignTable = parent.table!;
    const foreignKlass = parent.baseKlass;
    const joins = child.joinConstraints(
      foreignTable,
      foreignKlass,
      joinType,
      this.aliasTracker,
      (reflection, remainingReflectionChain) => {
        const [memo, terminated] = this._joinedTables.get(remainingReflectionChain) ?? [];
        let table = memo;
        const root = reflection === child.reflection;

        if (table != null && (!root || !rtest(terminated))) {
          if (root) this._joinedTables.set(remainingReflectionChain, [table, root]);
          return [table, true];
        }

        const tableName = this._references.get((reflection as any).name);

        table = this.aliasTracker.aliasedTableFor(
          (reflection.klass as any).arelTable,
          tableName ?? null,
          () => {
            const name = (reflection as any).aliasCandidate(parent.tableName);
            return root ? name : `${name}_join`;
          },
        );

        if (joinType === Nodes.OuterJoin && !this._joinedTables.has(remainingReflectionChain)) {
          this._joinedTables.set(remainingReflectionChain, [table!, root]);
        }
        return [table!, false];
      },
    ) as Nodes.Join[];

    return joins.concat(child.children.flatMap((c) => this.makeConstraints(child, c, joinType)));
  }

  instantiate(
    resultSet: Result,
    strictLoadingValue?: boolean | null,
    block?: (record: any) => void,
  ): any[] {
    const primaryKey = this.aliases().columnAlias(this.joinRoot, this.joinRoot.primaryKey);

    const seen: Seen = new Hash<any, Hash<JoinPart, Hash<unknown, any>>>((i, parent) => {
      const j = new Hash<JoinPart, Hash<unknown, any>>((j, childClass) => {
        const models = new Hash<unknown, any>();
        j.set(childClass, models);
        return models;
      });
      i.set(parent, j);
      return j;
    }).compareByIdentity();

    const modelCache: ModelCache = new Hash((h, klass) => {
      const models = new Hash<unknown, any>();
      h.set(klass, models);
      return models;
    });
    const parents = modelCache.get(this.joinRoot)!;

    let columnAliases = this.aliases().columnAliases(this.joinRoot)!;
    const columnNames: string[] = [];

    for (const name of resultSet.columns) {
      if (!/^t\d+_r\d+$/.test(name)) columnNames.push(name);
    }

    let columnTypes: Record<string, { deserialize(value: unknown): unknown }>;
    if (columnNames.length === 0) {
      columnTypes = {};
    } else {
      columnTypes = resultSet.columnTypes as Record<
        string,
        { deserialize(value: unknown): unknown }
      >;
      if (Object.keys(columnTypes).length !== 0) {
        const attributeTypes = this.joinRoot.attributeTypes();
        columnTypes = Object.fromEntries(
          columnNames
            .filter((k) => Object.hasOwn(columnTypes, k) && !hasKey(attributeTypes, k))
            .map((k) => [k, columnTypes[k]]),
        );
      }
      columnAliases = columnAliases.concat(
        columnNames.map((name) => new Aliases.Column(name, name)),
      );
    }

    const rows = resultSet.toArray();
    const payload = {
      record_count: rows.length,
      class_name: this.joinRoot.baseKlass.name,
    };

    Notifications.instrument("instantiation.active_record", payload, () => {
      for (const rowHash of rows) {
        const parentKey = primaryKey != null ? rowHash[primaryKey] : rowHash;
        const parent =
          parents.get(parentKey) ||
          parents
            .set(parentKey, this.joinRoot.instantiate(rowHash, columnAliases, columnTypes, block))
            .get(parentKey);
        this.construct(parent, this.joinRoot, rowHash, seen, modelCache, strictLoadingValue);
      }
    });

    return parents.values();
  }

  applyColumnAliases(relation: any): any {
    this._joinRootAlias = isEmpty(relation.selectValues);
    this._aliasesCache = undefined;
    return relation._selectBang(() => this.aliases().columns());
  }

  each(block: (part: JoinPart) => void): void {
    this.joinRoot.each(block);
  }

  static makeTree(associations: any): Record<string, any> {
    const hash: Record<string, any> = Object.create(null);
    JoinDependency.walkTree(associations, hash);
    return hash;
  }

  static walkTree(associations: any, hash: Record<string, any>): void {
    if (typeof associations === "string") {
      hash[symbolToS(toSym(associations))] ||= Object.create(null);
    } else if (Array.isArray(associations)) {
      for (const assoc of associations) {
        JoinDependency.walkTree(assoc, hash);
      }
    } else if (isPlainObject(associations)) {
      for (const [k, v] of Object.entries(associations)) {
        const cache = (hash[symbolToS(toSym(k))] ||= Object.create(null));
        if (rtest(v)) JoinDependency.walkTree(v, cache);
      }
    } else {
      throw new ConfigurationError(rbInspect(associations));
    }
  }

  /** @internal */
  private construct(
    arParent: any,
    parent: JoinPart,
    row: Record<string, unknown>,
    seen: Seen,
    modelCache: ModelCache,
    strictLoadingValue?: boolean | null,
  ): void {
    if (arParent == null) return;

    for (const node of parent.children) {
      if (node.reflection.isCollection()) {
        const other = arParent.association((node.reflection as any).name);
        other.loadedBang();
      } else if (arParent.isAssociationCached((node.reflection as any).name)) {
        const model = arParent.association((node.reflection as any).name).target;
        this.construct(model, node, row, seen, modelCache, strictLoadingValue);
        continue;
      }

      let keys: string[];
      let id: unknown[];
      if (rtest(node.primaryKey)) {
        keys = kernelArray(node.primaryKey).map(
          (column: string) => this.aliases().columnAlias(node, column)!,
        );
        id = keys.map((key) => row[key]);
      } else {
        keys = kernelArray((node.reflection as any).joinPrimaryKey()).map(
          (column: unknown) => this.aliases().columnAlias(node, toS(column))!,
        );
        id = keys.map(() => null);
      }

      if (keys.some((key) => row[key] == null)) {
        const nilAssociation = arParent.association((node.reflection as any).name);
        nilAssociation.loadedBang();
        continue;
      }

      let model = seen.get(arParent)!.get(node)!.get(id);
      if (model == null) {
        model = this.constructModel(arParent, node, row, modelCache, id, strictLoadingValue);
        if (id != null) seen.get(arParent)!.get(node)!.set(id, model);
      }

      this.construct(model, node, row, seen, modelCache, strictLoadingValue);
    }
  }

  protected get joinRootAlias(): string {
    return this._baseAlias;
  }

  private get aliasTracker(): AliasTracker {
    return this._aliasTracker;
  }

  /** @internal */
  private findReflection(klass: typeof Base, name: string): any {
    const reflection = _reflectOnAssociation(klass as any, name);
    if (!rtest(reflection)) {
      throw new ConfigurationError(
        `Can't join '${(klass as any).name}' to association named '${name}'; perhaps you misspelled it?`,
      );
    }
    return reflection;
  }

  /** @internal */
  private aliases(): Aliases {
    return (this._aliasesCache ??= new Aliases(
      [...this.joinRoot].map((joinPart, i) => {
        let columnNames: string[];
        if (joinPart === this.joinRoot && !this._joinRootAlias) {
          const primaryKey = this.joinRoot.primaryKey;
          columnNames = primaryKey != null ? [primaryKey] : [];
        } else {
          columnNames = joinPart.columnNames();
        }
        const columns = columnNames.map(
          (columnName, j) => new Aliases.Column(columnName, `t${i}_r${j}`),
        );
        return new Aliases.Table(joinPart, columns);
      }),
    ));
  }

  private constructModel(
    record: any,
    node: JoinAssociation,
    row: Record<string, unknown>,
    modelCache: ModelCache,
    id: unknown[],
    strictLoadingValue?: boolean | null,
  ): any {
    const other = record.association((node.reflection as any).name);

    let model = modelCache.get(node)!.get(id);
    if (model == null) {
      model = node.instantiate(row, this.aliases().columnAliases(node)!, {}, (m: any) => {
        if (rtest(strictLoadingValue)) m.strictLoadingBang();
        other.setInverseInstance(m);
      });
      if (id != null) modelCache.get(node)!.set(id, model);
    }

    if (node.reflection.isCollection()) {
      other.target.push(model);
    } else {
      other.target = model;
    }

    if (node.isReadonly()) model.readonlyBang();
    if (node.isStrictLoading()) model.strictLoadingBang();
    return model;
  }
}

type ModelCache = Hash<JoinPart, Hash<unknown, any>>;
type Seen = Hash<any, Hash<JoinPart, Hash<unknown, any>>>;

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace JoinDependency {
  const loadPath: Autoload.Autoload["loadPath"];
  let JoinBase: typeof import("./join-dependency/join-base.js").JoinBase;
  let JoinAssociation: typeof import("./join-dependency/join-association.js").JoinAssociation;
  const autoload: Extended<typeof Autoload>["autoload"];
  const eagerAutoload: Extended<typeof Autoload>["eagerAutoload"];
  const eagerLoadBang: Extended<typeof Autoload>["eagerLoadBang"];
}
Object.defineProperty(JoinDependency, "name", {
  value: "ActiveRecord::Associations::JoinDependency",
});
Object.assign(JoinDependency, {
  loadPath: {
    "active_record/associations/join_dependency/join_base": () =>
      import("./join-dependency/join-base.js"),
    "active_record/associations/join_dependency/join_association": () =>
      import("./join-dependency/join-association.js"),
  },
});
extend(JoinDependency, Autoload);

JoinDependency.eagerAutoload(() => {
  JoinDependency.autoload("JoinBase");
  JoinDependency.autoload("JoinAssociation");
});
JoinDependency.JoinBase = JoinBase;
JoinDependency.JoinAssociation = JoinAssociation;

Associations.JoinDependency = JoinDependency;
