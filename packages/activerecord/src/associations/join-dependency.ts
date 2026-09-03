import { Notifications } from "@blazetrails/activesupport";
import type { Base } from "../base.js";
import type { Result } from "../result.js";
import type { AssociationSpec } from "../relation/query-methods.js";
import { Nodes, Table as ArelTable } from "@blazetrails/arel";
import { isAssociationCached, _cacheSingularTarget } from "../associations.js";
import { _reflectOnAssociation } from "../reflection.js";
import { JoinBase } from "./join-dependency/join-base.js";
import { JoinAssociation } from "./join-dependency/join-association.js";
import { JoinPart } from "./join-dependency/join-part.js";
import { AssociationNotFoundError, EagerLoadPolymorphicError } from "./errors.js";
import { ConfigurationError, ConnectionNotDefined } from "../errors.js";
import {
  AliasCounts,
  AliasTracker,
  aliasedArelTableFor,
  aliasedArelTableForReflection,
} from "./alias-tracker.js";
import { threadedConnectionFor } from "../connection-handling.js";

const NO_PRIMARY_KEY_ID = Symbol("JoinDependency.noPrimaryKeyId");

let _reflectionIdCounter = 0;
const _reflectionIds = new WeakMap<object, number>();
function reflectionChainKey(chain: readonly object[]): string {
  let key = "";
  for (const refl of chain) {
    let id = _reflectionIds.get(refl);
    if (id === undefined) {
      id = ++_reflectionIdCounter;
      _reflectionIds.set(refl, id);
    }
    key += key ? `,${id}` : `${id}`;
  }
  return key;
}

