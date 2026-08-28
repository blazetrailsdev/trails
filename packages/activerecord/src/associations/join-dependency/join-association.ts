import type { Base } from "../../base.js";
import { Nodes, Table, fetchAttribute } from "@blazetrails/arel";
import type { AbstractReflection } from "../../reflection.js";
import { JoinPart } from "./join-part.js";
import { aliasedArelTableForReflection, type AliasTracker } from "../alias-tracker.js";
import { structuralUnionEq } from "../../relation/query-methods.js";

type JoinType = typeof Nodes.InnerJoin | typeof Nodes.OuterJoin;
type TableResolver = (
  reflection: AbstractReflection,
  remainingChain: AbstractReflection[],
) => [Table | Nodes.TableAlias, boolean];

export class JoinAssociation extends JoinPart {
  readonly reflection: AbstractReflection;
  private _table: Table | Nodes.TableAlias | null = null;
  readonly tables: (Table | Nodes.TableAlias)[] = [];
  private _readonly?: boolean;
  private _strictLoading?: boolean;

  constructor(reflection: AbstractReflection, children?: JoinPart[]) {
    super(reflection.klass, children);
    this.reflection = reflection;
  }

  get table(): string {
    const t = this._table;
    if (!t) return this.reflection.tableName;
    return String(t.tableAlias ?? t.name);
  }

  set table(value: string) {
    const table = aliasedArelTableForReflection(this.reflection, this.reflection.tableName, value);
    this._table = table;
    if (!this.tables.some((t) => String(t.tableAlias ?? t.name) === value)) {
      this.tables.push(table);
    }
  }

  isMatch(other: JoinPart): boolean {
    if (this === other) return true;
    return (
      super.isMatch(other) &&
      other instanceof JoinAssociation &&
      this.reflection === other.reflection
    );
  }

  match(other: JoinPart): boolean {
    return this.isMatch(other);
  }

  /**
   * @missingRailsCall empty? — PERMANENT
   * @missingRailsCall first — PERMANENT
   */
  joinConstraints(
    foreignTable: Table | Nodes.TableAlias,
    foreignKlass: typeof Base,
    joinType: JoinType,
    aliasTracker?: AliasTracker,
    resolveTable?: TableResolver,
  ): Nodes.Node[] {
    const joins: Nodes.Node[] = [];
    const chain: [AbstractReflection, Table | Nodes.TableAlias][] = [];

    const reflectionChain = this.reflection.chain;

    for (let index = 0; index < reflectionChain.length; index++) {
      const refl = reflectionChain[index];
      let table: Table | Nodes.TableAlias;
      let terminated = false;

      if (resolveTable) {
        [table, terminated] = resolveTable(refl, reflectionChain.slice(index));
      } else {
        table = aliasedArelTableForReflection(refl, refl.tableName);
      }

      if (!this._table) this._table = table;
      if (
        !this.tables.some(
          (t) => String(t.tableAlias ?? t.name) === String(table.tableAlias ?? table.name),
        )
      ) {
        this.tables.push(table);
      }

      if (terminated) {
        foreignTable = table;
        foreignKlass = refl.klass;
        break;
      }

      chain.push([refl, table]);
    }

    chain.reverse();

    for (const [refl, table] of chain) {
      const klass = refl.klass;

      const scope = refl.joinScope(table, foreignTable, foreignKlass);

      if (scope && scope.referencesValues.length > 0) {
        const associations = [...scope.eagerLoadValues];
        for (const spec of scope.includesValues) {
          if (!associations.some((seen: unknown) => structuralUnionEq(seen, spec))) {
            associations.push(spec);
          }
        }

        if (associations.length > 0) {
          scope.joinsBang(scope.constructJoinDependency(associations, Nodes.OuterJoin));
        }
      }

      const arel = scope.arel(aliasTracker);
      let nodes: Nodes.Node = arel.constraints[0];

      const others: Nodes.Node[] = [];
      if (nodes instanceof Nodes.And) {
        const remaining: Nodes.Node[] = [];
        for (const child of nodes.children) {
          if (!nodeReferencesTable(child, String(table.tableAlias ?? table.name))) {
            others.push(child);
          } else {
            remaining.push(child);
          }
        }
        if (others.length > 0) {
          if (remaining.length === 0) nodes = new Nodes.True();
          else nodes = remaining.length === 1 ? remaining[0] : new Nodes.And(remaining);
        }
      }

      joins.push(new joinType(table, new Nodes.On(nodes)));

      if (others.length > 0) {
        const sources: Nodes.Node[] = [...arel.joinSources()] as Nodes.Node[];
        joins.push(...sources);
        const lastIdx = joins.length - 1;
        joins[lastIdx] = (appendConstraints(joins[lastIdx], others) ??
          joins[lastIdx]) as Nodes.Join;
      }

      foreignTable = table;
      foreignKlass = klass;
    }

    return joins;
  }

  override isReadonly(): boolean {
    if (this._readonly !== undefined) return this._readonly;
    this._readonly = !!this._scopeRelation()?.readonlyValue;
    return this._readonly;
  }

  override isStrictLoading(): boolean {
    if (this._strictLoading !== undefined) return this._strictLoading;
    this._strictLoading =
      !!(this.reflection as any)?.strictLoading || !!this._scopeRelation()?.strictLoadingValue;
    return this._strictLoading;
  }

  /** @internal */
  private _scopeRelation(): any | null {
    const refl = this.reflection as any;
    if (!refl?.scope || typeof refl.scopeFor !== "function") return null;
    try {
      const unscoped = (this.baseKlass as any).unscoped?.();
      return unscoped ? (refl.scopeFor(unscoped) ?? null) : null;
    } catch {
      return null;
    }
  }
}

function nodeReferencesTable(node: Nodes.Node, tableName: string): boolean {
  let found = false;
  fetchAttribute(node, (attr: Nodes.Node): boolean => {
    if (attr instanceof Nodes.Attribute) {
      const rel = attr.relation;
      if (String(rel.tableAlias ?? rel.name) === tableName) {
        found = true;
        return false;
      }
    }
    return !found;
  });
  return found;
}

/** @internal */
function appendConstraints(join: unknown, constraints: unknown[]): Nodes.Node | null {
  void Nodes.StringJoin;
  if (!join || !constraints.length) return join as Nodes.Node | null;
  constraints = constraints.filter((c): c is Nodes.Node => c instanceof Nodes.Node);
  if (!constraints.length) return join as Nodes.Node | null;
  const joinAny = join as any;
  if (join instanceof Nodes.StringJoin) {
    const joinString = new Nodes.And([joinAny.left, ...constraints]);
    return new Nodes.StringJoin(joinString);
  } else if (joinAny.right?.expr instanceof Nodes.Node) {
    const right = joinAny.right;
    return new (join as any).constructor(
      joinAny.left,
      new Nodes.On(new Nodes.And([right.expr, ...constraints])),
    );
  }
  return join as Nodes.Node | null;
}
