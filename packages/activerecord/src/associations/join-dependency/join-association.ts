import type { Base } from "../../base.js";
import * as Arel from "@blazetrails/arel";
import { Nodes, Table, fetchAttribute } from "@blazetrails/arel";
import type { AbstractReflection, ConcreteReflection } from "../../reflection.js";
import { JoinPart } from "./join-part.js";
import type { AliasTracker } from "../alias-tracker.js";
import { extractBang } from "@blazetrails/activesupport";
import { first, isEmpty, rbEqual, rtest, union } from "@blazetrails/ruby-compat";

type JoinType = typeof Nodes.InnerJoin | typeof Nodes.OuterJoin;
type TableResolver = (
  reflection: AbstractReflection,
  remainingChain: AbstractReflection[],
) => [Table | Nodes.TableAlias, boolean];

export class JoinAssociation extends JoinPart {
  readonly reflection: AbstractReflection;
  private _table: Table | Nodes.TableAlias | null = null;
  readonly tables: (Table | Nodes.TableAlias)[] | null = null;
  declare private _readonly?: unknown;
  declare private _strictLoading?: unknown;

  constructor(reflection: AbstractReflection, children?: JoinAssociation[]) {
    super(reflection.klass, children);
    this.reflection = reflection;
  }

  get table(): Table | Nodes.TableAlias | null {
    return this._table;
  }

  set table(value: Table | Nodes.TableAlias | null) {
    this._table = value;
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

  joinConstraints(
    foreignTable: Table | Nodes.TableAlias,
    foreignKlass: typeof Base,
    joinType: JoinType,
    aliasTracker: AliasTracker,
    block: TableResolver,
  ): Nodes.Node[] {
    const joins: Nodes.Node[] = [];
    const chain: [AbstractReflection, Table | Nodes.TableAlias][] = [];

    const reflectionChain = this.reflection.chain;
    for (const [index, reflection] of reflectionChain.entries()) {
      const [table, terminated] = block(reflection, reflectionChain.slice(index));
      this._table ||= table;

      if (rtest(terminated)) {
        foreignTable = table;
        foreignKlass = reflection.klass;
        break;
      }

      chain.push([reflection, table]);
    }

    for (const [reflection, table] of chain.reverse()) {
      const klass = reflection.klass;

      const scope = reflection.joinScope(table, foreignTable, foreignKlass);

      if (!isEmpty(scope.referencesValues)) {
        const associations = union(scope.eagerLoadValues, scope.includesValues);

        if (!isEmpty(associations)) {
          scope.joinsBang(scope.constructJoinDependency(associations, Nodes.OuterJoin));
        }
      }

      const arel = scope.arel(aliasTracker);
      const nodes: Nodes.And["children"][number] = first(arel.constraints)!;

      let others: Nodes.And["children"] | undefined;
      if (nodes instanceof Nodes.And) {
        others = extractBang(
          nodes.children,
          (node) => !fetchAttribute(node, (attr) => rbEqual(attr.relation.name, table.name)),
        );
      }

      joins.push(new joinType(table, new Nodes.On(nodes)));

      if (others != null && !isEmpty(others)) {
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

  isReadonly(): unknown {
    if (Object.hasOwn(this, "_readonly")) return this._readonly;

    const reflection = this.reflection as AbstractReflection & ConcreteReflection;
    return (this._readonly =
      reflection.scope && reflection.scopeFor(this.baseKlass.unscoped()).readonlyValue);
  }

  isStrictLoading(): unknown {
    if (Object.hasOwn(this, "_strictLoading")) return this._strictLoading;

    const reflection = this.reflection as AbstractReflection & ConcreteReflection;
    return (this._strictLoading =
      reflection.scope && reflection.scopeFor(this.baseKlass.unscoped()).strictLoadingValue);
  }
}

/** @internal */
function appendConstraints(join: unknown, constraints: unknown[]): Nodes.Node | null {
  void Nodes.StringJoin;
  if (!join || !constraints.length) return join as Nodes.Node | null;
  constraints = constraints.filter(Arel.arelNode);
  if (!constraints.length) return join as Nodes.Node | null;
  const joinAny = join as any;
  if (join instanceof Nodes.StringJoin) {
    const joinString = new Nodes.And([joinAny.left, ...constraints]);
    return new Nodes.StringJoin(joinString);
  } else if (Arel.arelNode(joinAny.right?.expr)) {
    const right = joinAny.right;
    return new (join as any).constructor(
      joinAny.left,
      new Nodes.On(new Nodes.And([right.expr, ...constraints])),
    );
  }
  return join as Nodes.Node | null;
}