function getModelColumns(modelClass: any): string[] {
  let ch: Record<string, unknown> | undefined;
  if (typeof modelClass.columnsHash === "function") {
    try {
      ch = modelClass.columnsHash() as Record<string, unknown>;
    } catch {
      ch = undefined;
    }
  }
  const cols: string[] = ch ? Object.keys(ch) : [];
  const pk = modelClass.primaryKey;
  if (Array.isArray(pk)) {
    for (const k of pk) {
      if (k && !cols.includes(k)) cols.unshift(k);
    }
  } else if (pk && !cols.includes(pk)) {
    cols.unshift(pk);
  }
  return cols;
}

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
  private _aliasTracker: AliasTracker;
  private _aliasesCache?: Aliases;
  private _joinRootAlias = true;
  private readonly _joinRoot: JoinBase;
  private readonly _joinType: typeof Nodes.InnerJoin | typeof Nodes.OuterJoin;
  private _references: Map<string, string> = new Map();
  /** @internal */
  private _joinedTables: Map<
    string,
    { aliased: ArelTable | Nodes.TableAlias; effectiveName: string; terminated: boolean }
  > = new Map();
  constructor(
    base: typeof Base,
    table: ArelTable | Nodes.TableAlias | null,
    associations: AssociationSpec | AssociationSpec[] | null,
    joinType: typeof Nodes.InnerJoin | typeof Nodes.OuterJoin | null,
  ) {
    this._baseModel = base;
    table ??= (base as any).arelTable;
    this._baseAlias = (table as any).name ?? (base as any).tableName;
    this._aliasTracker = new AliasTracker(this._baseTableAliasLength(), this._baseAliases());
    this._joinType = joinType ?? Nodes.OuterJoin;
    const tree = JoinDependency.makeTree(associations ?? []);
    this._joinRoot = new JoinBase(base, table as ArelTable, this.build(tree, base));
    this._assignPaths(this._joinRoot, null);
  }

  /** @internal */
  private _baseTableAliasLength(): number | undefined {
    let connection;
    try {
      connection = threadedConnectionFor(this._baseModel) ?? (this._baseModel as any).connection;
    } catch (error) {
      if (error instanceof ConnectionNotDefined) return undefined;
      throw error;
    }
    return typeof connection?.tableAliasLength === "function"
      ? connection.tableAliasLength()
      : undefined;
  }

  /** @internal */
  private _tableIndexCounter = 1;

  /** @internal */
  private _nextTableIndex(): number {
    return this._tableIndexCounter++;
  }

  /** @internal */
  private _assignPaths(node: JoinPart, parentPath: string | null): void {
    if (node !== this._joinRoot) {
      node.parentPath = parentPath;
      node.assocName = parentPath
        ? `${parentPath}.${node.immediateAssocName}`
        : node.immediateAssocName;
    }
    for (const child of node.children) {
      this._assignPaths(child, node === this._joinRoot ? null : node.assocName);
    }
  }

  /** @internal */
  get joinRoot(): JoinBase {
    return this._joinRoot;
  }

  get nodes(): JoinPart[] {
    const result: JoinPart[] = [];
    this._joinRoot.each((part) => {
      if (part !== this._joinRoot && part.tableIndex >= 0) {
        result.push(part);
      }
    });
    return result;
  }

  /** @internal */
  private addAssociation(reflection: any): JoinPart {
    const assocName: string = reflection.name;

    const assocType: "hasMany" | "hasOne" | "belongsTo" =
      reflection.macro === "hasAndBelongsToMany" ? "hasMany" : reflection.macro;
    const targetModel: typeof Base = reflection.klass;
    const targetTable: string = (targetModel as any).tableName;

    const tableIndex = this._nextTableIndex();
    const tableAlias = `t${tableIndex}`;

    const targetArelTable = aliasedArelTableFor(targetModel as never, targetTable);
    const columns = getModelColumns(targetModel);

    const treePart = new JoinAssociation(reflection);
    treePart.tableIndex = tableIndex;
    treePart.table = targetArelTable;
    treePart.tableAlias = tableAlias;
    treePart.effectiveSqlName = targetTable;
    treePart.columns = columns;
    treePart.immediateAssocName = assocName;
    treePart.assocType = assocType;
    return treePart;
  }

  /** @internal */
  private build(associations: Record<string, any>, baseKlass: typeof Base): JoinPart[] {
    return Object.keys(associations).flatMap((name) => {
      const right = associations[name];
      const reflection = this.findReflection(baseKlass, name);
      reflection.checkValidityBang?.();
      reflection.checkEagerLoadableBang?.();
      if (reflection.isPolymorphic?.()) {
        throw new EagerLoadPolymorphicError(name);
      }
      const node = this.addAssociation(reflection);
      if (right != null) node.children.push(...this.build(right, reflection.klass));
      return [node];
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
    aliasTracker?: AliasTracker,
    references?: Array<string | Nodes.SqlLiteral>,
  ): Nodes.Join[] {
    if (aliasTracker) {
      this._aliasTracker = aliasTracker;
    } else {
      this._aliasTracker = new AliasTracker(this._baseTableAliasLength(), this._baseAliases());
    }
    this._references = new Map();
    this._joinedTables = new Map();
    if (references) {
      for (const tableName of references) {
        if (tableName instanceof Nodes.SqlLiteral)
          this._references.set(tableName.value, tableName.value);
      }
    }
    const joins = this.makeJoinConstraints(this.joinRoot, this.joinType);

    for (const oj of joinsToAdd) {
      if (this.joinRoot.isMatch(oj.joinRoot)) {
        joins.push(...this.walk(this.joinRoot, oj.joinRoot, oj.joinType));
      } else {
        joins.push(...this.makeJoinConstraints(oj.joinRoot, oj.joinType));
      }
    }
    return joins;
  }

  /** @internal */
  private makeJoinConstraints(
    joinRoot: JoinPart,
    joinType: typeof Nodes.InnerJoin | typeof Nodes.OuterJoin,
  ): Nodes.Join[] {
    return joinRoot.children.flatMap((child) => this.makeConstraints(joinRoot, child, joinType));
  }

  /**
   * @internal
   * @missingRailsCall map — PERMANENT
   */
  private walk(
    left: JoinPart,
    right: JoinPart,
    joinType: typeof Nodes.InnerJoin | typeof Nodes.OuterJoin,
  ): Nodes.Join[] {
    const intersection: [JoinPart, JoinPart][] = [];
    const missing: JoinPart[] = [];

    for (const r of right.children) {
      const l = left.children.find((lc) => r.isMatch(lc));
      if (l) intersection.push([l, r]);
      else missing.push(r);
    }

    const joins = intersection.flatMap(([l, r]) => {
      if (r instanceof JoinAssociation) {
        r.table = l.table;
        if (l.effectiveSqlName) r.effectiveSqlName = l.effectiveSqlName;
      }
      return this.walk(l, r, joinType);
    });

    return joins.concat(missing.flatMap((n) => this.makeConstraints(left, n, joinType)));
  }

  /** @internal */
  private makeConstraints(
    parent: JoinPart,
    child: JoinPart,
    joinType: typeof Nodes.InnerJoin | typeof Nodes.OuterJoin,
  ): Nodes.Join[] {
    const foreignTable =
      parent.table ?? aliasedArelTableFor(parent.baseKlass as never, parent.tableName);
    const foreignKlass = parent.baseKlass;
    const joins: Nodes.Join[] = [];

    if (child instanceof JoinAssociation) {
      let resolvedRoot:
        | { aliased: ArelTable | Nodes.TableAlias; effectiveName: string }
        | undefined;
      const built = child.joinConstraints(
        foreignTable,
        foreignKlass,
        joinType,
        this.aliasTracker,
        (reflection, remainingReflectionChain) => {
          const chainKey = reflectionChainKey(remainingReflectionChain);
          const memo = this._joinedTables.get(chainKey);
          const root = reflection === child.reflection;

          if (memo && (!root || !memo.terminated)) {
            if (root) {
              memo.terminated = true;
              resolvedRoot = memo;
            }
            return [memo.aliased, true];
          }

          const tableName = this._references.get((reflection as any).name);

          const table = this.aliasTracker.aliasedTableFor(
            aliasedArelTableForReflection(reflection, (reflection as any).tableName),
            tableName ?? null,
            () => {
              const name = (reflection as any).aliasCandidate(parent.tableName);
              return root ? name : `${name}_join`;
            },
          );
          const effectiveName = String(table.tableAlias ?? table.name);
          const aliased = aliasedArelTableForReflection(
            reflection,
            (reflection as any).tableName,
            effectiveName,
          );
          if (root) resolvedRoot = { aliased, effectiveName };

          if (joinType === Nodes.OuterJoin && !this._joinedTables.has(chainKey)) {
            this._joinedTables.set(chainKey, { aliased, effectiveName, terminated: root });
          }
          return [aliased, false];
        },
      );

      if (resolvedRoot) {
        child.table = resolvedRoot.aliased;
        child.effectiveSqlName = resolvedRoot.effectiveName;
      }
      joins.push(...(built as Nodes.Join[]));
      this._aliasesCache = undefined;
    }

    return joins.concat(child.children.flatMap((c) => this.makeConstraints(child, c, joinType)));
  }

  instantiate(
    resultSet: Result,
    strictLoadingValue?: boolean | null,
    block?: (record: any) => void,
  ): any[] {
    const columnNames = resultSet.columns.filter((name) => !/^t\d+_r\d+$/.test(name));
    let columnTypes: Record<string, { deserialize(value: unknown): unknown }> = {};
    if (columnNames.length !== 0) {
      const reported = resultSet.columnTypes as Record<
        string,
        { deserialize(value: unknown): unknown }
      >;
      if (Object.keys(reported).length !== 0) {
        const attributeTypes = this._baseModel.attributeTypes();
        columnTypes = Object.fromEntries(
          columnNames
            .filter((name) => Object.hasOwn(reported, name) && !Object.hasOwn(attributeTypes, name))
            .map((name) => [name, reported[name]]),
        );
      }
    }

    const rows = resultSet.toArray();
    const payload = {
      record_count: rows.length,
      class_name: this._baseModel.baseClass.name,
    };
    const { parents, associations, parentKeys } = Notifications.instrument(
      "instantiation.active_record",
      payload,
      () => this.instantiateFromRows(rows, strictLoadingValue, columnTypes),
    );

    const inverseMap = new Map<string, string | undefined>();
    const modelReflections: Record<string, any> = (this._baseModel as any)._reflections ?? {};
    for (const [assocName, reflection] of Object.entries(modelReflections)) {
      inverseMap.set(assocName, reflection.options?.inverseOf);
    }

    for (const parent of parents) {
      const pk = parentKeys.get(parent);
      const assocs = associations.get(pk);
      for (const node of this.nodes) {
        if (node.immediateAssocName.startsWith("_through_")) continue;
        if (node.parentPath !== null) continue;
        const children = assocs?.get(node.immediateAssocName) ?? [];
        const isSingular = node.assocType === "hasOne" || node.assocType === "belongsTo";

        const inverseName = inverseMap.get(node.immediateAssocName);
        if (inverseName) {
          const targets = isSingular ? (children[0] ? [children[0]] : []) : children;
          for (const child of targets) {
            _cacheSingularTarget(child, inverseName, parent);
          }
        }
      }
    }

    if (block) for (const parent of parents) block(parent);
    return parents;
  }

  /** @missingRailsCall empty? — PERMANENT */
  applyColumnAliases(relation: any): any {
    this._joinRootAlias = (relation?.selectValues?.length ?? 0) === 0;
    this._aliasesCache = undefined;
    return relation._selectBang(() => this.aliases().columns());
  }

  each(callback: (part: JoinPart, index: number) => void): void {
    this.nodes.forEach(callback);
  }

  /** @noRailsEquivalent PERMANENT */
  [Symbol.iterator](): Iterator<JoinPart> {
    return this.nodes[Symbol.iterator]();
  }

  static makeTree(associations: any): Record<string, any> {
    const hash: Record<string, any> = Object.create(null);
    JoinDependency.walkTree(associations, hash);
    return hash;
  }

  static walkTree(associations: any, hash: Record<string, any>): void {
    if (typeof associations === "string") {
      const name = associations.startsWith(":") ? associations.slice(1) : associations;
      let cur = hash;
      for (const part of name.split(".")) {
        cur = cur[part] ??= Object.create(null);
      }
    } else if (Array.isArray(associations)) {
      for (const assoc of associations) {
        JoinDependency.walkTree(assoc, hash);
      }
    } else if (associations && typeof associations === "object") {
      for (const key of Reflect.ownKeys(associations)) {
        const value = associations[key];
        const k = typeof key === "string" && key.startsWith(":") ? key.slice(1) : String(key);
        if (!hash[k]) hash[k] = Object.create(null);
        if (value != null) JoinDependency.walkTree(value, hash[k]);
      }
    } else {
      let desc: string;
      try {
        desc = JSON.stringify(associations) ?? String(associations);
      } catch {
        desc = `${typeof associations}`;
      }
      throw new ConfigurationError(`Invalid association spec: ${desc}`);
    }
  }

  instantiateFromRows(
    rows: Record<string, unknown>[],
    strictLoadingValue?: boolean | null,
    columnTypes?: Record<string, { deserialize(value: unknown): unknown }>,
  ): {
    parents: any[];
    associations: Map<unknown, Map<string, any[]>>;
    parentKeys: Map<any, unknown>;
  } {
    const joinRoot = this._joinRoot;
    const aliases = this.aliases();
    const basePk = (this._baseModel as any).primaryKey ?? "id";
    const basePkCols: string[] = Array.isArray(basePk) ? basePk : [basePk];
    const columnAliases = aliases.columnAliases(joinRoot)!;

    const seen = new Map<any, Map<JoinPart, Map<unknown, any>>>();
    const modelCache = new Map<JoinPart, Map<unknown, any>>();
    const parents = new Map<unknown, any>();
    modelCache.set(joinRoot, parents);

    for (const row of rows) {
      const parentAttrs: Record<string, unknown> = Object.create(null);
      for (const { name, alias } of columnAliases) {
        parentAttrs[name] = row[alias];
      }
      for (const key of Object.keys(row)) {
        if (!/^t\d+_r\d+$/.test(key)) parentAttrs[key] = row[key];
      }

      const parentKey = this._keyFor(basePkCols.map((c) => parentAttrs[c]));
      let parent = parents.get(parentKey);
      if (!parent) {
        parent = (this._baseModel as any)._instantiate(parentAttrs, undefined, columnTypes);
        if (strictLoadingValue && typeof parent.strictLoadingBang === "function") {
          parent.strictLoadingBang();
        }
        parents.set(parentKey, parent);
      }

      this.construct(parent, joinRoot, row, seen, modelCache, strictLoadingValue);
    }

    const parentList = [...parents.values()];
    const parentKeys = new Map<any, unknown>();
    for (const [key, parent] of parents) parentKeys.set(parent, key);
    return {
      parents: parentList,
      associations: this._collectAssociations(parents),
      parentKeys,
    };
  }

  /** @internal */
  private construct(
    arParent: any,
    parent: JoinPart,
    row: Record<string, unknown>,
    seen: Map<any, Map<JoinPart, Map<unknown, any>>>,
    modelCache: Map<JoinPart, Map<unknown, any>>,
    strictLoadingValue?: boolean | null,
  ): void {
    if (arParent == null) return;
    const aliases = this.aliases();
    for (const node of parent.children) {
      if (node.tableIndex < 0) continue;

      const isCollection = node.assocType === "hasMany";
      if (isCollection) {
        this._markCollectionLoaded(arParent, node);
      } else if (
        arParent._associationInstances &&
        isAssociationCached(arParent, node.immediateAssocName)
      ) {
        const model = arParent.association?.(node.immediateAssocName)?.target;
        this.construct(model, node, row, seen, modelCache, strictLoadingValue);
        continue;
      }

      const nodePk = (node.baseKlass as any).primaryKey;
      let keys: string[];
      if (nodePk) {
        keys = (Array.isArray(nodePk) ? nodePk : [nodePk]).map(
          (column) => aliases.columnAlias(node, String(column))!,
        );
      } else {
        const jpk = ((node as JoinAssociation).reflection as any).joinPrimaryKey() as
          | string
          | string[];
        keys = (Array.isArray(jpk) ? jpk : [jpk]).map(
          (column) => aliases.columnAlias(node, String(column))!,
        );
      }
      const keyVals = keys.map((key) => row[key]);
      if (keyVals.some((v) => v === null || v === undefined)) {
        this._markAssociationLoaded(arParent, node);
        continue;
      }
      const id = nodePk ? this._keyFor(keyVals) : NO_PRIMARY_KEY_ID;

      let parentSeen = seen.get(arParent);
      if (!parentSeen) {
        parentSeen = new Map();
        seen.set(arParent, parentSeen);
      }
      let nodeSeen = parentSeen.get(node);
      if (!nodeSeen) {
        nodeSeen = new Map();
        parentSeen.set(node, nodeSeen);
      }
      let model = nodeSeen.get(id);
      if (!model) {
        model = this.constructModel(arParent, node, row, modelCache, id, strictLoadingValue);
        nodeSeen.set(id, model);
      }

      this.construct(model, node, row, seen, modelCache, strictLoadingValue);
    }
  }

  /** @internal */
  private _keyFor(vals: unknown[]): unknown {
    return vals.length === 1 ? vals[0] : vals.join("\u0000");
  }

  /** @internal */
  private _collectAssociations(parents: Map<unknown, any>): Map<unknown, Map<string, any[]>> {
    const associations = new Map<unknown, Map<string, any[]>>();
    for (const [key, parent] of parents) {
      const assocs = new Map<string, any[]>();
      for (const child of this._joinRoot.children) {
        if (child.tableIndex < 0) continue;
        const proxy = parent.association?.(child.immediateAssocName);
        const target = proxy?.target;
        assocs.set(
          child.immediateAssocName,
          Array.isArray(target) ? target : target ? [target] : [],
        );
      }
      associations.set(key, assocs);
    }
    return associations;
  }

  protected get joinRootAlias(): string {
    return this._baseAlias;
  }

  /** @internal */
  private _baseAliases(): AliasCounts {
    const aliases = new AliasCounts(() => 0);
    aliases.set(this._baseAlias, 1);
    return aliases;
  }

  private get aliasTracker(): AliasTracker {
    return this._aliasTracker;
  }

  /** @internal */
  private findReflection(klass: typeof Base, name: string): any {
    const reflection = _reflectOnAssociation(klass as any, name);
    if (!reflection) {
      throw new ConfigurationError(
        `Can't join '${(klass as any).name}' to association named '${name}'; perhaps you misspelled it?`,
      );
    }
    return reflection;
  }

  /** @internal */
  private aliases(): Aliases {
    return (this._aliasesCache ??= new Aliases(
      [this._joinRoot, ...this.nodes].map((joinPart) => {
        const isJoinRoot = joinPart === this._joinRoot;
        let columnNames: string[];
        if (isJoinRoot && !this._joinRootAlias) {
          const primaryKey = (this._baseModel as any).primaryKey;
          columnNames = primaryKey ? (Array.isArray(primaryKey) ? primaryKey : [primaryKey]) : [];
        } else {
          columnNames = isJoinRoot ? getModelColumns(this._baseModel) : joinPart.columns;
        }
        const i = isJoinRoot ? 0 : joinPart.tableIndex;
        const columns = columnNames.map(
          (columnName, j) => new Aliases.Column(columnName, `t${i}_r${j}`),
        );
        return new Aliases.Table(joinPart, columns);
      }),
    ));
  }

  private constructModel(
    record: any,
    node: JoinPart,
    row: Record<string, unknown>,
    modelCache: Map<JoinPart, Map<unknown, any>>,
    id: unknown,
    strictLoadingValue?: boolean | null,
  ): any {
    let nodeCache = modelCache.get(node);
    if (!nodeCache) {
      nodeCache = new Map();
      modelCache.set(node, nodeCache);
    }
    let model = nodeCache.get(id);
    if (!model) {
      const attrs: Record<string, unknown> = {};
      const columnAliases = this.aliases().columnAliases(node)!;
      for (const { name, alias } of columnAliases) {
        attrs[name] = row[alias];
      }
      model = (node.baseKlass as any)._instantiate(attrs, (built: any) => {
        if (strictLoadingValue && typeof built.strictLoadingBang === "function") {
          built.strictLoadingBang();
        }
        this._setInverseBeforeCallbacks(record, node, built);
      });
      if (id != null) nodeCache.set(id, model);
    }

    this._wireAssociationProxy(record, node, model);

    if (node.isReadonly()) model._readonly = true;
    if (node.isStrictLoading() && typeof model.strictLoadingBang === "function") {
      model.strictLoadingBang();
    }
    return model;
  }

  /** @internal */
  private _setInverseBeforeCallbacks(parent: any, node: JoinPart, child: any): void {
    if (typeof parent.association !== "function") return;
    try {
      const proxy = parent.association(node.immediateAssocName);
      if (proxy && typeof proxy.setInverseInstance === "function") {
        proxy.setInverseInstance(child);
      }
    } catch (e) {
      if (!(e instanceof AssociationNotFoundError)) throw e;
    }
  }

  /** @internal */
  private _wireAssociationProxy(parent: any, node: JoinPart, child: any): void {
    if (typeof parent.association !== "function") return;
    try {
      const proxy = parent.association(node.immediateAssocName);
      if (!proxy) return;
      const isCollection = node.assocType === "hasMany";
      if (isCollection) {
        if (!proxy.loaded) {
          proxy.target = [];
        }
        if (Array.isArray(proxy.target)) {
          proxy.target.push(child);
        }
      } else {
        proxy._setTargetFromLoader(child);
      }
      proxy.loadedBang();
      if (typeof proxy.setInverseInstance === "function") {
        proxy.setInverseInstance(child);
      }
    } catch (e) {
      if (!(e instanceof AssociationNotFoundError)) throw e;
    }
  }

  /** @internal */
  private _markCollectionLoaded(parent: any, node: JoinPart): void {
    if (typeof parent.association !== "function") return;
    try {
      const proxy = parent.association(node.immediateAssocName);
      if (!proxy || proxy.loaded) return;
      proxy.target = [];
    } catch (e) {
      if (!(e instanceof AssociationNotFoundError)) throw e;
    }
  }

  /** @internal */
  private _markAssociationLoaded(parent: any, node: JoinPart): void {
    if (typeof parent.association !== "function") return;
    try {
      const proxy = parent.association(node.immediateAssocName);
      if (!proxy || proxy.loaded) return;
      const isCollection = node.assocType === "hasMany";
      proxy._setTargetFromLoader(isCollection ? [] : null);
    } catch (e) {
      if (!(e instanceof AssociationNotFoundError)) throw e;
    }
  }
}
